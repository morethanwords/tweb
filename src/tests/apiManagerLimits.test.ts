import ApiManagerMethods, {ApiLimitType} from '@appManagers/apiManagerMethods';

/*
 * A limit is a number whether the app config has it or not: missing from the config, it is what tdesktop takes
 * for it (data_premium_limits.cpp). It used to be `undefined` - "You can't pin more than undefined chats" in the
 * limit popup, and every local check against it (`count > undefined`) let the action through to the server.
 */
function getLimit(appConfig: Record<string, number>, type: ApiLimitType, isPremium: boolean) {
  const methods = Object.create(ApiManagerMethods.prototype) as ApiManagerMethods;
  Object.assign(methods as any, {
    rootScope: {premium: false},
    getAppConfig: () => appConfig
  });
  return methods.getLimit(type, isPremium);
}

describe('ApiManagerMethods.getLimit', () => {
  it('is tdesktop\'s default for a limit the app config does not have', () => {
    expect(getLimit({}, 'pin', false)).toBe(5);
    expect(getLimit({}, 'pin', true)).toBe(10);
    expect(getLimit({}, 'folderPin', false)).toBe(100);
    expect(getLimit({}, 'savedPin', true)).toBe(100);
    expect(getLimit({}, 'topicPin', false)).toBe(5);
    expect(getLimit({}, 'reactions', true)).toBe(3);
  });

  it('is a number for every limit, with Premium or without', () => {
    const types: ApiLimitType[] = [
      'pin', 'folderPin', 'folders', 'favedStickers', 'reactions', 'bio', 'topicPin', 'caption', 'chatlistsJoined',
      'chatlistInvites', 'channels', 'links', 'gifs', 'folderPeers', 'uploadFileParts', 'recommendedChannels', 'savedPin'
    ];
    for(const type of types) {
      for(const isPremium of [false, true]) {
        expect(getLimit({}, type, isPremium), `${type}, Premium: ${isPremium}`).toBeGreaterThan(0);
      }
    }
  });

  it('is what the app config says when it says', () => {
    const appConfig = {dialogs_pinned_limit_default: 7, dialogs_pinned_limit_premium: 12, topics_pinned_limit: 9};
    expect(getLimit(appConfig, 'pin', false)).toBe(7);
    expect(getLimit(appConfig, 'pin', true)).toBe(12);
    expect(getLimit(appConfig, 'topicPin', true)).toBe(9);
  });
});
