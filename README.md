# eBay MCP Server v2.0

A complete 23-tool eBay seller automation MCP server built on the MCP TypeScript SDK.
Deployed on Railway at `getrightstoragesolutions.xyz`.

## Tools (23 total)

### Search & Discovery (5)
| Tool | Description |
|------|-------------|
| `ebay_search_listings` | Search active eBay listings by keyword/category/price |
| `ebay_get_category_suggestions` | Keyword → ranked leaf categories (Taxonomy API) |
| `ebay_get_item_aspects` | Required/recommended item specifics for a category |
| `ebay_search_sold_comps` | Sold price research (falls back to Browse if MI API denied) |
| `ebay_get_seller_summary` | Account overview: feedback, listings, seller level |

### Listings (7)
| Tool | Description |
|------|-------------|
| `ebay_get_my_listings` | All active listings with filters |
| `ebay_get_listing` | Full detail on one listing |
| `ebay_create_listing` | Create fixed-price listing (Inventory API) |
| `ebay_revise_listing` | Update title, price, specifics, images |
| `ebay_end_listing` | End a listing early |
| `ebay_get_promoted_listings` | View Promoted Listings campaigns |
| `ebay_update_promoted_listing` | Adjust ad rate on a listing |

### Orders & Fulfillment (3)
| Tool | Description |
|------|-------------|
| `ebay_get_orders` | All recent orders with filters |
| `ebay_get_order` | Full detail on one order |
| `ebay_ship_order` | Mark shipped with tracking number |

### Buyer Messages (2)
| Tool | Description |
|------|-------------|
| `ebay_get_messages` | Retrieve buyer messages/inquiries |
| `ebay_reply_to_message` | Reply to a buyer message |

### Returns (2)
| Tool | Description |
|------|-------------|
| `ebay_get_returns` | Open return requests |
| `ebay_respond_to_return` | Accept, decline, or refund a return |

### Feedback & Health (2)
| Tool | Description |
|------|-------------|
| `ebay_get_feedback` | Recent buyer feedback |
| `ebay_get_seller_standards` | Seller level and defect metrics |

### Policies & Locations (2)
| Tool | Description |
|------|-------------|
| `ebay_get_policies` | Payment/fulfillment/return business policies |
| `ebay_get_inventory_locations` | Warehouse/pickup locations for listings |

---

## Setup

### 1. eBay Developer Credentials
1. Go to [developer.ebay.com](https://developer.ebay.com)
2. Create a **Production** application keyset
3. Note your **App ID (Client ID)** and **Cert ID (Client Secret)**
4. Create a **RuName** under User Tokens → Get a Token for eBay Sellers
5. Generate a **User Token** with these scopes:
   - `sell.inventory`
   - `sell.fulfillment`
   - `sell.account`
   - `sell.marketing`
   - `sell.feedback`
   - `post-order`

### 2. Environment Variables (Railway)
Set these in Railway → Variables:
```
EBAY_CLIENT_ID=your-app-id
EBAY_CLIENT_SECRET=your-cert-id
EBAY_USER_TOKEN=v^1.1#i^1#...
EBAY_MARKETPLACE=EBAY_US
EBAY_SANDBOX=false
MCP_AUTH_TOKEN=optional-secret
```

### 3. Local Development
```bash
cp .env.example .env
# Fill in your credentials in .env
npm install
npm run build
npm start
```

### 4. Test the Endpoint
```bash
curl -X POST https://getrightstoragesolutions.xyz/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

### 5. Connect to Claude.ai
1. Go to **claude.ai → Customize → Connectors → + Add custom connector**
2. Paste: `https://getrightstoragesolutions.xyz/mcp`
3. If `MCP_AUTH_TOKEN` is set, add it under Advanced → Bearer token
4. Click **Add** — the eBay icon appears next to the + in chat

---

## Photo-to-Listing Workflow

1. Upload photo to Claude chat
2. Claude runs `product-identifier-vision-skill` to identify item
3. Claude calls `ebay_get_category_suggestions` to find the right category
4. Claude calls `ebay_get_item_aspects` to get required specifics
5. Claude calls `ebay_search_sold_comps` to price the item
6. Claude uses `listing-generator-skill` to build the full listing
7. Claude calls `ebay_create_listing` to publish it

---

## Architecture

```
src/
├── index.ts              # Express + MCP server entry point
├── services/
│   └── ebay-client.ts    # eBay API client, OAuth token management
└── tools/
    ├── search.ts         # Search & Discovery (5 tools)
    ├── listings.ts       # Listing management (7 tools)
    ├── orders.ts         # Orders & fulfillment (3 tools)
    ├── messages.ts       # Buyer messages (2 tools)
    ├── returns.ts        # Returns (2 tools)
    ├── feedback.ts       # Feedback & seller health (2 tools)
    └── policies.ts       # Business policies & locations (2 tools)
```
