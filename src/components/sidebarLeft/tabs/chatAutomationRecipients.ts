import {BusinessBotRecipients} from '@layer';

export type ChatAutomationCategoryKey = 'existingChats' | 'newChats' | 'contacts' | 'nonContacts';
export type ChatAutomationRecipientSectionKind = 'included' | 'excluded';

const INCLUDED_CATEGORY_KEYS: readonly ChatAutomationCategoryKey[] = [
  'newChats',
  'contacts',
  'nonContacts'
];

const EXCLUDED_CATEGORY_KEYS: readonly ChatAutomationCategoryKey[] = [
  'existingChats',
  'contacts',
  'nonContacts'
];

export function getChatAutomationRecipientSectionKinds(
  excludeSelected: boolean
): readonly ChatAutomationRecipientSectionKind[] {
  return excludeSelected ? ['excluded'] : ['included', 'excluded'];
}

export function getChatAutomationRecipientCategoryKeys(
  editIncluded: boolean,
  excludeUsersOnly = false
): readonly ChatAutomationCategoryKey[] {
  if(excludeUsersOnly) return [];
  return editIncluded ? INCLUDED_CATEGORY_KEYS : EXCLUDED_CATEGORY_KEYS;
}

export type ChatAutomationRecipientsDraft = {
  excludeSelected: boolean,
  categories: Record<ChatAutomationCategoryKey, boolean>,
  userIds: UserId[],
  excludedUserIds: UserId[]
};

const emptyCategories = (): Record<ChatAutomationCategoryKey, boolean> => ({
  existingChats: false,
  newChats: false,
  contacts: false,
  nonContacts: false
});

export function makeChatAutomationRecipientsDraft(
  recipients?: BusinessBotRecipients.businessBotRecipients
): ChatAutomationRecipientsDraft {
  const excludeSelected = recipients ? !!recipients.pFlags.exclude_selected : true;
  const categories = {
    existingChats: !!recipients?.pFlags.existing_chats,
    newChats: !!recipients?.pFlags.new_chats,
    contacts: !!recipients?.pFlags.contacts,
    nonContacts: !!recipients?.pFlags.non_contacts
  };
  const excludedUserIds = [...(recipients?.exclude_users || [])] as UserId[];
  const userIds = excludeChatAutomationUserIds(
    [...(recipients?.users || [])] as UserId[],
    excludedUserIds
  );

  return {
    excludeSelected,
    categories,
    userIds,
    excludedUserIds
  };
}

export function changeChatAutomationRecipientMode(
  draft: ChatAutomationRecipientsDraft,
  excludeSelected: boolean
): ChatAutomationRecipientsDraft {
  if(draft.excludeSelected === excludeSelected) return draft;

  return {
    excludeSelected,
    categories: emptyCategories(),
    userIds: [],
    excludedUserIds: [...draft.excludedUserIds]
  };
}

export function excludeChatAutomationUserIds(
  includedUserIds: UserId[],
  excludedUserIds: UserId[]
) {
  const excluded = new Set(excludedUserIds.map(String));
  return includedUserIds.filter((userId) => !excluded.has(String(userId)));
}

function normalizeChatAutomationUserIds(userIds: UserId[]) {
  const unique = new Map<string, UserId>();
  userIds.forEach((userId) => unique.set(String(userId), userId));
  return [...unique.values()].sort((a, b) => {
    const aString = String(a);
    const bString = String(b);
    return aString < bString ? -1 : (aString > bString ? 1 : 0);
  });
}

export function toBusinessBotRecipients(
  draft: ChatAutomationRecipientsDraft
): BusinessBotRecipients.businessBotRecipients {
  const excludedUserIds = normalizeChatAutomationUserIds(draft.excludedUserIds);
  const userIds = normalizeChatAutomationUserIds(
    excludeChatAutomationUserIds(draft.userIds, excludedUserIds)
  );
  return {
    _: 'businessBotRecipients',
    pFlags: {
      existing_chats: draft.categories.existingChats || undefined,
      new_chats: draft.categories.newChats || undefined,
      contacts: draft.categories.contacts || undefined,
      non_contacts: draft.categories.nonContacts || undefined,
      exclude_selected: draft.excludeSelected || undefined
    },
    users: userIds.length ? [...userIds] : undefined,
    exclude_users: excludedUserIds.length ?
      excludedUserIds :
      undefined
  };
}
