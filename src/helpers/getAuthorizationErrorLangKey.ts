import type {LangPackKey} from '@lib/langPack';

/**
 * A session spends its first day unable to review the others. Terminating one
 * answers FRESH_RESET_AUTHORISATION_FORBIDDEN; confirming one is documented as
 * FRESH_CHANGE_AUTHORIZATION_FORBIDDEN but has been seen answering with the
 * reset name as well — so every FRESH_* means the same thing to the user, and
 * gets the same answer: come back from an older connection.
 */
export default function getAuthorizationErrorLangKey(error: ApiError): LangPackKey {
  return error?.type?.startsWith('FRESH_') ?
    'RecentSessions.Error.FreshReset' :
    'Error.AnError';
}
