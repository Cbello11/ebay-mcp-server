/**
 * eBay MCP Server — Streamable HTTP transport for Railway deployment.
 *
 * POST /mcp  → MCP JSON-RPC endpoint (stateless, one transport per request)
 * GET  /     → health check
 * GET  /mcp  → 405 Method Not Allowed (helpful error)
 */

import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { registerSearchTools }   from './tools/search.js';
import { registerListingTools }  from './tools/listings.js';
import { registerOrderTools }    from './tools/orders.js';
import { registerMessageTools }  from './tools/messages.js';
import { registerReturnTools }   from './tools/returns.js';
import { registerFeedbackTools } from './tools/feedback.js';
import { registerPolicyTools }   from './tools/policies.js';

// ─── Validate required env vars ───────────────────────────────────────────────
const REQUIRED_ENV = ['EBAY_CLIENT_ID', 'EBAY_CLIENT_SECRET'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[ebay-mcp] FATAL: Missing required env var: ${key}`);
    process.exit(1);
  }
}

// ─── MCP Server ───────────────────────────────────────────────────────────────
const server = new McpServer({
  name:    'ebay-mcp-server',
  version: '2.0.0',
});

registerSearchTools(server);
registerListingTools(server);
registerOrderTools(server);
registerMessageTools(server);
registerReturnTools(server);
registerFeedbackTools(server);
registerPolicyTools(server);

// ─── Express App ──────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '10mb' }));

const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

function checkAuth(req: express.Request, res: express.Response): boolean {
  if (!MCP_AUTH_TOKEN) return true;
  const header = req.headers.authorization ?? '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token !== MCP_AUTH_TOKEN) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

app.get('/', (_req, res) => {
  res.json({ status: 'ok', server: 'ebay-mcp-server', version: '2.0.0', tools: 23, endpoint: 'POST /mcp' });
});

app.post('/mcp', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse:  true,
  });
  res.on('close', () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get('/mcp', (_req, res) => {
  res.status(405).json({ error: 'Method Not Allowed', message: 'Use POST /mcp' });
});

const PORT = parseInt(process.env.PORT ?? '3000', 10);
app.listen(PORT, '0.0.0.0', () => {
  console.error(`[ebay-mcp] Running on port ${PORT} | Auth: ${MCP_AUTH_TOKEN ? 'on' : 'off'}`);
});
