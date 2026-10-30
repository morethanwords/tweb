import AppBusinessManager, {toInputBusinessChatLink} from '@appManagers/appBusinessManager';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import '@helpers/peerIdPolyfill';
import deferredPromise from '@helpers/cancellablePromise';
import {BusinessChatLink, MessageEntity, UserFull} from '@layer';

const MY_ID = 1000;

const mentionToInput = (entities: MessageEntity[]) => entities.map((entity) => entity._ === 'messageEntityMentionName' ? {
  _: 'inputMessageEntityMentionName',
  offset: entity.offset,
  length: entity.length,
  user_id: {_: 'inputUser', user_id: entity.user_id, access_hash: 'hash'}
} as any as MessageEntity : entity);

function makeLink(overrides: Partial<BusinessChatLink.businessChatLink> = {}): BusinessChatLink.businessChatLink {
  return {
    _: 'businessChatLink',
    link: 'https://t.me/m/abcdef',
    message: 'Hello',
    views: 0,
    ...overrides
  };
}

function makeUserFull(pFlags: UserFull.userFull['pFlags'] = {}): UserFull.userFull {
  return {_: 'userFull', pFlags} as UserFull.userFull;
}

function makeBusinessManager(options: {
  invokeApi?: ReturnType<typeof vi.fn>,
  invokeApiSingleProcess?: ReturnType<typeof vi.fn>,
  userFull?: UserFull.userFull,
  docs?: Record<string, any>
} = {}) {
  const manager = new AppBusinessManager();
  const userFull = options.userFull;
  const deps = {
    apiManager: {
      invokeApi: options.invokeApi ?? vi.fn().mockResolvedValue(true),
      invokeApiSingleProcess: options.invokeApiSingleProcess ?? vi.fn()
    },
    appPeersManager: {
      saveApiPeers: vi.fn()
    },
    appMessagesManager: {
      getInputEntities: vi.fn((entities: MessageEntity[]) => entities.length ? mentionToInput(entities) : undefined)
    },
    appDocsManager: {
      getDoc: vi.fn((docId: DocId) => options.docs?.[docId])
    },
    appProfileManager: {
      modifyCachedFullUser: vi.fn((userId: UserId, modify: (userFull: UserFull.userFull) => void) => {
        if(userFull && userId === MY_ID) modify(userFull);
      })
    },
    rootScope: {
      myId: MY_ID
    }
  };
  Object.assign(manager, deps);
  return {manager, ...deps};
}

describe('business chat links', () => {
  test('leaves an empty name and no entities out of the input link', () => {
    const getInputEntities = vi.fn(mentionToInput);
    expect(toInputBusinessChatLink({message: 'Hi', title: '  ', entities: []}, getInputEntities)).toEqual({
      _: 'inputBusinessChatLink',
      message: 'Hi',
      entities: undefined,
      title: undefined
    });
    expect(getInputEntities).not.toHaveBeenCalled();
  });

  test('sends a trimmed name and the entities as input entities', () => {
    const entities: MessageEntity[] = [
      {_: 'messageEntityBold', offset: 0, length: 2},
      {_: 'messageEntityMentionName', offset: 3, length: 4, user_id: 42}
    ];

    const input = toInputBusinessChatLink({message: 'Hi John', title: ' Ads ', entities}, mentionToInput);

    expect(input.title).toBe('Ads');
    expect(input.entities).toEqual([
      {_: 'messageEntityBold', offset: 0, length: 2},
      {_: 'inputMessageEntityMentionName', offset: 3, length: 4, user_id: {_: 'inputUser', user_id: 42, access_hash: 'hash'}}
    ]);
  });

  test('lists the links and saves the peers their mentions name', async() => {
    const links = [makeLink(), makeLink({link: 'https://t.me/m/other', views: 3})];
    const result = {_: 'account.businessChatLinks', links, chats: [] as any[], users: [{_: 'user', id: 42}]};
    const invokeApiSingleProcess = vi.fn(({processResult}) => Promise.resolve(processResult(result)));
    const {manager, appPeersManager} = makeBusinessManager({invokeApiSingleProcess});

    await expect(manager.getBusinessChatLinks()).resolves.toEqual(links);
    expect(invokeApiSingleProcess).toHaveBeenCalledWith(expect.objectContaining({
      method: 'account.getBusinessChatLinks',
      params: {}
    }));
    expect(appPeersManager.saveApiPeers).toHaveBeenCalledWith(result);
  });

  test('creates a link from the preset message', async() => {
    const created = makeLink({message: 'Hi'});
    const invokeApi = vi.fn().mockResolvedValue(created);
    const {manager} = makeBusinessManager({invokeApi});

    await expect(manager.createBusinessChatLink({message: 'Hi'})).resolves.toBe(created);
    expect(invokeApi).toHaveBeenCalledWith('account.createBusinessChatLink', {
      link: {_: 'inputBusinessChatLink', message: 'Hi', entities: undefined, title: undefined}
    });
  });

  /** A manager that knows these links, as the tab's own load leaves it. */
  async function withLinks(links: BusinessChatLink.businessChatLink[], invokeApi = vi.fn()) {
    const result = {_: 'account.businessChatLinks', links, chats: [] as any[], users: [] as any[]};
    const invokeApiSingleProcess = vi.fn(({processResult}) => Promise.resolve(processResult(result)));
    const harness = makeBusinessManager({invokeApi, invokeApiSingleProcess});
    await harness.manager.getBusinessChatLinks();
    return harness;
  }

  test('edits a link by the link itself, as the other clients pass the slug', async() => {
    const link = makeLink();
    const edited = makeLink({title: 'Shop', message: 'Order'});
    const invokeApi = vi.fn().mockResolvedValue(edited);
    const {manager} = await withLinks([link], invokeApi);

    await expect(manager.editBusinessChatLink(link.link, {message: 'Order', title: 'Shop'})).resolves.toBe(edited);
    expect(invokeApi).toHaveBeenCalledWith('account.editBusinessChatLink', {
      slug: 'https://t.me/m/abcdef',
      link: {_: 'inputBusinessChatLink', message: 'Order', entities: undefined, title: 'Shop'}
    });
  });

  test('a rename made while a new message is on its way keeps that message', async() => {
    const link = makeLink({message: 'Old'});
    const messageSaved = deferredPromise<BusinessChatLink.businessChatLink>();
    const invokeApi = vi.fn()
    .mockImplementationOnce(() => messageSaved)
    .mockImplementationOnce(async(_: string, params: any) => makeLink({message: params.link.message, title: params.link.title}));
    const {manager} = await withLinks([link], invokeApi);

    const editing = manager.editBusinessChatLink(link.link, {message: 'New'});
    const renaming = manager.editBusinessChatLink(link.link, {title: 'Shop'});
    await Promise.resolve();
    // * the rename waits for the message's answer
    expect(invokeApi).toHaveBeenCalledTimes(1);

    messageSaved.resolve(makeLink({message: 'New'}));
    await editing;
    await expect(renaming).resolves.toEqual(makeLink({message: 'New', title: 'Shop'}));
    expect(invokeApi).toHaveBeenLastCalledWith('account.editBusinessChatLink', {
      slug: link.link,
      link: {_: 'inputBusinessChatLink', message: 'New', entities: undefined, title: 'Shop'}
    });
  });

  test('a failed edit leaves the next one the link as it was', async() => {
    const link = makeLink({message: 'Old', title: 'Shop'});
    const invokeApi = vi.fn()
    .mockRejectedValueOnce(new Error('MESSAGE_TOO_LONG'))
    .mockImplementationOnce(async(_: string, params: any) => makeLink({message: params.link.message, title: params.link.title}));
    const {manager} = await withLinks([link], invokeApi);

    await expect(manager.editBusinessChatLink(link.link, {message: 'New'})).rejects.toThrow();
    await manager.editBusinessChatLink(link.link, {title: 'Store'});
    expect(invokeApi).toHaveBeenLastCalledWith('account.editBusinessChatLink', {
      slug: link.link,
      link: {_: 'inputBusinessChatLink', message: 'Old', entities: undefined, title: 'Store'}
    });
  });

  test('a delete waits for the edits on their way, and an edit after it asks nothing', async() => {
    const link = makeLink();
    const messageSaved = deferredPromise<BusinessChatLink.businessChatLink>();
    const invokeApi = vi.fn()
    .mockImplementationOnce(() => messageSaved)
    .mockResolvedValueOnce(true);
    const {manager} = await withLinks([link], invokeApi);

    const editing = manager.editBusinessChatLink(link.link, {message: 'New'});
    const deleting = manager.deleteBusinessChatLink(link.link);
    await Promise.resolve();
    expect(invokeApi).toHaveBeenCalledTimes(1);

    messageSaved.resolve(makeLink({message: 'New'}));
    await editing;
    await expect(deleting).resolves.toBe(true);
    expect(invokeApi).toHaveBeenLastCalledWith('account.deleteBusinessChatLink', {slug: link.link});

    await expect(manager.editBusinessChatLink(link.link, {title: 'Shop'})).rejects.toThrow('BUSINESS_CHAT_LINK_NOT_FOUND');
    expect(invokeApi).toHaveBeenCalledTimes(2);
  });

  test('the list is asked for once the writes on their way have gone out', async() => {
    const link = makeLink();
    const messageSaved = deferredPromise<BusinessChatLink.businessChatLink>();
    const invokeApi = vi.fn().mockImplementationOnce(() => messageSaved);
    const {manager, apiManager} = await withLinks([link], invokeApi);

    const editing = manager.editBusinessChatLink(link.link, {message: 'New'});
    const listing = manager.getBusinessChatLinks();
    await Promise.resolve();
    expect(apiManager.invokeApiSingleProcess).toHaveBeenCalledTimes(1);

    messageSaved.resolve(makeLink({message: 'New'}));
    await editing;
    await listing;
    expect(apiManager.invokeApiSingleProcess).toHaveBeenCalledTimes(2);
  });

  test('a list asked before writes and answered after them takes the links as the writes left them', async() => {
    const edited = makeLink({message: 'Old'});
    const deleted = makeLink({link: 'https://t.me/m/gone'});
    const created = makeLink({link: 'https://t.me/m/new', message: 'Hi'});
    const kept = makeLink({link: 'https://t.me/m/kept', message: 'Same'});
    const answer = (links: BusinessChatLink.businessChatLink[]) => ({_: 'account.businessChatLinks', links, chats: [] as any[], users: [] as any[]});
    // * another tab's list: on its way while this tab writes
    const listed = deferredPromise<void>();
    const invokeApiSingleProcess = vi.fn()
    .mockImplementationOnce(({processResult}) => Promise.resolve(processResult(answer([edited, deleted, kept]))))
    .mockImplementationOnce(({processResult}) => listed.then(() => processResult(answer([edited, deleted, kept]))));
    const invokeApi = vi.fn(async(method: string, params: any) => {
      if(method === 'account.deleteBusinessChatLink') return true;
      if(method === 'account.createBusinessChatLink') return created;
      return makeLink({link: params.slug, message: params.link.message, title: params.link.title});
    });
    const {manager} = makeBusinessManager({invokeApi, invokeApiSingleProcess});
    await manager.getBusinessChatLinks();

    const listing = manager.getBusinessChatLinks();
    await vi.waitFor(() => expect(invokeApiSingleProcess).toHaveBeenCalledTimes(2));
    await manager.editBusinessChatLink(edited.link, {message: 'New'});
    await manager.deleteBusinessChatLink(deleted.link);
    await manager.createBusinessChatLink({message: 'Hi'});
    listed.resolve();

    await expect(listing).resolves.toEqual([
      makeLink({message: 'New'}),
      kept,
      created
    ]);

    // * so a rename after it keeps the new message
    await manager.editBusinessChatLink(edited.link, {title: 'Shop'});
    expect(invokeApi).toHaveBeenLastCalledWith('account.editBusinessChatLink', {
      slug: edited.link,
      link: {_: 'inputBusinessChatLink', message: 'New', entities: undefined, title: 'Shop'}
    });
  });

  test('a delete the server does not confirm fails', async() => {
    const invokeApi = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const {manager} = makeBusinessManager({invokeApi});

    await expect(manager.deleteBusinessChatLink('https://t.me/m/abcdef')).resolves.toBe(true);
    expect(invokeApi).toHaveBeenCalledWith('account.deleteBusinessChatLink', {slug: 'https://t.me/m/abcdef'});
    await expect(manager.deleteBusinessChatLink('https://t.me/m/abcdef')).rejects.toThrow();
  });
});

describe('business intro', () => {
  test('saves the start page with its sticker and keeps the own full user in step', async() => {
    const sticker = {_: 'document', id: '7', access_hash: '8', file_reference: new Uint8Array([1])};
    const userFull = makeUserFull();
    const invokeApi = vi.fn().mockResolvedValue(true);
    const {manager} = makeBusinessManager({invokeApi, userFull, docs: {'7': sticker}});

    const intro = await manager.updateBusinessIntro({title: ' Welcome ', description: 'Ask me', stickerId: '7'});

    expect(invokeApi).toHaveBeenCalledWith('account.updateBusinessIntro', {
      intro: {
        _: 'inputBusinessIntro',
        title: 'Welcome',
        description: 'Ask me',
        sticker: {_: 'inputDocument', id: '7', access_hash: '8', file_reference: sticker.file_reference}
      }
    });
    expect(intro).toEqual({_: 'businessIntro', title: 'Welcome', description: 'Ask me', sticker});
    expect(userFull.business_intro).toBe(intro);
  });

  test('an intro with nothing to show resets it to the default', async() => {
    const userFull = makeUserFull();
    userFull.business_intro = {_: 'businessIntro', title: 'Old', description: ''};
    const invokeApi = vi.fn().mockResolvedValue(true);
    const {manager} = makeBusinessManager({invokeApi, userFull});

    await expect(manager.updateBusinessIntro({title: '  ', description: ''})).resolves.toBeUndefined();

    expect(invokeApi).toHaveBeenCalledWith('account.updateBusinessIntro', {intro: undefined});
    expect(userFull.business_intro).toBeUndefined();
  });

  test('a refused save leaves the cached intro as it was', async() => {
    const userFull = makeUserFull();
    const invokeApi = vi.fn().mockResolvedValue(false);
    const {manager, appProfileManager} = makeBusinessManager({invokeApi, userFull});

    await expect(manager.updateBusinessIntro({title: 'Hi', description: ''})).rejects.toThrow();
    expect(appProfileManager.modifyCachedFullUser).not.toHaveBeenCalled();
  });
});

describe('sponsored messages for Premium', () => {
  function makeMessagesManager(options: {premium: boolean, userFull?: UserFull.userFull}) {
    const manager = new AppMessagesManager();
    const deps = {
      apiManager: {
        invokeApi: vi.fn().mockResolvedValue(true),
        invokeApiCacheable: vi.fn().mockResolvedValue({_: 'messages.sponsoredMessagesEmpty'}),
        clearCache: vi.fn()
      },
      appPeersManager: {
        getInputPeerById: vi.fn(() => ({_: 'inputPeerChannel'}))
      },
      appProfileManager: {
        getCachedFullUser: vi.fn((userId: UserId) => userId === MY_ID ? options.userFull : undefined),
        modifyCachedFullUser: vi.fn((userId: UserId, modify: (userFull: UserFull.userFull) => void) => {
          if(options.userFull && userId === MY_ID) modify(options.userFull);
        })
      },
      rootScope: {
        myId: MY_ID,
        premium: options.premium,
        dispatchEvent: vi.fn()
      }
    };
    Object.assign(manager as any, deps, {
      canSendToPeer: vi.fn().mockResolvedValue(false)
    });
    return {manager, ...deps};
  }

  const BOT_PEER_ID = 5000;

  test('asks for none once a Premium account hid them', async() => {
    const {manager, apiManager} = makeMessagesManager({premium: true, userFull: makeUserFull()});

    await expect(manager.getSponsoredMessage(BOT_PEER_ID)).resolves.toEqual({_: 'messages.sponsoredMessagesEmpty'});
    expect(apiManager.invokeApiCacheable).not.toHaveBeenCalled();
  });

  test('asks the server while the choice is not known, or ads are on, or the account is free', async() => {
    const cases = [
      makeMessagesManager({premium: true}),
      makeMessagesManager({premium: true, userFull: makeUserFull({sponsored_enabled: true})}),
      makeMessagesManager({premium: false, userFull: makeUserFull()})
    ];

    for(const {manager, apiManager} of cases) {
      await manager.getSponsoredMessage(BOT_PEER_ID);
      expect(apiManager.invokeApiCacheable).toHaveBeenCalledWith(
        'messages.getSponsoredMessages',
        {peer: {_: 'inputPeerChannel'}},
        {cacheSeconds: 300}
      );
    }
  });

  test('a toggle the server takes moves the own full user, forgets the cached answers and tells the open chats', async() => {
    const userFull = makeUserFull();
    const {manager, apiManager, rootScope} = makeMessagesManager({premium: true, userFull});

    await manager.toggleSponsoredMessages(true);
    expect(apiManager.invokeApi).toHaveBeenCalledWith('account.toggleSponsoredMessages', {enabled: true});
    expect(userFull.pFlags.sponsored_enabled).toBe(true);
    expect(apiManager.clearCache).toHaveBeenCalledWith('messages.getSponsoredMessages', expect.any(Function));
    expect(rootScope.dispatchEvent).toHaveBeenLastCalledWith('sponsored_messages_toggle', true);

    await manager.toggleSponsoredMessages(false);
    expect(userFull.pFlags.sponsored_enabled).toBeUndefined();
    expect(rootScope.dispatchEvent).toHaveBeenLastCalledWith('sponsored_messages_toggle', false);
  });

  test('a refused toggle changes nothing', async() => {
    const userFull = makeUserFull({sponsored_enabled: true});
    const {manager, apiManager, rootScope} = makeMessagesManager({premium: true, userFull});
    apiManager.invokeApi.mockResolvedValue(false);

    await expect(manager.toggleSponsoredMessages(false)).rejects.toThrow();
    expect(userFull.pFlags.sponsored_enabled).toBe(true);
    expect(apiManager.clearCache).not.toHaveBeenCalled();
    expect(rootScope.dispatchEvent).not.toHaveBeenCalled();
  });
});
