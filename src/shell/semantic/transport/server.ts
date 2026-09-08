import {createServer, type IncomingMessage, type Server} from 'node:http';
import {McpServer, createMcpHandler, type JSONValue} from '@modelcontextprotocol/server';
import {toNodeHandler} from '@modelcontextprotocol/node';
import {artifactPath, loadArtifact} from './artifact';
import {CompanionError, CompanionLimits, type CompanionServerOptions, type CompanionPrincipal} from './contracts';
import {boundedBody, createSessionStore, equalSecret, errorResponse, jsonResponse, validateAuthority, COMPANION_HEADERS, guardJsonInput} from './security';
import {SemanticLimits} from '../common';

const UI_COMMANDS = new Set(['bot_context', 'document_snapshot', 'manual_change', 'undo_change', 'bot_search', 'bot_inspect', 'bot_prepare_change', 'bot_apply_change', 'bot_validate', 'bot_test', 'execution_explain']);

function toolSummary(value: unknown): string {
  if(!value || typeof value !== 'object') return 'Completed. Structured result attached.';
  const envelope = value as Record<string, unknown>;
  if(envelope.ok === false) {
    const error = envelope.error as {code?: unknown} | undefined;
    return typeof error?.code === 'string' ? `Error: ${error.code.slice(0, 80)}.` : 'The tool could not complete this request.';
  }
  const data = envelope.data as Record<string, unknown> | undefined;
  if(data && typeof data === 'object') {
    if(typeof data.outcome === 'string') return `Test result: ${data.outcome.slice(0, 40)}.`;
    if(typeof data.state === 'string') return `Change: ${data.state.slice(0, 40)}.`;
    if(typeof data.revision === 'string') return `Revision: ${data.revision.slice(0, 128)}.`;
  }
  return 'Completed. Structured result attached.';
}

function safePrincipal(principal: CompanionPrincipal): CompanionPrincipal {
  return {id: principal.id, botIds: [...principal.botIds], scopes: [...principal.scopes]};
}

/** Limit the Node stream BEFORE the SDK adapter buffers it. */
async function readNodeBody(request: IncomingMessage): Promise<unknown> {
  const encoding = request.headers['content-encoding'];
  if(encoding && encoding !== 'identity') throw new CompanionError('ENCODING_DENIED', 'Compressed requests are not supported.', 415);
  if(request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new CompanionError('CONTENT_TYPE', 'Use application/json.', 415);
  const declared = request.headers['content-length'];
  if(declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > CompanionLimits.requestBytes)) throw new CompanionError('BODY_LIMIT', 'Request exceeds its byte limit.', 413);
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks: Buffer[] = [];
    const finish = (error?: unknown): void => {
      request.off('data', data); request.off('end', end); request.off('error', failure); request.off('aborted', aborted);
      if(error) {request.pause(); reject(error);}
    };
    const failure = (): void => finish(new CompanionError('INVALID_BODY', 'The request body could not be read.'));
    const aborted = (): void => finish(new CompanionError('ABORTED', 'Request was cancelled.', 408));
    const data = (chunk: Buffer): void => {
      total += chunk.byteLength;
      if(total > CompanionLimits.requestBytes) {finish(new CompanionError('BODY_LIMIT', 'Request exceeds its byte limit.', 413)); return;}
      chunks.push(chunk);
    };
    const end = (): void => {
      finish();
      try {
        const value: unknown = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(Buffer.concat(chunks, total)));
        guardJsonInput(value); resolve(value);
      } catch(error) {reject(error instanceof CompanionError ? error : new CompanionError('INVALID_JSON', 'The request is not valid JSON.'));}
    };
    request.on('data', data); request.once('end', end); request.once('error', failure); request.once('aborted', aborted);
  });
}

async function boundedResponse(response: Response, signal: AbortSignal): Promise<Response> {
  if(!response.body) return response;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const abort = (): void => {void reader.cancel().catch(() => undefined);};
  signal.addEventListener('abort', abort, {once: true});
  try {
    while(true) {
      if(signal.aborted) throw new CompanionError('ABORTED', 'Request was cancelled.', 408);
      const {done, value} = await reader.read();
      if(done) break;
      size += value.byteLength;
      if(size > CompanionLimits.responseBytes) throw new CompanionError('RESPONSE_LIMIT', 'Result exceeds its byte limit. Narrow the request.', 413);
      chunks.push(value);
    }
    if(signal.aborted) throw new CompanionError('ABORTED', 'Request was cancelled.', 408);
    return new Response(new Uint8Array(Buffer.concat(chunks, size)), {status: response.status, headers: response.headers});
  } finally {
    signal.removeEventListener('abort', abort);
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export interface CompanionServer {
  server: Server;
  artifactHash: string;
  readonly origin: string;
  listen(): Promise<string>;
  close(): Promise<void>;
}

export async function createCompanionServer({app, token, artifactRoot, manifestPath, port = 3130}: CompanionServerOptions): Promise<CompanionServer> {
  if(!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid companion port.');
  if(!/^[A-Za-z0-9_-]{43,128}$/.test(token)) throw new Error('Companion token must contain at least 32 random bytes in base64url.');
  if(!app.principal.id || !app.principal.botIds.length) throw new Error('A local owner grant is required.');
  const names = new Set<string>();
  for(const tool of app.tools) {
    if(!/^[a-z][a-z0-9_]{0,63}$/.test(tool.name) || names.has(tool.name)) throw new Error('Invalid or duplicate companion tool.');
    names.add(tool.name);
  }
  const artifact = await loadArtifact(artifactRoot, manifestPath);
  let origin = `http://127.0.0.1:${port}`;
  const sessions = createSessionStore();
  const active = new Set<AbortController>();
  const mcp = createMcpHandler(context => {
    // Factory runs for each request. Never cache visibility by MCP connection.
    const principal = safePrincipal(app.principal);
    const instance = new McpServer({name: 'robochat-semantic', version: '1.0.0'}, {
      instructions: app.instructions,
      cacheHints: {'tools/list': {ttlMs: 0, cacheScope: 'private'}, 'server/discover': {ttlMs: 0, cacheScope: 'private'}}
    });
    for(const tool of app.tools) {
      if(!tool.requiredScopes.every(scope => principal.scopes.includes(scope))) continue;
      instance.registerTool(tool.name, {
        description: tool.description, inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema, annotations: tool.annotations
      }, async (args, extra) => {
        try {
          const signal = context.requestInfo ? AbortSignal.any([extra.mcpReq.signal, context.requestInfo.signal]) : extra.mcpReq.signal;
          if(signal.aborted) throw new CompanionError('ABORTED', 'Request was cancelled.', 408);
          const result = await app.handle(tool.name, args, safePrincipal(principal), signal);
          const parsed = tool.outputSchema.safeParse(result);
          if(!parsed.success) throw new CompanionError('OUTPUT_CONTRACT', 'The companion returned an invalid tool result.', 500);
          const failed = typeof parsed.data === 'object' && parsed.data !== null && 'ok' in parsed.data && parsed.data.ok === false;
          // Keep the full JSON only once. Legacy clients also receive a concise summary.
          const toolResult = {isError: failed, content: [{type: 'text' as const, text: toolSummary(parsed.data)}], structuredContent: parsed.data as JSONValue};
          if(Buffer.byteLength(JSON.stringify(toolResult)) > SemanticLimits.responseBytes - 512) throw new CompanionError('RESPONSE_LIMIT', 'Result exceeds its byte limit. Narrow the request.', 413);
          return toolResult;
        } catch(error) {
          const safe = error instanceof CompanionError ? error : new CompanionError('INTERNAL_ERROR', 'The companion could not complete this request.', 500);
          const result = {ok: false, error: {code: safe.code.slice(0, 80), message: safe.message.slice(0, 256), details: null}};
          return {isError: true, content: [{type: 'text' as const, text: toolSummary(result)}], structuredContent: result};
        }
      });
    }
    return instance;
  }, {responseMode: 'auto', legacy: 'stateless', maxSubscriptions: 0});

  const fetchHandler = async (request: Request, parsedBody?: unknown): Promise<Response> => {
    let response: Response;
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    request.signal.addEventListener('abort', abort, {once: true});
    if(request.signal.aborted) controller.abort();
    const timer = setTimeout(abort, CompanionLimits.requestMs);
    let counted = false;
    const signal = controller.signal;
    try {
      validateAuthority(request, origin);
      if(active.size >= CompanionLimits.activeRequests) throw new CompanionError('BUSY', 'The companion is handling too many requests.', 429);
      active.add(controller); counted = true;
      const url = new URL(request.url);
      const path = url.pathname;
      if(path === '/mcp') {
        if(!equalSecret(request.headers.get('authorization'), `Bearer ${token}`)) throw new CompanionError('AUTH_REQUIRED', 'A valid local bearer capability is required.', 401);
        if(request.method !== 'POST') throw new CompanionError('METHOD_DENIED', 'Use POST for this stateless MCP endpoint.', 405);
        const body = parsedBody ?? await boundedBody(request);
        guardJsonInput(body);
        if(Array.isArray(body)) throw new CompanionError('BATCH_DENIED', 'Send one MCP request at a time.');
        if(body && typeof body === 'object' && 'method' in body && String(body.method).startsWith('subscriptions/')) throw new CompanionError('SUBSCRIPTIONS_DISABLED', 'This companion does not expose background subscriptions.', 405);
        const bounded = new Request(request.url, {method: request.method, headers: request.headers, body: JSON.stringify(body), signal});
        response = await boundedResponse(await mcp.fetch(bounded, {parsedBody: body}), signal);
      } else if(path === '/api/session') {
        if(request.method !== 'GET') throw new CompanionError('METHOD_DENIED', 'Use GET for the local session.', 405);
        const session = sessions.issue(request);
        response = jsonResponse({csrfToken: session.csrfToken});
        response.headers.set('Set-Cookie', session.cookie);
      } else if(path === '/api/context' || path === '/api/document') {
        if(request.method !== 'GET') throw new CompanionError('METHOD_DENIED', 'Use GET for this resource.', 405);
        sessions.authorize(request, origin);
        response = jsonResponse(await app.handle(path === '/api/context' ? 'bot_context' : 'document_snapshot', {}, safePrincipal(app.principal), signal));
      } else if(path === '/api/command') {
        if(request.method !== 'POST') throw new CompanionError('METHOD_DENIED', 'Use POST for commands.', 405);
        sessions.authorize(request, origin, true);
        const body = parsedBody ?? await boundedBody(request);
        guardJsonInput(body);
        if(!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'name' && key !== 'args') || !('name' in body) || typeof body.name !== 'string' || !UI_COMMANDS.has(body.name) || !('args' in body)) throw new CompanionError('INVALID_COMMAND', 'Use a supported command with name and args.');
        const tool = app.tools.find(item => item.name === body.name);
        if(tool && !tool.requiredScopes.every(scope => app.principal.scopes.includes(scope))) throw new CompanionError('SCOPE_DENIED', 'This capability does not permit the command.', 403);
        const args = tool ? tool.inputSchema.safeParse(body.args) : {success: true as const, data: body.args};
        if(!args.success) throw new CompanionError('INVALID_ARGUMENTS', 'Command arguments do not match its schema.');
        response = jsonResponse(await app.handle(body.name, args.data, safePrincipal(app.principal), signal));
      } else {
        if(request.method !== 'GET' && request.method !== 'HEAD') throw new CompanionError('METHOD_DENIED', 'Use GET or HEAD for static resources.', 405);
        const key = artifactPath(path);
        const file = key && artifact.contents.get(key);
        if(!file) throw new CompanionError('NOT_FOUND', 'Resource was not found.', 404);
        response = new Response(request.method === 'HEAD' ? null : new Uint8Array(file.body), {headers: {'Content-Type': file.type, 'Content-Length': String(file.body.byteLength)}});
      }
    } catch(error) {response = errorResponse(error);}
    finally {
      clearTimeout(timer); request.signal.removeEventListener('abort', abort);
      if(counted) active.delete(controller);
    }
    const key = artifactPath(new URL(request.url).pathname);
    const worker = key && artifact.workerFiles.has(key);
    const scripts = worker ? "'self' 'wasm-unsafe-eval'" : "'self'";
    const workers = artifact.workers.length ? artifact.workers.map(path => origin + path).join(' ') : "'none'";
    response.headers.set('Content-Security-Policy', `default-src 'none'; script-src ${scripts}; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self'; worker-src ${workers}; media-src 'none'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`);
    for(const [name, value] of Object.entries(COMPANION_HEADERS)) response.headers.set(name, value);
    if(response.status === 401 && new URL(request.url).pathname === '/mcp') response.headers.set('WWW-Authenticate', 'Bearer realm="robochat-local"');
    return response;
  };
  const bridge = toNodeHandler({fetch: (request, options) => fetchHandler(request, options?.parsedBody)});
  const server = createServer({maxHeaderSize: 16 * 1024, requestTimeout: CompanionLimits.requestMs, headersTimeout: 5000}, (request, response) => {
    for(const [name, value] of Object.entries(COMPANION_HEADERS)) response.setHeader(name, value);
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    // Reject malformed authority and traversal before URL normalization or body reading.
    const host = new URL(origin).host;
    const duplicateHost = request.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === 'host').length !== 1;
    if(duplicateHost || request.headers.host !== host || !request.url || artifactPath(request.url) === null || request.headers.origin && request.headers.origin !== origin || request.headers.forwarded || request.headers['x-forwarded-host']) {
      response.writeHead(403, {'Content-Type': 'application/json', 'Connection': 'close', 'Cache-Control': 'no-store'});
      response.end(JSON.stringify({ok: false, error: {code: 'REQUEST_DENIED', message: 'Request authority or path is not allowed.'}})); return;
    }
    // The SDK also buffers PUT/PATCH/DELETE. Reject every unsupported verb
    // before conversion, even on static paths and without authentication.
    if(!['GET', 'HEAD', 'POST'].includes(request.method ?? '')) {
      response.writeHead(405, {'Allow': 'GET, HEAD, POST', 'Connection': 'close'}); response.end(); return;
    }
    const timer = setTimeout(() => {if(!response.writableEnded) response.destroy();}, CompanionLimits.requestMs);
    response.once('close', () => clearTimeout(timer));
    void (async () => {
      try {
        // Authenticate before buffering untrusted MCP payloads.
        if(request.url!.split('?')[0] === '/mcp' && !equalSecret(typeof request.headers.authorization === 'string' ? request.headers.authorization : null, `Bearer ${token}`)) {
          response.writeHead(401, {'WWW-Authenticate': 'Bearer realm="robochat-local"', 'Connection': 'close'}); response.end(); return;
        }
        const body = request.method === 'POST' ? await readNodeBody(request) : undefined;
        await bridge(request, response, body);
      } catch(error) {
        if(response.destroyed) return;
        const failure = errorResponse(error);
        response.writeHead(failure.status, {'Content-Type': 'application/json', 'Connection': 'close', 'Cache-Control': 'no-store'});
        response.end(await failure.text());
      }
    })();
  });
  server.maxConnections = 32;
  server.keepAliveTimeout = 5000;
  return {
    server, artifactHash: artifact.hash,
    get origin() {return origin;},
    listen: () => new Promise((resolve, reject) => {
      const failed = (error: Error): void => reject(error);
      server.once('error', failed);
      server.listen(port, '127.0.0.1', () => {
        server.off('error', failed);
        const address = server.address();
        if(!address || typeof address === 'string') {reject(new Error('Companion did not bind a TCP port.')); return;}
        origin = `http://127.0.0.1:${address.port}`;
        resolve(origin);
      });
    }),
    close: async () => {
      for(const controller of active) controller.abort();
      sessions.clear();
      await mcp.close();
      server.closeAllConnections();
      if(server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  };
}
