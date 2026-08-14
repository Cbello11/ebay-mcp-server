/**
 * eBay MCP Server — Streamable HTTP transport for Railway deployment.
 *
 * POST /mcp  → MCP JSON-RPC endpoint (stateless, one transport per request)
 * GET  /     → health check
 */

import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { registerSearchTools }  from './tools/search.js';
import { registerListingTools } from './tools/listings.js';
import { registerOrderTools }   from './tools/orders.js';

// ─── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name:    'ebay-mcp-server',
  version: '1.0.0',
});

registerSearchTools(server);
registerListingTools(server);
registerOrderTools(server);

// ─── Express App ──────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// Optional bearer-token auth guard
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

function checkAuth(req: express.Request, res: express.Response): boolean {
  if (!MCP_AUTH_TOKEN) return true; // no auth configured
  const header = req.headers.authorization ?? '';
  if (header === `Bearer ${MCP_AUTH_TOKEN}`) return true;
  res.status(401).json({ error: 'Unauthorized' });
  return false;
}

// Health check
app.get('/', (_req, res) => {
  res.json({ status: 'ok', server: 'ebay-mcp-server', version: '1.0.0' });
});

// MCP endpoint — stateless: new transport per request
app.post('/mcp', async (req, res) => {
  if (!checkAuth(req, res)) return;

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,  // stateless
    enableJsonResponse:  true,
  });

  res.on('close', () => { transport.close().catch(() => undefined); });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  const sandbox = process.env.EBAY_SANDBOX === 'true' ? ' [SANDBOX]' : ' [PRODUCTION]';
  console.log(`eBay MCP Server listening on port ${PORT}${sandbox}`);
});
