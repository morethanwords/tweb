/*
 * TdE2E port — End-to-end encryption for Telegram conference calls.
 *
 * Public API surface for the rest of tweb (Phase 5 integration consumes this).
 * Internals (TL types, bit-string, blockchain validation primitives, etc.) are
 * deliberately not re-exported — they're implementation details.
 *
 * Port plan: see ~/.claude/projects/.../memory/tde2e-port.md
 * Module specs: see ./notes/*.md
 * Test vectors: see ./tests/vectors.ts
 */

export {ensureCryptoReady} from './crypto';
export {PrivateKey, PublicKey} from './keys';
export {E2eCall, CallError, type CallErrorCode} from './call';
export type {GroupParticipant, GroupState} from './tlTypes';
export type {VerificationPhase, VerificationStateSnapshot} from './emoji';
