import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  createHttpMcpApp,
  createHttpTransportConfigFromEnv,
  getAuthServerMetadataUrl,
  getHttpServerUrl,
  type HttpTransportConfig,
} from '@/mcp/httpTransport.js';
import process from 'node:process';

function createTestConfig(overrides: Partial<HttpTransportConfig> = {}): HttpTransportConfig {
  return {
    authEnabled: false,
    ebayConfig: {
      clientId: 'client',
      clientSecret: 'secret',
      environment: 'sandbox',
    },
    host: '127.0.0.1',
    oauth: {
      authServerUrl: 'http://localhost:8080/realms/master',
      requiredScopes: ['mcp:tools'],
      useIntrospection: true,
    },
    port: 3000,
    projectRoot: process.cwd(),
    ...overrides,
  };
}

describe('HTTP MCP transport', () => {
  it('builds HTTP server and metadata URLs from config', () => {
    const config = createTestConfig();

    expect(getHttpServerUrl(config)).toBe('http://127.0.0.1:3000');
    expect(getAuthServerMetadataUrl(config)).toBe(
      'http://localhost:8080/realms/master/.well-known/openid-configuration',
    );

    expect(
      getAuthServerMetadataUrl({
        oauth: {
          ...config.oauth,
          authServerUrl: 'https://auth.example.test',
        },
      }),
    ).toBe('https://auth.example.test/.well-known/oauth-authorization-server');
  });

  it('creates config from env defaults and overrides', () => {
    const config = createHttpTransportConfigFromEnv({
      MCP_HOST: '0.0.0.0',
      MCP_PORT: '4444',
      OAUTH_ENABLED: 'false',
      OAUTH_REQUIRED_SCOPES: 'mcp:tools,mcp:admin',
    });

    expect(config.host).toBe('0.0.0.0');
    expect(config.port).toBe(4444);
    expect(config.authEnabled).toBe(false);
    expect(config.oauth.requiredScopes).toEqual(['mcp:tools', 'mcp:admin']);
  });

  it('binds 0.0.0.0 and uses PORT when only PORT is set', () => {
    const config = createHttpTransportConfigFromEnv({
      PORT: '8080',
    });

    expect(config.host).toBe('0.0.0.0');
    expect(config.port).toBe(8080);
  });

  it('lets MCP_HOST override the PORT-driven 0.0.0.0 default', () => {
    const config = createHttpTransportConfigFromEnv({
      PORT: '8080',
      MCP_HOST: '127.0.0.1',
    });

    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(8080);
  });

  it('prefers MCP_PORT over PORT', () => {
    const config = createHttpTransportConfigFromEnv({
      PORT: '8080',
      MCP_PORT: '4000',
    });

    expect(config.host).toBe('0.0.0.0');
    expect(config.port).toBe(4000);
  });

  it('reads staticAuthToken from MCP_AUTH_TOKEN', () => {
    const config = createHttpTransportConfigFromEnv({
      MCP_AUTH_TOKEN: 'deploy-secret',
    });

    expect(config.staticAuthToken).toBe('deploy-secret');
  });

  it('keeps health available without OAuth', async () => {
    const app = await createHttpMcpApp(createTestConfig());
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'healthy',
      oauth_enabled: false,
    });
    expect(response.body.timestamp).toEqual(expect.any(String));
  });

  it('rejects session requests without a valid MCP session id', async () => {
    const app = await createHttpMcpApp(createTestConfig());
    const response = await request(app).get('/');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'invalid_session',
      error_description: 'Invalid or missing session ID',
    });
  });

  it('rejects protected routes without the static bearer token', async () => {
    const app = await createHttpMcpApp(
      createTestConfig({
        staticAuthToken: 'deploy-secret',
      }),
    );

    const response = await request(app).get('/');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: 'unauthorized',
      error_description: 'Missing or invalid bearer token',
    });
  });

  it('accepts protected routes with the static bearer token', async () => {
    const app = await createHttpMcpApp(
      createTestConfig({
        staticAuthToken: 'deploy-secret',
      }),
    );

    // Health is unauthenticated; hit the MCP session route which uses auth middleware.
    // A valid bearer passes auth, then the handler still rejects missing session id.
    const response = await request(app).get('/').set('Authorization', 'Bearer deploy-secret');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'invalid_session',
      error_description: 'Invalid or missing session ID',
    });
  });

  it('keeps health unauthenticated when static bearer auth is enabled', async () => {
    const app = await createHttpMcpApp(
      createTestConfig({
        staticAuthToken: 'deploy-secret',
      }),
    );

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'healthy' });
  });
});
