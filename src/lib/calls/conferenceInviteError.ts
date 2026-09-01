import type {LangPackKey} from '@lib/langPack';

const CONFERENCE_INVITE_INVALID_ERROR_TYPES = new Set([
  'GROUPCALL_INVALID',
  'GROUPCALL_FORBIDDEN',
  'INVITE_HASH_EXPIRED',
  'INVITE_SLUG_EXPIRED',
  'INVITE_SLUG_INVALID'
]);

export function isConferenceInviteInvalidError(error: unknown): boolean {
  return CONFERENCE_INVITE_INVALID_ERROR_TYPES.has((error as ApiError)?.type);
}

export default function getConferenceInviteErrorLangKey(error: unknown): LangPackKey {
  return isConferenceInviteInvalidError(error) ? 'InviteExpired' : 'Error.AnError';
}
