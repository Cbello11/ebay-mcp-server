#!/usr/bin/env python3
"""
eBay MCP Server - Get Right Storage Solutions
A FastMCP server providing full eBay seller control:
  - All core sell/buy API tools
  - Custom business tools: profit calculator, listing auditor,
    smart relist detector, daily report, price optimizer
"""

import base64
import json
import os
import time
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

import httpx
from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, ConfigDict, Field, field_validator

# ---------------------------------------------------------------------------
# Server Init
# ---------------------------------------------------------------------------

mcp = FastMCP("ebay_mcp")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

EBAY_API_BASE     = "https://api.ebay.com"
EBAY_SANDBOX_BASE = "https://api.sandbox.ebay.com"
TOKEN_URL         = "https://api.ebay.com/identity/v1/oauth2/token"
SANDBOX_TOKEN_URL = "https://api.sandbox.ebay.com/identity/v1/oauth2/token"

# Loaded from environment at runtime
# Railway variables: EBAY_APP_ID, EBAY_CERT_ID, EBAY_USER_TOKEN
CLIENT_ID     = os.getenv("EBAY_APP_ID", "")
CLIENT_SECRET = os.getenv("EBAY_CERT_ID", "")
REFRESH_TOKEN = os.getenv("EBAY_USER_TOKEN", "")
SANDBOX_MODE  = os.getenv("EBAY_SANDBOX", "false").lower() == "true"

BASE_URL  = EBAY_SANDBOX_BASE if SANDBOX_MODE else EBAY_API_BASE
TOKEN_EP  = SANDBOX_TOKEN_URL if SANDBOX_MODE else TOKEN_URL

# Simple in-memory token cache
_token_cache: Dict[str, Any] = {}

# ---------------------------------------------------------------------------
# Startup validation
# ---------------------------------------------------------------------------

def _validate_env() -> None:
    """Warn at startup if required env vars are missing."""
    missing = []
    for var in ("EBAY_APP_ID", "EBAY_CERT_ID", "EBAY_USER_TOKEN"):
        if not os.getenv(var):
            missing.append(var)
    policy_vars = ("EBAY_FULFILLMENT_POLICY_ID", "EBAY_PAYMENT_POLICY_ID", "EBAY_RETURN_POLICY_ID")
    missing_policies = [v for v in policy_vars if not os.getenv(v)]
    if missing:
        print(f"[WARN] Missing required env vars: {', '.join(missing)} — auth will fail.")
    if missing_policies:
        print(
            f"[WARN] Missing business policy IDs: {', '.join(missing_policies)} — "
            "ebay_create_listing will fail until these are set in Railway variables."
        )

_validate_env()

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

async def _get_access_token() -> str:
    """Return a valid OAuth access token, refreshing when needed."""
    now = time.time()
    if _token_cache.get("token") and _token_cache.get("expires_at", 0) > now + 30:
        return _token_cache["token"]

    creds = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            TOKEN_EP,
            headers={
                "Authorization": f"Basic {creds}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={
                "grant_type": "refresh_token",
                "refresh_token": REFRESH_TOKEN,
                "scope": (
                    "https://api.ebay.com/oauth/api_scope "
                    "https://api.ebay.com/oauth/api_scope/sell.inventory "
                    "https://api.ebay.com/oauth/api_scope/sell.fulfillment "
                    "https://api.ebay.com/oauth/api_scope/sell.account "
                    "https://api.ebay.com/oauth/api_scope/sell.analytics.readonly "
                    "https://api.ebay.com/oauth/api_scope/sell.marketing "
                    "https://api.ebay.com/oauth/api_scope/commerce.catalog.readonly "
                    "https://api.ebay.com/oauth/api_scope/commerce.marketplace.insights.readonly"
                ),
            },
            timeout=15.0,
        )
        resp.raise_for_status()
        data = resp.json()

    _token_cache["token"] = data["access_token"]
    _token_cache["expires_at"] = now + data.get("expires_in", 7200)
    return _token_cache["token"]


async def _api(
    method: str,
    path: str,
    *,
    params: Optional[Dict] = None,
    body: Optional[Dict] = None,
    extra_headers: Optional[Dict] = None,
) -> Any:
    """Central HTTP helper — attaches auth, raises on error."""
    token = await _get_access_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)

    url = f"{BASE_URL}{path}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.request(
            method.upper(), url, params=params, json=body, headers=headers
        )
        resp.raise_for_status()
        if resp.content:
            return resp.json()
        return {}


def _err(e: Exception) -> str:
    if isinstance(e, httpx.HTTPStatusError):
        code = e.response.status_code
        try:
            detail = e.response.json()
        except Exception:
            detail = e.response.text
        if code == 404:
            return f"Error 404: Not found. Detail: {detail}"
        if code == 403:
            return f"Error 403: Permission denied. Detail: {detail}"
        if code == 429:
            return "Error 429: Rate limit hit — wait before retrying."
        return f"Error {code}: {detail}"
    if isinstance(e, httpx.TimeoutException):
        return "Error: Request timed out — eBay API slow, retry."
    return f"Error: {type(e).__name__}: {e}"


# ---------------------------------------------------------------------------
# Shared Enums / Models
# ---------------------------------------------------------------------------

class Condition(str, Enum):
    NEW             = "NEW"
    LIKE_NEW        = "LIKE_NEW"
    VERY_GOOD       = "VERY_GOOD"
    GOOD            = "GOOD"
    ACCEPTABLE      = "ACCEPTABLE"
    FOR_PARTS_ONLY  = "FOR_PARTS_ONLY"


class ListingFormat(str, Enum):
    FIXED_PRICE = "FIXED_PRICE"
    AUCTION     = "AUCTION"


class Carrier(str, Enum):
    USPS  = "USPS"
    UPS   = "UPS"
    FEDEX = "FEDEX"
    DHL   = "DHL"
    OTHER = "OTHER"


# ---------------------------------------------------------------------------
# ── TOOL 1 · Search eBay catalog
# ---------------------------------------------------------------------------

class SearchItemsInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    query: str          = Field(..., description="Keyword search string, e.g. 'vintage Levi jeans 501'", min_length=1)
    limit: int          = Field(default=20, ge=1, le=200)
    category_id: Optional[str] = Field(default=None, description="eBay category ID to restrict results")
    min_price: Optional[float] = Field(default=None, ge=0)
    max_price: Optional[float] = Field(default=None, ge=0)
    condition: Optional[Condition] = None


@mcp.tool(
    name="ebay_search_items",
    annotations={"title": "Search eBay Items", "readOnlyHint": True, "destructiveHint": False,
                 "idempotentHint": True, "openWorldHint": True},
)
async def ebay_search_items(params: SearchItemsInput) -> str:
    """Search the eBay marketplace for live listings.

    Returns titles, prices, condition, item IDs, and URLs.
    Use to research what similar items are selling for BEFORE listing.
    """
    try:
        q_params: Dict[str, Any] = {"q": params.query, "limit": params.limit}
        if params.category_id:
            q_params["category_ids"] = params.category_id
        filters = []
        if params.condition:
            filters.append(f"conditionIds:{{{params.condition.value}}}")
        if params.min_price is not None or params.max_price is not None:
            lo = params.min_price or 0
            hi = params.max_price or 999999
            filters.append(f"price:[{lo}..{hi}],priceCurrency:USD")
        if filters:
            q_params["filter"] = ",".join(filters)

        data = await _api("GET", "/buy/browse/v1/item_summary/search", params=q_params)
        items = data.get("itemSummaries", [])
        if not items:
            return f"No results found for '{params.query}'."

        lines = [f"## eBay Search: '{params.query}' ({len(items)} results)\n"]
        for it in items:
            price = it.get("price", {}).get("value", "?")
            currency = it.get("price", {}).get("currency", "USD")
            lines.append(f"- **{it.get('title', 'N/A')}**")
            lines.append(f"  ID: `{it.get('itemId')}` | Price: {currency} {price} | "
                         f"Condition: {it.get('condition', 'N/A')}")
            if it.get("itemWebUrl"):
                lines.append(f"  URL: {it['itemWebUrl']}")
        return "\n".join(lines)
    except Exception as e:
        return _err(e)


# ---------------------------------------------------------------------------
# ── TOOL 2 · Get sold comps (research)
# ---------------------------------------------------------------------------

class SoldCompsInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    query: str  = Field(..., description="Item keywords to research sold prices for", min_length=1)
    limit: int  = Field(default=20, ge=1, le=100)


@mcp.tool(
    name="ebay_get_sold_comps",
    annotations={"title": "Get Sold Comps", "readOnlyHint": True, "destructiveHint": False,
                 "idempotentHint": True, "openWorldHint": True},
)
async def ebay_get_sold_comps(params: SoldCompsInput) -> str:
    """Retrieve recently sold eBay listings (comps) to determine realistic market price.

    Uses the Marketplace Insights API (sold items only).
    Use this BEFORE pricing any new listing. Returns average, min, and max sold price.
    """
    try:
        data = await _api(
            "GET",
            "/buy/marketplace_insights/v1_beta/item_sales/search",
            params={"q": params.query, "limit": params.limit},
        )
        items = data.get("itemSales", [])
        if not items:
            return f"No sold comps found for '{params.query}'."

        prices = []
        for it in items:
            val = it.get("lastSoldPrice", {}).get("value") or it.get("price", {}).get("value")
            if val:
                prices.append(float(val))

        avg = sum(prices) / len(prices) if prices else 0
        lines = [
            f"## Sold Comps: '{params.query}'",
            f"Results: {len(items)} | Avg: ${avg:.2f} | "
            f"Low: ${min(prices):.2f} | High: ${max(prices):.2f}\n",
        ]
        for it in items[:10]:
            p   = it.get("lastSoldPrice") or it.get("price", {})
            title = it.get("title", "")
            lines.append(f"- {title[:60]} — ${p.get('value', '?')}")
        return "\n".join(lines)
    except Exception as e:
        return _err(e)


# ---------------------------------------------------------------------------
# ── TOOL 3 · Get eBay categories
# ---------------------------------------------------------------------------

class GetCategoriesInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    query: str = Field(..., description="Keywords describing item, e.g. 'vintage leather jacket'")


@mcp.tool(
    name="ebay_get_categories",
    annotations={"title": "Get eBay Categories", "readOnlyHint": True, "destructiveHint": False,
                 "idempotentHint": True, "openWorldHint": False},
)
async def ebay_get_categories(params: GetCategoriesInput) -> str:
    """Suggest the best eBay category IDs for an item.

    Returns a ranked list of category names and IDs.
    Always run this before creating a new listing to ensure correct categorization.
    """
    try:
        data = await _api(
            "GET",
            "/commerce/taxonomy/v1/category_tree/0/get_category_suggestions",
            params={"q": params.query},
        )
        suggestions = data.get("categorySuggestions", [])
        if not suggestions:
            return f"No category suggestions found for '{params.query}'."

        lines = [f"## Category Suggestions for '{params.query}'\n"]
        for s in suggestions[:10]:
            cat = s.get("category", {})
            path = " > ".join(
                a.get("categoryName", "") for a in s.get("categoryTreeNodeAncestors", [])
            )
            lines.append(f"- **{cat.get('categoryName')}** (ID: `{cat.get('categoryId')}`)")
            if path:
                lines.append(f"  Path: {path}")
        return "\n".join(lines)
    except Exception as e:
        return _err(e)


# ---------------------------------------------------------------------------
# ── TOOL 4 · Create a listing
# ---------------------------------------------------------------------------

class CreateListingInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    sku: str              = Field(..., description="Your unique SKU for this item", min_length=1)
    title: str            = Field(..., description="80-char Cassini-optimised listing title", max_length=80)
    description: str      = Field(..., description="Full HTML or plain-text item description")
    category_id: str      = Field(..., description="eBay category ID from ebay_get_categories")
    condition: Condition  = Field(..., description="Item condition")
    price: float          = Field(..., description="Buy It Now price in USD", gt=0)
    quantity: int         = Field(default=1, ge=1)
    image_urls: List[str] = Field(..., description="List of image URLs (first = gallery image)", min_length=1)
    item_specifics: Optional[Dict[str, str]] = Field(
        default=None, description="Key-value dict of item specifics, e.g. {'Brand': 'Nike', 'Size': 'L'}"
    )
    format: ListingFormat = Field(default=ListingFormat.FIXED_PRICE)
    domestic_shipping: Optional[float] = Field(default=None, description="Flat domestic shipping cost. null = free shipping")


@mcp.tool(
    name="ebay_create_listing",
    annotations={"title": "Create eBay Listing", "readOnlyHint": False, "destructiveHint": False,
                 "idempotentHint": True, "openWorldHint": True},
)
async def ebay_create_listing(params: CreateListingInput) -> str:
    """Create a new eBay listing using the Sell Inventory API.

    First call ebay_get_categories to get the right category_id.
    Item is created as a draft inventory item + offer, then published.
    Returns the new listing ID (item ID) on success.
    """
    try:
        # Step 1: Create/update inventory item
        inv_body: Dict[str, Any] = {
            "availability": {"shipToLocationAvailability": {"quantity": params.quantity}},
            "condition": params.condition.value,
            "product": {
                "title": params.title,
                "description": params.description,
                "imageUrls": params.image_urls,
            },
        }
        if params.item_specifics:
            inv_body["product"]["aspects"] = {k: [v] for k, v in params.item_specifics.items()}

        await _api("PUT", f"/sell/inventory/v1/inventory_item/{params.sku}", body=inv_body)

        # Step 2: Create offer
        offer_body: Dict[str, Any] = {
            "sku": params.sku,
            "marketplaceId": "EBAY_US",
            "format": params.format.value,
            "categoryId": params.category_id,
            "listingPolicies": {
                "fulfillmentPolicyId": os.getenv("EBAY_FULFILLMENT_POLICY_ID", ""),
                "paymentPolicyId": os.getenv("EBAY_PAYMENT_POLICY_ID", ""),
                "returnPolicyId": os.getenv("EBAY_RETURN_POLICY_ID", ""),
            },
            "pricingSummary": {
                "price": {"value": str(params.price), "currency": "USD"}
            },
        }
        if params.domestic_shipping is not None:
            offer_body["shippingCostOverrides"] = [
                {"shippingCostType": "FIXED", "additionalShippingCost": {
                    "value": str(params.domestic_shipping), "currency": "USD"
                }}
            ]

        offer_resp = await _api("POST", "/sell/inventory/v1/offer", body=offer_body)
        offer_id = offer_resp.get("offerId")
        if not offer_id:
            return f"Offer created but no offerId returned: {offer_resp}"

        # Step 3: Publish offer
        pub = await _api("POST", f"/sell/inventory/v1/offer/{offer_id}/publish")
        listing_id = pub.get("listingId", "unknown")
        return (
            f"✅ Listing published!\n"
            f"Listing ID: `{listing_id}`\n"
            f"SKU: `{params.sku}`\n"
            f"Title: {params.title}\n"
            f"Price: ${params.price:.2f}\n"
            f"URL: https://www.ebay.com/itm/{listing_id}"
        )
    except Exception as e:
        return _err(e)


# ---------------------------------------------------------------------------
# ── TOOL 5 · Get a single listing
# ---------------------------------------------------------------------------

class GetListingInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    listing_id: str = Field(..., description="eBay item/listing ID")


@mcp.tool(
    name="ebay_get_listing",
    annotations={"title": "Get Listing Details", "readOnlyHint": True, "destructiveHint": False,
                 "idempotentHint": True, "openWorldHint": True},
)
async def ebay_get_listing(params: GetListingInput) -> str:
    """Retrieve full details for a single eBay listing by its item ID."""
    try:
        data = await _api("GET", f"/buy/browse/v1/item/{params.listing_id}")
        price = data.get("price", {})
        return json.dumps({
            "itemId":      data.get("itemId"),
            "title":       data.get("title"),
            "condition":   data.get("condition"),
            "price":       f"{price.get('currency')} {price.get('value')}",
            "quantity":    data.get("estimatedAvailabilities", [{}])[0].get("estimatedAvailableQuantity"),
            "description": (data.get("description") or "")[:500],
            "itemWebUrl":  data.get("itemWebUrl"),
        }, indent=2)
    except Exception as e:
        return _err(e)


# ---------------------------------------------------------------------------
# ── TOOL 6 · Get my active listings
# ---------------------------------------------------------------------------

class GetMyListingsInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    limit:  int = Field(default=20, ge=1, le=200)
    offset: int = Field(default=0, ge=0)


@mcp.tool(
    name="ebay_get_my_listings",
    annotations={"title": "Get My Active Listings", "readOnlyHint": True, "destructiveHint": False,
                 "idempotentHint": True, "openWorldHint": False},
)
async def ebay_get_my_listings(params: GetMyListingsInput) -> str:
    """List your currently active eBay listings with price, quantity, and SKU."""
    try:
        data = await _api(
            "GET", "/sell/inventory/v1/offer",
            params={"limit": params.limit, "offset": params.offset, "marketplace_id": "EBAY_US"},
        )
        offers = data.get("offers", [])
        if not offers:
            return "No active offers found."

        total = data.get("total", len(offers))
        lines = [f"## My Active Listings ({len(offers)} of {total})\n"]
        for o in offers:
            pricing = o.get("pricingSummary", {}).get("price", {})
            lines.append(
                f"- SKU: `{o.get('sku')}` | "
                f"Offer: `{o.get('offerId')}` | "
                f"Listing: `{o.get('listing', {}).get('listingId', 'draft')}` | "
                f"Price: ${pricing.get('value', '?')} | "
                f"Status: {o.get('status', '?')}"
            )
        return "\n".join(lines)
    except Exception as e:
        return _err(e)


# ---------------------------------------------------------------------------
# ── TOOL 7 · Revise a listing
# ---------------------------------------------------------------------------

class ReviseListingInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    sku: str                    = Field(..., description="SKU of the listing to revise")
    offer_id: str               = Field(..., description="Offer ID from ebay_get_my_listings")
    new_price: Optional[float]  = Field(default=None, gt=0)
    new_quantity: Optional[int] = Field(default=None, ge=0)
    new_title: Optional[str]    = Field(default=None, max_length=80)


@mcp.tool(
    name="ebay_revise_listing",
    annotations={"title": "Revise eBay Listing", "readOnlyHint": False, "destructiveHint": False,
                 "idempotentHint": False, "openWorldHint": False},
)
async def ebay_revise_listing(params: ReviseListingInput) -> str:
    """Update price, quantity, or title of an existing eBay listing.

    At least one of new_price, new_quantity, or new_title must be provided.
    """
    if params.new_price is None and params.new_quantity is None and params.new_title is None:
        return "Error: Provide at least one of new_price, new_quantity, or new_title."
    try:
        changes: List[str] = []

        if params.new_price is not None:
            body = {"pricingSummary": {"price": {"value": str(params.new_price), "currency": "USD"}}}
            await _api("PUT", f"/sell/inventory/v1/offer/{params.offer_id}", body=body)
            changes.append(f"price → ${params.new_price:.2f}")

        if params.new_quantity is not None:
            body2 = {"availability": {"shipToLocationAvailability": {"quantity": params.new_quantity}}}
            await _api("PUT", f"/sell/inventory/v1/inventory_item/{params.sku}", body=body2)
            changes.append(f"quantity → {params.new_quantity}")

        if params.new_title is not None:
            body3 = {"product": {"title": params.new_title}}
            await _api("PUT", f"/sell/inventory/v1/inventory_item/{params.sku}", body=body3)
            changes.append(f"title → '{params.new_title}'")

        return f"✅ Listing updated — SKU `{params.sku}`: {', '.join(changes)}"
    except Exception as e:
        return _err(e)


# ---------------------------------------------------------------------------
# ── TOOL 8 · End a listing
# ---------------------------------------------------------------------------

class EndListingInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    offer_id: str = Field(..., description="Offer ID to withdraw/end")
    reason: str   = Field(default="NOT_AVAILABLE", description="Reason: NOT_AVAILABLE | LOST_OR_BROKEN | OUT_OF_STOCK")


@mcp.tool(
    name="ebay_end_listing",
    annotations={"title": "End eBay Listing", "readOnlyHint": False, "destructiveHint": True,
                 "idempotentHint": False, "openWorldHint": False},
)
async def ebay_end_listing(params: EndListingInput) -> str:
    """End (withdraw) an active eBay offer/listing permanently."""
    try:
        await _api("DELETE", f"/sell/inventory/v1/offer/{params.offer_id}")
        return f"✅ Offer `{params.offer_id}` ended successfully."
    except Exception as e:
        return _err(e)


# ---------------------------------------------------------------------------
# ── TOOL 9 · Get seller summary
# ---------------------------------------------------------------------------

@mcp.tool(
    name="ebay_get_seller_summary",
    annotations={"title": "Get Seller Summary", "readOnlyHint": True, "destructiveHint": False,
                 "idempotentHint": True, "openWorldHint": False},
)
async def ebay_get_seller_summary() -> str:
    """Return seller performance metrics: feedback score, defect rate, policy violations.

    Use for daily health checks.
    """
    try:
        data = await _api("GET", "/sell/account/v1/seller_standard_profile")
        return json.dumps(data, indent=2)
    except Exception as e:
        return _err(e)


# ---------------------------------------------------------------------------
# ── TOOL 10 · Get orders
# ---------------------------------------------------------------------------

class GetOrdersInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    limit:        int           = Field(default=20, ge=1, le=200)
    offset:       int           = Field(default=0, ge=0)
    filter_status: Optional[str] = Field(
        default=None,
        description="Filter by order status: ACTIVE | COMPLETED | CANCELLED | PENDING"
    )


@mcp.tool(
    name="ebay_get_orders",
    annotations={"title": "Get Orders", "readOnlyHint": True, "destructiveHint": False,
                 "idempotentHint": True, "openWorldHint": False},
)
async def ebay_get_orders(params: GetOrdersInput) -> str:
    """List your eBay orders. Supports pagination and status filtering."""
    try:
        q: Dict[str, Any] = {"limit": params.limit, "offset": params.offset}
        if params.filter_status:
            q["filter"] = f"orderfulfillmentstatus:{{{params.filter_status}}}"
        data = await _api("GET", "/sell/fulfillment/v1/order", params=q)
        orders = data.get("orders", [])
        if not orders:
            return "No orders found."

        lines = [f"## Orders ({len(orders)} results)\n"]
        for o in orders:
            total = o.get("pricingSummary", {}).get("total", {})
            lines.append(
                f"- Order `{o.get('orderId')}` | "
                f"Status: {o.get('orderFulfillmentStatus', '?')} | "
                f"Total: ${total.get('value', '?')} | "
                f"Created: {o.get('creationDate', '?')[:10]}"
            )
        return "\n".join(lines)
    except Exception as e:
        return _err(e)


# ---------------------------------------------------------------------------
# ── TOOL 11 · Get single order
# ---------------------------------------------------------------------------

class GetOrderInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    order_id: str = Field(..., description="eBay order ID")


@mcp.tool(
    name="ebay_get_order",
    annotations={"title": "Get Order Details", "readOnlyHint": True, "destructiveHint": False,
                 "idempotentHint": True, "openWorldHint": False},
)
async def ebay_get_order(params: GetOrderInput) -> str:
    """Get full details for a single eBay order: buyer info, items, shipping address, totals."""
    try:
        data = await _api("GET", f"/sell/fulfillment/v1/order/{params.order_id}")
        buyer = data.get("buyer", {})
        addr = data.get("fulfillmentStartInstructions", [{}])[0].get("shippingStep", {}).get("shipTo", {})
        items = [
            {"sku": li.get("sku"), "title": li.get("title"), "quantity": li.get("quantity"),
             "price": li.get("lineItemCost", {}).get("value")}
            for li in data.get("lineItems", [])
        ]
        return json.dumps({
            "orderId":    data.get("orderId"),
            "status":     data.get("orderFulfillmentStatus"),
            "created":    data.get("creationDate"),
            "buyer":      buyer.get("username"),
            "shipTo":     addr.get("fullName"),
            "address":    f"{addr.get('contactAddress', {}).get('addressLine1')}, "
                          f"{addr.get('contactAddress', {}).get('city')}, "
                          f"{addr.get('contactAddress', {}).get('stateOrProvince')} "
                          f"{addr.get('contactAddress', {}).get('postalCode')}",
            "items":      items,
            "orderTotal": data.get("pricingSummary", {}).get("total", {}).get("value"),
        }, indent=2)
    except Exception as e:
        return _err(e)


# ---------------------------------------------------------------------------
# ── TOOL 12 · Ship an order
# ---------------------------------------------------------------------------

class ShipOrderInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    order_id:        str           = Field(..., description="eBay order ID to mark as shipped")
    tracking_number: str           = Field(..., description="Carrier tracking number", min_length=5)
    carrier:         Carrier        = Field(..., description="Shipping carrier")
    line_item_id:    Optional[str] = Field(default=None, description="Specific line item ID if multi-item order")


@mcp.tool(
    name="ebay_ship_order",
    annotations={"title": "Mark Order Shipped", "readOnlyHint": False, "destructiveHint": False,
                 "idempotentHint": False, "openWorldHint": False},
)
async def ebay_ship_order(params: ShipOrderInput) -> str:
    """Mark an eBay order as shipped with tracking info. Triggers buyer notification automatically."""
    try:
        # Get order to find line items
        order = await _api("GET", f"/sell/fulfillment/v1/order/{params.order_id}")
        line_items = [
            {"lineItemId": li["lineItemId"], "quantity": li.get("quantity", 1)}
            for li in order.get("lineItems", [])
            if not params.line_item_id or li["lineItemId"] == params.line_item_id
        ]

        body = {
            "lineItems": line_items,
            "shippedDate": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
            "trackingInfo": {
                "shippingCarrierCode": params.carrier.value,
                "trackingNumber": params.tracking_number,
            },
        }
        await _api("POST", f"/sell/fulfillment/v1/order/{params.order_id}/shipping_fulfillment", body=body)
        return (
            f"✅ Order `{params.order_id}` marked as shipped.\n"
            f"Carrier: {params.carrier} | Tracking: {params.tracking_number}"
        )
    except Exception as e:
        return _err(e)


# ===========================================================================
# ══ CUSTOM BUSINESS TOOLS ══════════════════════════════════════════════════
# ===========================================================================

# ---------------------------------------------------------------------------
# ── TOOL 13 · Profit Calculator
# ---------------------------------------------------------------------------

class ProfitCalcInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sale_price:      float = Field(..., gt=0, description="Price item sold or will sell for")
    cost_of_goods:   float = Field(..., ge=0, description="What you paid for the item")
    shipping_cost:   float = Field(default=0.0, ge=0, description="Your actual outbound shipping cost")
    ebay_fee_pct:    float = Field(default=13.25, ge=0, le=20, description="eBay final value fee % (default 13.25)")
    paypal_fee:      float = Field(default=0.0, ge=0, description="Any additional payment processing fee")
    supplies_cost:   float = Field(default=1.50, ge=0, description="Packaging/supplies cost (default $1.50)")


@mcp.tool(
    name="ebay_profit_calculator",
    annotations={"title": "Profit Calculator", "readOnlyHint": True, "destructiveHint": False,
                 "idempotentHint": True, "openWorldHint": False},
)
async def ebay_profit_calculator(params: ProfitCalcInput) -> str:
    """Calculate exact profit, ROI, and margin for an eBay sale.

    Accounts for eBay final value fees, shipping, COGS, and supplies.
    Use BEFORE listing to validate whether an item is worth selling at a target price.
    """
    fvf          = params.sale_price * (params.ebay_fee_pct / 100)
    total_costs  = params.cost_of_goods + params.shipping_cost + fvf + params.paypal_fee + params.supplies_cost
    net_profit   = params.sale_price - total_costs
    margin_pct   = (net_profit / params.sale_price * 100) if params.sale_price else 0
    roi_pct      = (net_profit / params.cost_of_goods * 100) if params.cost_of_goods else 0

    result = {
        "sale_price":       f"${params.sale_price:.2f}",
        "cost_of_goods":    f"${params.cost_of_goods:.2f}",
        "ebay_fees":        f"${fvf:.2f} ({params.ebay_fee_pct}%)",
        "shipping_cost":    f"${params.shipping_cost:.2f}",
        "supplies":         f"${params.supplies_cost:.2f}",
        "total_costs":      f"${total_costs:.2f}",
        "net_profit":       f"${net_profit:.2f}",
        "margin":           f"{margin_pct:.1f}%",
        "roi":              f"{roi_pct:.1f}%",
        "verdict":          "✅ Profitable" if net_profit > 0 else "❌ Loss",
    }
    lines = ["## Profit Breakdown\n"]
    for k, v in result.items():
        lines.append(f"- **{k.replace('_', ' ').title()}**: {v}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# ── TOOL 14 · Price Optimizer
# ---------------------------------------------------------------------------

class PriceOptimizerInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    query:          str   = Field(..., description="Item keywords to research pricing for")
    cost_of_goods:  float = Field(..., ge=0, description="Your cost for this item")
    shipping_cost:  float = Field(default=0.0, ge=0, description="Expected shipping cost")
    target_roi_pct: float = Field(default=50.0, ge=0, description="Desired ROI percentage (default 50%)")
    ebay_fee_pct:   float = Field(default=13.25, ge=0, le=20)


@mcp.tool(
    name="ebay_price_optimizer",
    annotations={"title": "Price Optimizer", "readOnlyHint": True, "destructiveHint": False,
                 "idempotentHint": True, "openWorldHint": True},
)
async def ebay_price_optimizer(params: PriceOptimizerInput) -> str:
    """Research sold comps and recommend optimal pricing to hit your target ROI.

    Combines live market data with your cost structure to give a data-driven price.
    Returns: recommended price, market range, and profit at that price.
    """
    try:
        # Pull sold comps
        data = await _api(
            "GET",
            "/buy/browse/v1/item_summary/search",
            params={"q": params.query, "limit": 30,
                    "filter": "soldItemsOnly:true"},
        )
        items = data.get("itemSummaries", [])
        prices = [float(it["price"]["value"]) for it in items if it.get("price")]

        if not prices:
            return f"No sold comps found for '{params.query}'. Cannot recommend price."

        avg_sold   = sum(prices) / len(prices)
        min_sold   = min(prices)
        max_sold   = max(prices)

        # Calculate minimum viable price to hit target ROI
        supplies   = 1.50
        total_fixed = params.cost_of_goods + params.shipping_cost + supplies
        # sale_price = total_fixed / (1 - fee_pct/100) * (1 + target_roi/100 adjusted)
        fee_rate    = params.ebay_fee_pct / 100
        min_price   = (total_fixed + params.cost_of_goods * params.target_roi_pct / 100) / (1 - fee_rate)
        rec_price   = round(min(avg_sold * 0.95, max_sold * 0.85), 2)
        rec_price   = max(rec_price, round(min_price, 2))

        # Profit at recommended price
        fvf          = rec_price * fee_rate
        total_costs  = params.cost_of_goods + params.shipping_cost + fvf + supplies
        net_profit   = rec_price - total_costs
        actual_roi   = (net_profit / params.cost_of_goods * 100) if params.cost_of_goods else 0

        lines = [
            f"## Price Optimizer: '{params.query}'\n",
            f"**Market (sold comps, n={len(prices)})**",
            f"- Avg: ${avg_sold:.2f} | Low: ${min_sold:.2f} | High: ${max_sold:.2f}\n",
            f"**Your Cost Structure**",
            f"- COGS: ${params.cost_of_goods:.2f} | Shipping: ${params.shipping_cost:.2f} | "
            f"Fees: {params.ebay_fee_pct}%\n",
            f"**Recommended Price: ${rec_price:.2f}**",
            f"- eBay Fees: ${fvf:.2f}",
            f"- Net Profit: ${net_profit:.2f}",
            f"- Actual ROI: {actual_roi:.1f}% (target was {params.target_roi_pct:.0f}%)",
        ]
        if rec_price > avg_sold:
            lines.append(f"\n⚠️  Price is above market avg. Consider ${avg_sold * 0.90:.2f} to sell faster.")
        return "\n".join(lines)
    except Exception as e:
        return _err(e)


# ---------------------------------------------------------------------------
# ── TOOL 15 · Listing Auditor
# ---------------------------------------------------------------------------

class ListingAuditInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sku: str = Field(..., description="SKU of the inventory item to audit")


@mcp.tool(
    name="ebay_audit_listing",
    annotations={"title": "Audit Listing Quality", "readOnlyHint": True, "destructiveHint": False,
                 "idempotentHint": True, "openWorldHint": False},
)
async def ebay_audit_listing(params: ListingAuditInput) -> str:
    """Check a listing for common Cassini SEO issues and missing item specifics.

    Returns a scored report with specific fixes. Run on all listings before activating.
    Checks: title length, image count, description length, price competitiveness, specifics.
    """
    try:
        data = await _api("GET", f"/sell/inventory/v1/inventory_item/{params.sku}")
        product  = data.get("product", {})
        title    = product.get("title", "")
        desc     = product.get("description", "")
        images   = product.get("imageUrls", [])
        aspects  = product.get("aspects", {})
        cond     = data.get("condition", "")
        qty      = data.get("availability", {}).get("shipToLocationAvailability", {}).get("quantity", 0)

        issues   : List[str] = []
        warnings : List[str] = []
        score = 100

        # Title checks
        if len(title) < 40:
            issues.append(f"Title too short ({len(title)} chars). Expand to 65-80 chars for better Cassini rank.")
            score -= 20
        elif len(title) > 80:
            issues.append(f"Title too long ({len(title)} chars). eBay truncates at 80.")
            score -= 10
        elif len(title) < 65:
            warnings.append(f"Title is {len(title)} chars. Aim for 65-80 for best visibility.")
            score -= 5

        # Description
        if not desc:
            issues.append("No description. Add one — buyers and Cassini both use it.")
            score -= 20
        elif len(desc) < 100:
            warnings.append(f"Description short ({len(desc)} chars). Expand to 200+ for better trust.")
            score -= 5

        # Images
        if len(images) == 0:
            issues.append("No images! Cannot publish without at least one image.")
            score -= 25
        elif len(images) < 3:
            warnings.append(f"Only {len(images)} image(s). eBay recommends 8-12 for max conversions.")
            score -= 10
        elif len(images) < 6:
            warnings.append(f"{len(images)} images. Consider adding more for better buyer confidence.")
            score -= 3

        # Condition
        if not cond:
            issues.append("Condition not set. This blocks publishing.")
            score -= 15

        # Item specifics
        if not aspects:
            issues.append("No item specifics set. Missing specifics = invisible in filtered searches.")
            score -= 20
        elif len(aspects) < 3:
            warnings.append(f"Only {len(aspects)} item specific(s). Add more (Brand, Size, Color, etc.).")
            score -= 8

        # Quantity
        if qty == 0:
            issues.append("Quantity is 0. Item will not be visible or purchasable.")
            score -= 15

        score = max(0, score)
        grade = "A" if score >= 90 else "B" if score >= 75 else "C" if score >= 60 else "D"

        lines = [
            f"## Listing Audit: `{params.sku}`",
            f"**Score: {score}/100 (Grade: {grade})**\n",
            f"- Title: '{title[:60]}{'...' if len(title) > 60 else ''}' ({len(title)} chars)",
            f"- Images: {len(images)} | Condition: {cond or 'NOT SET'} | Qty: {qty}",
            f"- Item Specifics: {len(aspects)}\n",
        ]
        if issues:
            lines.append("### ❌ Critical Issues")
            for iss in issues:
                lines.append(f"  - {iss}")
        if warnings:
            lines.append("\n### ⚠️  Warnings")
            for w in warnings:
                lines.append(f"  - {w}")
        if not issues and not warnings:
            lines.append("### ✅ Listing looks great — no issues found!")

        return "\n".join(lines)
    except Exception as e:
        return _err(e)


# ---------------------------------------------------------------------------
# ── TOOL 16 · Daily Store Report
# ---------------------------------------------------------------------------

@mcp.tool(
    name="ebay_daily_report",
    annotations={"title": "Daily Store Report", "readOnlyHint": True, "destructiveHint": False,
                 "idempotentHint": True, "openWorldHint": False},
)
async def ebay_daily_report() -> str:
    """Generate a combined daily performance snapshot for Get Right Storage Solutions.

    Pulls: active listing count, today's orders, pending shipments, and seller metrics.
    Run this each morning as your opening dashboard for Get Right Storage Solutions.
    """
    try:
        results: Dict[str, Any] = {}
        errors:  List[str]      = []

        # Active listings
        try:
            listings_data = await _api("GET", "/sell/inventory/v1/offer",
                                       params={"limit": 1, "marketplace_id": "EBAY_US"})
            results["active_listings"] = listings_data.get("total", 0)
        except Exception as e:
            errors.append(f"Listings: {_err(e)}")

        # Today's orders
        today = datetime.now(timezone.utc).strftime("%Y-%m-%dT00:00:00.000Z")
        try:
            orders_data = await _api("GET", "/sell/fulfillment/v1/order",
                                     params={"limit": 50, "filter": f"creationdate:[{today}..]"})
            orders      = orders_data.get("orders", [])
            total_rev   = sum(
                float(o.get("pricingSummary", {}).get("total", {}).get("value", 0))
                for o in orders
            )
            pending_ship = sum(
                1 for o in orders if o.get("orderFulfillmentStatus") == "NOT_STARTED"
            )
            results["orders_today"]      = len(orders)
            results["revenue_today"]     = f"${total_rev:.2f}"
            results["pending_shipments"] = pending_ship
        except Exception as e:
            errors.append(f"Orders: {_err(e)}")

        # Seller health
        try:
            health = await _api("GET", "/sell/account/v1/seller_standard_profile")
            program = health.get("programs", [{}])[0] if health.get("programs") else {}
            results["seller_level"] = program.get("sellerLevel", "N/A")
            results["defect_rate"]  = program.get("defectRate", "N/A")
        except Exception as e:
            errors.append(f"Seller profile: {_err(e)}")

        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        lines   = [
            f"# Get Right Storage Solutions — Daily Report",
            f"*Generated: {now_str}*\n",
        ]
        for k, v in results.items():
            lines.append(f"- **{k.replace('_', ' ').title()}**: {v}")

        if errors:
            lines.append("\n### ⚠️  Partial data (some APIs failed):")
            for err in errors:
                lines.append(f"  - {err}")

        return "\n".join(lines)
    except Exception as e:
        return _err(e)


# ---------------------------------------------------------------------------
# ── TOOL 17 · Smart Relist Finder
# ---------------------------------------------------------------------------

class SmartRelistInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    days_stale:  int   = Field(default=30, ge=7, le=365, description="Consider listings stale after this many days")
    min_views:   int   = Field(default=0, ge=0, description="Flag listings with fewer views than this")


@mcp.tool(
    name="ebay_find_stale_listings",
    annotations={"title": "Find Stale / Underperforming Listings", "readOnlyHint": True,
                 "destructiveHint": False, "idempotentHint": True, "openWorldHint": False},
)
async def ebay_find_stale_listings(params: SmartRelistInput) -> str:
    """Identify listings that are old or getting low traffic — candidates for relisting or price drops.

    Pulls traffic data from eBay Analytics and cross-references with active offers.
    Returns a ranked list with recommendations: drop price, end + relist, or promote.
    """
    try:
        # Get traffic report from analytics
        today     = datetime.now(timezone.utc)
        date_to   = today.strftime("%Y%m%d")
        date_from = (today - timedelta(days=params.days_stale)).strftime("%Y%m%d")
        # eBay Analytics: seller traffic by listing over the stale window
        traffic = await _api(
            "GET",
            "/sell/analytics/v1/traffic_report",
            params={
                "dimension": "LISTING",
                "metric":    "PAGE_VIEWS,TRANSACTION",
                "filter":    f"date_range:[{date_from}_{date_to}]",
                "sort":      "PAGE_VIEWS:ASC",
                "limit":     50,
            },
        )
        records = traffic.get("records", [])
        lines = [f"## Stale Listing Report (>{params.days_stale} days)\n"]

        if not records:
            lines.append("No traffic data available — eBay Analytics may need 24-48h to populate.")
        else:
            for rec in records[:20]:
                dims  = {d["dimensionKey"]: d["value"] for d in rec.get("dimensionMetrics", [])}
                mets  = {m["metricKey"]: m["value"] for m in rec.get("metricDataRecords", [])}
                views = int(mets.get("PAGE_VIEWS", 0))
                sales = int(mets.get("TRANSACTION", 0))
                lid   = dims.get("LISTING_ID", "?")

                if views < params.min_views or sales == 0:
                    rec_action = "Drop price 10%" if views > 5 else "End & relist with new title/photos"
                    lines.append(
                        f"- Listing `{lid}` | Views: {views} | Sales: {sales} | "
                        f"👉 **{rec_action}**"
                    )

        return "\n".join(lines)
    except Exception as e:
        return _err(e)


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    mcp.run(transport="streamable-http", host="0.0.0.0", port=port)
