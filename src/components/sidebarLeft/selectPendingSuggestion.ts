export const PENDING_SUGGESTION_PRIORITY = [
  'frozen',
  'notifications',
  'passkey',
  'birthdayContacts',
  'birthdaySetup'
] as const;

export type PendingSuggestionType = typeof PENDING_SUGGESTION_PRIORITY[number];

export default function selectPendingSuggestion(
  available: Partial<Record<PendingSuggestionType, boolean>>
): PendingSuggestionType {
  return PENDING_SUGGESTION_PRIORITY.find((type) => available[type]);
}
