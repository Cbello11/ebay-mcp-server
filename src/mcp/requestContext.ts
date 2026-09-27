/**
 * Ambient per-call identity for MCP tool handlers.
 *
 * Tool handlers have the signature `(api, args)` — deliberately, because that is
 * what makes 300-odd tools terse and uniform. But the upload-handle bridge needs
 * to know *which* authenticated caller minted a handle, and threading an extra
 * `extra` parameter through `ToolSpec`, `ToolHandler`, and every call site would
 * be a very large change to serve one tool.
 *
 * So the transport-level identity the MCP SDK already hands to the registration
 * callback is stashed in an `AsyncLocalStorage` for the duration of the call.
 * Handlers that care read it; the other 300 never notice it exists.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

/** Identity of the caller behind the MCP request currently being handled. */
export interface McpRequestContext {
  /**
   * Stable per-caller identifier, derived from the verified bearer token
   * (`subject`, falling back to `clientId`). Undefined when the server runs
   * unauthenticated, in which case callers cannot be told apart at all.
   */
  readonly subject?: string;
  /** Streamable-HTTP session ID, when the transport is session-based. */
  readonly sessionId?: string;
}

const storage = new AsyncLocalStorage<McpRequestContext>();

/**
 * Run a tool invocation with the calling identity attached to the async context.
 *
 * @param context - Identity extracted from the MCP request.
 * @param run - The tool invocation to execute inside that context.
 * @returns Whatever `run` returns.
 *
 * @example
 * ```ts
 * await runWithMcpRequestContext({ subject: 'user-1' }, () => handler(api, args));
 * ```
 */
export const runWithMcpRequestContext = <T>(context: McpRequestContext, run: () => T): T =>
  storage.run(context, run);

/**
 * Read the identity of the in-flight MCP request.
 *
 * @returns The active request context, or undefined outside a tool call (stdio
 * with no transport identity, or a direct API call in tests).
 *
 * @example
 * ```ts
 * const subject = getMcpRequestContext()?.subject;
 * ```
 */
export const getMcpRequestContext = (): McpRequestContext | undefined => storage.getStore();
