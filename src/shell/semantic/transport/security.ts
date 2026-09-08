import {randomBytes, timingSafeEqual} from 'node:crypto';
import {CompanionError, CompanionLimits} from './contracts';
import {boundedInput, DomainError} from '../common';

const COOKIE = 'robochat_companion';
export const COMPANION_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), display-capture=(), usb=(), payment=()'
});

export function equalSecret(candidate: string | null, expected: string): boolean {
  if(candidate === null || candidate.length > 1024) return false;
  const left = Buffer.from(candidate), right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** One domain-owned complexity policy precedes every recursive SDK/schema call. */
export function guardJsonInput(value: unknown): void {
  try {boundedInput(value);}
  catch(error) {
    if(error instanceof DomainError) throw new CompanionError(error.code, error.code, 400);
    throw new CompanionError('INVALID_JSON', 'The request contains unsupported JSON.');
  }
}

/** The hostname and port are a single exact authority, not a suffix match. */
export function validateAuthority(request: Request, origin: string): void {
  const url = new URL(request.url);
  if(url.origin !== origin || request.headers.get('host') !== new URL(origin).host) throw new CompanionError('HOST_DENIED', 'Unknown companion host.', 403);
  const suppliedOrigin = request.headers.get('origin');
  if(suppliedOrigin !== null && suppliedOrigin !== origin) throw new CompanionError('ORIGIN_DENIED', 'Cross-origin requests are not allowed.', 403);
  if(request.headers.has('forwarded') || request.headers.has('x-forwarded-host')) throw new CompanionError('PROXY_DENIED', 'Proxy headers are not allowed.', 403);
  const fetchSite = request.headers.get('sec-fetch-site');
  if(fetchSite === 'cross-site' || fetchSite === 'same-site') throw new CompanionError('ORIGIN_DENIED', 'Cross-origin requests are not allowed.', 403);
}

interface Session {id: string; csrfToken: string; expiresAt: number}
export function createSessionStore(now: () => number = Date.now) {
  const sessions = new Map<string, Session>();
  function prune(): void {for(const [key, session] of sessions) if(session.expiresAt <= now()) sessions.delete(key);}
  function read(request: Request): Session | undefined {
    prune();
    const values = (request.headers.get('cookie') ?? '').split(';').map(item => item.trim()).filter(item => item.startsWith(COOKIE + '='));
    if(values.length !== 1) return undefined;
    const id = values[0].slice(COOKIE.length + 1);
    return sessions.get(id);
  }
  return {
    issue(request: Request): {csrfToken: string; cookie: string} {
      let session = read(request);
      if(!session) {
        if(sessions.size >= CompanionLimits.sessions) throw new CompanionError('SESSION_LIMIT', 'Too many active local sessions.', 429);
        session = {id: randomBytes(32).toString('base64url'), csrfToken: randomBytes(32).toString('base64url'), expiresAt: now() + CompanionLimits.sessionMs};
        sessions.set(session.id, session);
      }
      return {csrfToken: session.csrfToken, cookie: `${COOKIE}=${session.id}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${Math.floor((session.expiresAt - now()) / 1000)}`};
    },
    authorize(request: Request, origin: string, mutation = false): void {
      const session = read(request);
      if(!session) throw new CompanionError('SESSION_REQUIRED', 'Open the companion to start a local session.', 401);
      if(mutation && (request.headers.get('origin') !== origin || !equalSecret(request.headers.get('x-csrf-token'), session.csrfToken))) throw new CompanionError('CSRF_DENIED', 'The local session token is missing or expired.', 403);
    },
    clear(): void {sessions.clear();}
  };
}

export async function boundedBody(request: Request): Promise<unknown> {
  const encoding = request.headers.get('content-encoding');
  if(encoding && encoding !== 'identity') throw new CompanionError('ENCODING_DENIED', 'Compressed requests are not supported.', 415);
  if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new CompanionError('CONTENT_TYPE', 'Use application/json.', 415);
  const declared = request.headers.get('content-length');
  if(declared !== null && (!/^\d+$/.test(declared) || Number(declared) > CompanionLimits.requestBytes)) throw new CompanionError('BODY_LIMIT', 'Request exceeds its byte limit.', 413);
  if(!request.body) throw new CompanionError('INVALID_JSON', 'A JSON body is required.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while(true) {
      if(request.signal.aborted) throw new CompanionError('ABORTED', 'Request was cancelled.', 408);
      const {done, value} = await reader.read();
      if(done) break;
      bytes += value.byteLength;
      if(bytes > CompanionLimits.requestBytes) throw new CompanionError('BODY_LIMIT', 'Request exceeds its byte limit.', 413);
      chunks.push(value);
    }
    const source = new TextDecoder('utf-8', {fatal: true}).decode(Buffer.concat(chunks, bytes));
    let value: unknown;
    try {value = JSON.parse(source);} catch {throw new CompanionError('INVALID_JSON', 'The request is not valid JSON.');}
    guardJsonInput(value);
    return value;
  } catch(error) {
    void reader.cancel().catch(() => undefined);
    if(error instanceof CompanionError) throw error;
    throw new CompanionError('INVALID_BODY', 'The request body could not be read.');
  } finally {reader.releaseLock();}
}

export function jsonResponse(value: unknown, status = 200): Response {
  const body = JSON.stringify(value);
  if(Buffer.byteLength(body) > CompanionLimits.responseBytes) throw new CompanionError('RESPONSE_LIMIT', 'Result exceeds its byte limit. Narrow the request.', 413);
  return new Response(body, {status, headers: {'Content-Type': 'application/json; charset=utf-8'}});
}

export function errorResponse(error: unknown): Response {
  const safe = error instanceof CompanionError ? error : new CompanionError('INTERNAL_ERROR', 'The companion could not complete this request.', 500);
  return jsonResponse({ok: false, error: {code: safe.code, message: safe.message, details: null}}, safe.status);
}
