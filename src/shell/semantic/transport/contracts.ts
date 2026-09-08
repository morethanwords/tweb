import type {ZodType} from 'zod';

/** Authentication is established by the companion, never by tool arguments. */
export interface CompanionPrincipal {
  id: string;
  botIds: string[];
  scopes: string[];
}

export interface CompanionToolDefinition {
  name: string;
  description: string;
  inputSchema: ZodType;
  outputSchema: ZodType;
  requiredScopes: readonly string[];
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

export interface CompanionApp {
  principal: CompanionPrincipal;
  tools: readonly CompanionToolDefinition[];
  instructions: string;
  handle(name: string, args: unknown, principal: CompanionPrincipal, signal: AbortSignal): Promise<unknown>;
}

export const CompanionLimits = Object.freeze({
  requestBytes: 2 * 1024 * 1024,
  responseBytes: 4 * 1024 * 1024,
  activeRequests: 16,
  requestMs: 10_000,
  sessions: 32,
  sessionMs: 8 * 60 * 60 * 1000,
  staticBytes: 64 * 1024 * 1024
});

/** Only this explicitly safe error shape crosses the HTTP boundary. */
export class CompanionError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
    this.name = 'CompanionError';
  }
}

export interface CompanionServerOptions {
  app: CompanionApp;
  token: string;
  artifactRoot: string;
  manifestPath?: string;
  port?: number;
}
