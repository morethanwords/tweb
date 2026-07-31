import {
  applyBotConnectionReviewUpdate,
  filterExpiredBotConnectionReviews,
  normalizeBusinessBotUsername,
  revokeBusinessBotRecipientAccess,
  toInputBusinessBotRecipients
} from '@appManagers/appBusinessManager';
import {normalizeAuthorizationAutoconfirmPeriod} from '@appManagers/utils/authorizationAutoconfirmPeriod';
import {
  changeChatAutomationRecipientMode,
  excludeChatAutomationUserIds,
  getChatAutomationRecipientCategoryKeys,
  getChatAutomationRecipientSectionKinds,
  makeChatAutomationRecipientsDraft,
  toBusinessBotRecipients
} from '@components/sidebarLeft/tabs/chatAutomationRecipients';
import isSameUserId from '@helpers/isSameUserId';
import {BusinessBotRecipients, InputUser, Update} from '@layer';

describe('chat automation helpers', () => {
  test.each([
    ['@example_bot', 'example_bot'],
    ['https://t.me/example_bot', 'example_bot'],
    ['telegram.me/example_bot?start=test', 'example_bot'],
    ['  example_bot  ', 'example_bot'],
    ['not a username', undefined]
  ])('normalizes bot username %s', (input, expected) => {
    expect(normalizeBusinessBotUsername(input)).toBe(expected);
  });

  test('compares numeric and serialized user ids consistently', () => {
    expect(isSameUserId(10, '10' as UserId)).toBe(true);
    expect(isSameUserId(undefined, undefined)).toBe(true);
    expect(isSameUserId(10, undefined)).toBe(false);
  });

  test('uses the default review period when app config provides zero', () => {
    expect(normalizeAuthorizationAutoconfirmPeriod(0)).toBe(7 * 24 * 60 * 60);
  });

  test('preserves recipient flags and maps both user vectors', () => {
    const recipients: BusinessBotRecipients.businessBotRecipients = {
      _: 'businessBotRecipients',
      pFlags: {
        existing_chats: true,
        contacts: true,
        exclude_selected: true
      },
      users: [10, 20],
      exclude_users: [30]
    };
    const getUserInput = (userId: UserId): InputUser.inputUser => ({
      _: 'inputUser',
      user_id: userId,
      access_hash: `hash-${userId}`
    });

    expect(toInputBusinessBotRecipients(recipients, getUserInput)).toEqual({
      _: 'inputBusinessBotRecipients',
      pFlags: recipients.pFlags,
      users: [getUserInput(10), getUserInput(20)],
      exclude_users: [getUserInput(30)]
    });
  });

  test('creates empty recipients for bot removal', () => {
    expect(toInputBusinessBotRecipients(undefined, () => ({_: 'inputUserEmpty'}))).toEqual({
      _: 'inputBusinessBotRecipients',
      pFlags: {},
      users: undefined,
      exclude_users: undefined
    });
  });

  test('maps the primary and secondary recipient lists independently', () => {
    const draft = makeChatAutomationRecipientsDraft({
      _: 'businessBotRecipients',
      pFlags: {exclude_selected: true, contacts: true},
      users: [10, 20],
      exclude_users: [30]
    });

    expect(toBusinessBotRecipients(draft)).toEqual({
      _: 'businessBotRecipients',
      pFlags: {
        existing_chats: undefined,
        new_chats: undefined,
        contacts: true,
        non_contacts: undefined,
        exclude_selected: true
      },
      users: [10, 20],
      exclude_users: [30]
    });
  });

  test('clears the primary list but preserves secondary exclusions when the mode changes', () => {
    const draft = makeChatAutomationRecipientsDraft({
      _: 'businessBotRecipients',
      pFlags: {exclude_selected: true, contacts: true},
      users: [10],
      exclude_users: [30]
    });
    const onlySelectedDraft = changeChatAutomationRecipientMode(draft, false);

    expect(onlySelectedDraft).toMatchObject({
      excludeSelected: false,
      categories: {
        existingChats: false,
        newChats: false,
        contacts: false,
        nonContacts: false
      },
      userIds: [],
      excludedUserIds: [30]
    });
    expect(toBusinessBotRecipients(onlySelectedDraft)).toEqual({
      _: 'businessBotRecipients',
      pFlags: {
        existing_chats: undefined,
        new_chats: undefined,
        contacts: undefined,
        non_contacts: undefined,
        exclude_selected: undefined
      },
      users: undefined,
      exclude_users: [30]
    });
  });

  test('makes a newly selected primary peer authoritative over exclusions', () => {
    const draft = makeChatAutomationRecipientsDraft({
      _: 'businessBotRecipients',
      pFlags: {},
      users: [10],
      exclude_users: [20, 30]
    });
    const newlyIncludedUserIds = [20, 40] as UserId[];
    draft.userIds = newlyIncludedUserIds;
    draft.excludedUserIds = excludeChatAutomationUserIds(
      draft.excludedUserIds,
      newlyIncludedUserIds
    );

    expect(toBusinessBotRecipients(draft)).toMatchObject({
      pFlags: {exclude_selected: undefined},
      users: [20, 40],
      exclude_users: [30]
    });
  });

  test('resolves recipient conflicts across string and number user ids', () => {
    expect(excludeChatAutomationUserIds(
      [10, 20] as UserId[],
      ['10' as UserId]
    )).toEqual([20]);
  });

  test('serializes recipient vectors as stable id sets', () => {
    const recipients = toBusinessBotRecipients({
      excludeSelected: false,
      categories: {
        existingChats: false,
        newChats: false,
        contacts: false,
        nonContacts: false
      },
      userIds: [20, '10' as UserId, 20],
      excludedUserIds: [30, '30' as UserId]
    });

    expect(recipients.users).toEqual(['10', 20]);
    expect(recipients.exclude_users).toEqual(['30']);
  });

  test('revokes explicit access without leaving conflicting recipient ids', () => {
    expect(revokeBusinessBotRecipientAccess({
      _: 'businessBotRecipients',
      pFlags: {exclude_selected: true},
      users: [10],
      exclude_users: [20]
    }, 20)).toMatchObject({
      users: [10, 20],
      exclude_users: undefined
    });

    expect(revokeBusinessBotRecipientAccess({
      _: 'businessBotRecipients',
      pFlags: {},
      users: [10, 20],
      exclude_users: [30]
    }, 20)).toMatchObject({
      users: [10],
      exclude_users: [30, 20]
    });
  });

  test('matches the iOS included and excluded section hierarchy', () => {
    expect(getChatAutomationRecipientSectionKinds(true)).toEqual(['excluded']);
    expect(getChatAutomationRecipientSectionKinds(false)).toEqual(['included', 'excluded']);
  });

  test('matches the iOS category choices for each recipient list', () => {
    expect(getChatAutomationRecipientCategoryKeys(false)).toEqual([
      'existingChats',
      'contacts',
      'nonContacts'
    ]);
    expect(getChatAutomationRecipientCategoryKeys(true)).toEqual([
      'newChats',
      'contacts',
      'nonContacts'
    ]);
    expect(getChatAutomationRecipientCategoryKeys(true, true)).toEqual([]);
  });

  test('keeps one pending review per bot and moves the newest update first', () => {
    const update: Update.updateNewBotConnection = {
      _: 'updateNewBotConnection',
      pFlags: {},
      bot_id: 20,
      date: 1_000,
      device: 'Chrome',
      location: 'Dubai'
    };

    expect(applyBotConnectionReviewUpdate([
      {botId: 10, date: 900},
      {botId: 20, date: 800, device: 'Old browser'}
    ], update)).toEqual([
      {botId: 20, date: 1_000, device: 'Chrome', location: 'Dubai'},
      {botId: 10, date: 900}
    ]);
  });

  test('removes a pending review when the connection is confirmed', () => {
    expect(applyBotConnectionReviewUpdate([
      {botId: 10},
      {botId: 20}
    ], {
      _: 'updateNewBotConnection',
      pFlags: {confirmed: true},
      bot_id: 10
    })).toEqual([{botId: 20}]);
  });

  test('expires dated reviews after the server autoconfirm period', () => {
    expect(filterExpiredBotConnectionReviews([
      {botId: 10, date: 100},
      {botId: 20, date: 150},
      {botId: 30}
    ], 201, 100)).toEqual([
      {botId: 20, date: 150},
      {botId: 30}
    ]);
  });

  test('honors a zero server autoconfirm period', () => {
    expect(filterExpiredBotConnectionReviews([
      {botId: 10, date: 100}
    ], 100, 0)).toEqual([]);
  });
});
