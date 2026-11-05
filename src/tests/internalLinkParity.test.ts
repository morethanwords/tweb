import {afterEach, beforeAll, describe, expect, test, vi} from 'vitest';
import '@helpers/peerIdPolyfill';

const mocks = vi.hoisted(() => ({
  toastNew: vi.fn(),
  setInnerPeer: vi.fn(),
  openUsername: vi.fn(),
  showSharingPicker2Popup: vi.fn(),
  confirmationPopup: vi.fn(),
  wrapPeerTitle: vi.fn(),
  showPeerPopup: vi.fn(),
  importContactToken: vi.fn(),
  getDeepLinkInfo: vi.fn(),
  resolveUserByUsername: vi.fn(),
  resolveUsername: vi.fn(),
  shareGame: vi.fn(),
  joinGroupCall: vi.fn(),
  joinCallFromLink: vi.fn(),
  joinLiveStream: vi.fn()
}));

// * where it is not, no link reaches a video chat at all
vi.mock('@environment/groupCallSupport', () => ({default: true}));

// everything the processor can open, none of which these links reach but through the mocks below
vi.mock('@components/popups/sharedFolderInvite', () => ({default: vi.fn()}));
vi.mock('@components/popups/joinChatInvite', () => ({default: vi.fn()}));
vi.mock('@components/popups/payment', () => ({createPaymentPopup: vi.fn()}));
vi.mock('@components/popups/peer', () => ({default: mocks.showPeerPopup}));
vi.mock('@components/popups/pickUser', () => ({
  showPickUser3Popup: vi.fn(),
  showSharingPicker2Popup: mocks.showSharingPicker2Popup
}));
vi.mock('@components/popups/stickers', () => ({default: vi.fn()}));
vi.mock('@components/toast', () => ({toastNew: mocks.toastNew, hideToast: vi.fn()}));
vi.mock('@lib/appImManager', () => ({
  default: {
    setInnerPeer: mocks.setInnerPeer,
    openUsername: mocks.openUsername,
    joinGroupCall: mocks.joinGroupCall,
    joinCallFromLink: mocks.joinCallFromLink,
    joinLiveStream: mocks.joinLiveStream,
    chat: {},
    getStackFromElement: (): undefined => undefined
  }
}));
vi.mock('@components/stories/viewer', () => ({createStoriesViewerWithPeer: vi.fn()}));
vi.mock('@components/popups/premium', () => ({default: vi.fn()}));
vi.mock('@components/popups/boost', () => ({default: vi.fn()}));
vi.mock('@components/popups/giftLink', () => ({default: vi.fn()}));
vi.mock('@components/popups/stars', () => ({default: vi.fn(), showGiftStarsPicker: vi.fn()}));
vi.mock('@components/popups/sendGift', () => ({default: vi.fn()}));
vi.mock('@components/popups/sendGiftPicker', () => ({default: vi.fn()}));
vi.mock('@stores/stars', () => ({prefetchStars: vi.fn()}));
vi.mock('@components/popups/starGiftInfo', () => ({default: vi.fn()}));
vi.mock('@components/sidebarRight', () => ({default: {}}));
vi.mock('@components/browser', () => ({openInstantViewInAppBrowser: vi.fn()}));
vi.mock('@components/sidebarLeft', () => ({default: {}}));
vi.mock('@components/solidJsTabs/tabs', () => ({AppContactsTab: {}, AppNewChannelTab: {}, AppMyStoriesTab: {}}));
vi.mock('@components/popups/createContact', () => ({default: vi.fn()}));
vi.mock('@components/sidebarLeft/tabs/createNewGroupTab', () => ({default: vi.fn()}));
vi.mock('@components/solidJsTabs', () => ({AppEditProfileTab: {}, AppSettingsTab: {}, getEditProfileInitArgs: vi.fn()}));
vi.mock('@components/popups/birthday', () => ({default: vi.fn(), saveMyBirthday: vi.fn()}));
vi.mock('@components/popups/addBotToChat', () => ({default: vi.fn()}));
vi.mock('@components/bankCardMenu', () => ({default: vi.fn()}));
vi.mock('@components/confirmationPopup', () => ({default: mocks.confirmationPopup}));
vi.mock('@components/wrappers/peerTitle', () => ({default: mocks.wrapPeerTitle}));
vi.mock('@lib/richTextProcessor/wrapRichText', () => ({
  default: (text: string) => document.createTextNode(text)
}));

type Processor = import('@lib/internalLinkProcessor').InternalLinkProcessor;
let processor: Processor;
let INTERNAL_LINK_TYPE: typeof import('@lib/internalLink').INTERNAL_LINK_TYPE;

beforeAll(async() => {
  const module = await import('@lib/internalLinkProcessor');
  INTERNAL_LINK_TYPE = (await import('@lib/internalLink')).INTERNAL_LINK_TYPE;
  processor = new module.InternalLinkProcessor();
  processor.construct({
    appUsersManager: {
      importContactToken: mocks.importContactToken,
      resolveUserByUsername: mocks.resolveUserByUsername,
      resolveUsername: mocks.resolveUsername
    },
    apiManager: {getDeepLinkInfo: mocks.getDeepLinkInfo},
    appGamesManager: {shareGame: mocks.shareGame}
  } as any);
});

afterEach(() => {
  vi.clearAllMocks();
});

/** clicks a link the way a message does: through the handler its anchor names */
function click(handler: string, href: string) {
  const a = document.createElement('a');
  a.href = href;
  return (window as any)[handler](a);
}

const USER_ID = 42 as UserId;

describe('contact token links', () => {
  test('make the owner of the link a contact and open the chat with them', async() => {
    mocks.importContactToken.mockResolvedValue({_: 'user', id: USER_ID, pFlags: {}});
    await click('contact', 'https://t.me/contact/Ab%2DCd');

    expect(mocks.importContactToken).toHaveBeenCalledWith('Ab-Cd');
    expect(mocks.setInnerPeer).toHaveBeenCalledWith({peerId: USER_ID.toPeerId(false)});
    expect(mocks.toastNew).not.toHaveBeenCalled();
  });

  test('read the token of the tg:// form too', async() => {
    mocks.importContactToken.mockResolvedValue({_: 'user', id: USER_ID, pFlags: {}});
    await click('tg_contact', 'tg://contact?token=AbCd&free=1');
    expect(mocks.importContactToken).toHaveBeenCalledWith('AbCd');
  });

  test.each([
    ['an expired token', () => mocks.importContactToken.mockRejectedValue({type: 'CONTACT_TOKEN_INVALID'})],
    ['a deleted user', () => mocks.importContactToken.mockResolvedValue({_: 'user', id: USER_ID, pFlags: {deleted: true}})]
  ])('say the link is dead for %s', async(_, arrange) => {
    arrange();
    await click('contact', 'https://t.me/contact/AbCd');

    expect(mocks.setInnerPeer).not.toHaveBeenCalled();
    expect(mocks.toastNew).toHaveBeenCalledWith({langPackKey: 'ContactLinkInvalid'});
  });

  test('stop, saying nothing, when the account session ends before the server answers', async() => {
    mocks.importContactToken.mockRejectedValue({type: 'MIDDLEWARE'});

    await expect(
      processor.processContactTokenLink({_: INTERNAL_LINK_TYPE.CONTACT_TOKEN, token: 'AbCd'})
    ).rejects.toEqual({type: 'MIDDLEWARE'});

    expect(mocks.toastNew).not.toHaveBeenCalled();
    expect(mocks.setInnerPeer).not.toHaveBeenCalled();
  });

  test('ask nothing for a link with no token', async() => {
    await click('tg_contact', 'tg://contact');

    expect(mocks.importContactToken).not.toHaveBeenCalled();
    expect(mocks.toastNew).toHaveBeenCalledWith({langPackKey: 'ContactLinkInvalid'});
  });
});

// * a proxy link asks to connect through a proxy (tdesktop's `^proxy/?\?(.+)`), which a browser cannot
// * do: it says so, and never opens the profile @proxy the path spells
describe('proxy links', () => {
  test.each([
    ['https://t.me/proxy?server=1.2.3.4&port=443&secret=ee00', 'proxy'],
    ['https://t.me/proxy/?server=1.2.3.4&port=443&secret=ee00', 'proxy'],
    ['https://telegram.me/Proxy?server=1.2.3.4&port=443&secret=ee00', 'proxy'],
    ['https://t.me/socks?server=1.2.3.4&port=1080&user=a&pass=b', 'socks'],
    ['tg://proxy?server=1.2.3.4&port=443&secret=ee00', 'tg_proxy'],
    ['tg://socks?server=1.2.3.4&port=1080', 'tg_socks']
  ])('say %s is not for the web, not resolve a username', async(href, handler) => {
    const {default: wrapUrl} = await import('@lib/richTextProcessor/wrapUrl');
    expect(wrapUrl(href).onclick).toBe(handler);

    await click(handler, href);
    expect(mocks.toastNew).toHaveBeenCalledWith({langPackKey: 'Link.NotSupported'});
    expect(mocks.openUsername).not.toHaveBeenCalled();
    expect(mocks.getDeepLinkInfo).not.toHaveBeenCalled();
  });

  test.each([
    'https://t.me/proxy',
    'https://t.me/proxy/123',
    'https://t.me/socks/1?server=1.2.3.4'
  ])('leave %s, which names no proxy, to the username', async(href) => {
    const {default: wrapUrl} = await import('@lib/richTextProcessor/wrapUrl');
    expect(wrapUrl(href).onclick).toBe('im');
  });
});

describe('unknown tg:// links', () => {
  test('show what the server says about them', async() => {
    mocks.getDeepLinkInfo.mockResolvedValue({
      _: 'help.deepLinkInfo',
      pFlags: {update_app: true},
      message: 'Update the app to open this link.',
      entities: []
    });
    mocks.confirmationPopup.mockResolvedValue(undefined);
    await click('unknownDeepLink', 'tg://some_future/path?x=1#y');

    expect(mocks.getDeepLinkInfo).toHaveBeenCalledWith('some_future/path');
    expect(mocks.confirmationPopup).toHaveBeenCalledTimes(1);
    const options = mocks.confirmationPopup.mock.calls[0][0];
    expect(options.description.textContent).toBe('Update the app to open this link.');
    expect(options.button).toEqual({langKey: 'OK', isCancel: true});
    expect(mocks.showPeerPopup).not.toHaveBeenCalled();
  });

  /** an anchor of a tg:// link the way wrapUrl makes one this handler takes */
  function unknownLink(href: string) {
    const a = document.createElement('a');
    a.href = href;
    a.setAttribute('onclick', 'unknownDeepLink(this)');
    return a;
  }

  // nothing is handed to the system after the lookup, when the browser no longer takes it as the
  // user's doing: Open does it, within its own press, as the plain link it was
  test.each([
    ['knows nothing about them', () => mocks.getDeepLinkInfo.mockResolvedValue({_: 'help.deepLinkInfoEmpty'})],
    ['cannot be asked', () => mocks.getDeepLinkInfo.mockRejectedValue({type: 'NETWORK_BAD_REQUEST'})]
  ])('offer to open them outside when the server %s', async(_, arrange) => {
    arrange();
    await processor.processUnknownDeepLink(unknownLink('tg://passport?bot_id=1'));

    expect(mocks.getDeepLinkInfo).toHaveBeenCalledWith('passport');
    expect(mocks.confirmationPopup).not.toHaveBeenCalled();
    expect(mocks.showPeerPopup).toHaveBeenCalledTimes(1);
    const [, options] = mocks.showPeerPopup.mock.calls[0];
    expect(options).toMatchObject({titleLangKey: 'OpenUrlTitle', descriptionLangKey: 'OpenUrlAlert2'});
    const a = options.descriptionLangArgs[0] as HTMLAnchorElement;
    expect(a.href).toBe('tg://passport?bot_id=1');
    expect(a.getAttribute('onclick')).toBeNull();

    const followed = vi.fn();
    a.addEventListener('click', followed);
    expect(options.buttons).toHaveLength(1);
    expect(options.buttons[0].langKey).toBe('Open');
    options.buttons[0].callback();
    expect(followed).toHaveBeenCalledTimes(1);
  });

  test('do nothing when the account session ends before the server answers', async() => {
    mocks.getDeepLinkInfo.mockRejectedValue({type: 'MIDDLEWARE'});

    await expect(processor.processUnknownDeepLink(unknownLink('tg://passport?bot_id=1'))).rejects.toEqual({type: 'MIDDLEWARE'});

    expect(mocks.confirmationPopup).not.toHaveBeenCalled();
    expect(mocks.showPeerPopup).not.toHaveBeenCalled();
  });
});

describe('game links', () => {
  const BOT_ID = 7 as BotId;
  const PEER_ID = (100 as ChatId).toPeerId(true);

  test('share the game to the chat picked, once confirmed, and open that chat', async() => {
    mocks.resolveUserByUsername.mockResolvedValue({_: 'user', id: BOT_ID, pFlags: {bot: true}});
    mocks.showSharingPicker2Popup.mockResolvedValue({peerId: PEER_ID, threadId: 5});
    const title = document.createElement('span');
    mocks.wrapPeerTitle.mockResolvedValue(title);
    mocks.confirmationPopup.mockResolvedValue(undefined);
    mocks.shareGame.mockResolvedValue(undefined);

    await processor.processInternalLink({_: INTERNAL_LINK_TYPE.MESSAGE, domain: 'gamebot', game: 'tetris'});

    // a forum's topic can be picked, Saved Messages cannot (tdesktop's ShowShareGameBox)
    expect(mocks.showSharingPicker2Popup).toHaveBeenCalledWith({chatRightsActions: ['send_games'], exceptSelf: true, useTopics: true});
    expect(mocks.confirmationPopup.mock.calls[0][0]).toMatchObject({
      descriptionLangKey: 'SendGameToText',
      descriptionLangArgs: [title]
    });
    expect(mocks.shareGame).toHaveBeenCalledWith({
      peerId: PEER_ID,
      threadId: 5,
      monoforumThreadId: undefined,
      botId: BOT_ID,
      shortName: 'tetris'
    });
    expect(mocks.setInnerPeer).toHaveBeenCalledWith({peerId: PEER_ID, threadId: 5, monoforumThreadId: undefined});
  });

  test('name a channel\'s direct-message conversation by its other side, and send it there', async() => {
    const DM_PEER_ID = USER_ID.toPeerId(false);
    mocks.resolveUserByUsername.mockResolvedValue({_: 'user', id: BOT_ID, pFlags: {bot: true}});
    mocks.showSharingPicker2Popup.mockResolvedValue({peerId: PEER_ID, monoforumThreadId: DM_PEER_ID});
    mocks.wrapPeerTitle.mockResolvedValue(document.createElement('span'));
    mocks.confirmationPopup.mockResolvedValue(undefined);
    mocks.shareGame.mockResolvedValue(undefined);

    await processor.processInternalLink({_: INTERNAL_LINK_TYPE.MESSAGE, domain: 'gamebot', game: 'tetris'});

    // the picker's row titles it the same way: PeerTitle names a monoforum's thread by its peer
    expect(mocks.wrapPeerTitle).toHaveBeenCalledWith({peerId: PEER_ID, threadId: DM_PEER_ID});
    expect(mocks.shareGame).toHaveBeenCalledWith(expect.objectContaining({peerId: PEER_ID, monoforumThreadId: DM_PEER_ID}));
  });

  test('send nothing when the share is not confirmed', async() => {
    mocks.resolveUserByUsername.mockResolvedValue({_: 'user', id: BOT_ID, pFlags: {bot: true}});
    mocks.showSharingPicker2Popup.mockResolvedValue({peerId: PEER_ID});
    mocks.wrapPeerTitle.mockResolvedValue(document.createElement('span'));
    mocks.confirmationPopup.mockRejectedValue(undefined);

    await processor.processInternalLink({_: INTERNAL_LINK_TYPE.MESSAGE, domain: 'gamebot', game: 'tetris'});

    expect(mocks.shareGame).not.toHaveBeenCalled();
    expect(mocks.setInnerPeer).not.toHaveBeenCalled();
  });

  /** a share of `tetris` to PEER_ID confirmed, whose send ends the way `arrange` says */
  async function shareConfirmed(arrange: () => void) {
    mocks.resolveUserByUsername.mockResolvedValue({_: 'user', id: BOT_ID, pFlags: {bot: true}});
    mocks.showSharingPicker2Popup.mockResolvedValue({peerId: PEER_ID});
    mocks.wrapPeerTitle.mockResolvedValue(document.createElement('span'));
    mocks.confirmationPopup.mockResolvedValue(undefined);
    arrange();

    await processor.processInternalLink({_: INTERNAL_LINK_TYPE.MESSAGE, domain: 'gamebot', game: 'tetris'});
    // the send is not awaited: its failure comes after the chat opens
    await Promise.resolve();
    await Promise.resolve();
  }

  test('say that the game could not be sent: no message in the chat stands for it', async() => {
    await shareConfirmed(() => mocks.shareGame.mockRejectedValue({type: 'BOT_GAMES_DISABLED'}));

    expect(mocks.setInnerPeer).toHaveBeenCalledWith({peerId: PEER_ID, threadId: undefined, monoforumThreadId: undefined});
    expect(mocks.toastNew).toHaveBeenCalledWith({langPackKey: 'Error.AnError'});
  });

  test.each([
    ['a slow mode wait, which has its own popup', 'SLOWMODE_WAIT_30'],
    ['the end of the account session', 'MIDDLEWARE']
  ])('say nothing more for %s', async(_, type) => {
    await shareConfirmed(() => mocks.shareGame.mockRejectedValue({type}));
    expect(mocks.toastNew).not.toHaveBeenCalled();
  });

  test('neither send nor open anything once the tab is leaving the account it was confirmed on', async() => {
    const {getCurrentAccount, setAccountSwitchingTo} = await import('@lib/accounts/getCurrentAccount');
    try {
      await shareConfirmed(() => {
        mocks.confirmationPopup.mockImplementation(async() => {
          setAccountSwitchingTo(getCurrentAccount() === 1 ? 2 : 1);
        });
      });
    } finally {
      setAccountSwitchingTo(undefined);
      mocks.confirmationPopup.mockReset();
    }

    expect(mocks.shareGame).not.toHaveBeenCalled();
    expect(mocks.setInnerPeer).not.toHaveBeenCalled();
  });

  test('stop when the bot lookup ends with the account session, not open the name as a plain link', async() => {
    mocks.resolveUserByUsername.mockRejectedValue({type: 'MIDDLEWARE'});

    await expect(
      processor.processInternalLink({_: INTERNAL_LINK_TYPE.MESSAGE, domain: 'gamebot', game: 'tetris'})
    ).rejects.toEqual({type: 'MIDDLEWARE'});

    expect(mocks.openUsername).not.toHaveBeenCalled();
    expect(mocks.showSharingPicker2Popup).not.toHaveBeenCalled();
  });

  test('open a name that is not a bot as a plain link', async() => {
    mocks.resolveUserByUsername.mockResolvedValue({_: 'user', id: USER_ID, pFlags: {}});

    await processor.processInternalLink({_: INTERNAL_LINK_TYPE.MESSAGE, domain: 'durov', game: 'tetris'});

    expect(mocks.showSharingPicker2Popup).not.toHaveBeenCalled();
    expect(mocks.openUsername).toHaveBeenCalledWith(expect.objectContaining({userName: 'durov'}));
  });

  test('read the game of a t.me link', async() => {
    mocks.resolveUserByUsername.mockResolvedValue(undefined);
    await click('im', 'https://t.me/gamebot?game=tetris');

    expect(mocks.resolveUserByUsername).toHaveBeenCalledWith('gamebot');
    expect(mocks.openUsername).toHaveBeenCalledWith(expect.objectContaining({userName: 'gamebot'}));
  });
});

// * a link puts no one into a call unasked (tdesktop's joinVoiceChatFromLink): only the chat's own service message
// * joins as the chat's Join button does, and the address it carries is anyone's to hand over
describe('video chat links', () => {
  const CHAT_ID = 77 as ChatId;
  const PEER_ID = CHAT_ID.toPeerId(true);
  const HREF = `tg://voicechat?chat_id=${CHAT_ID}&id=123&access_hash=456`;

  async function serviceMessageAnchor() {
    const {default: wrapJoinVoiceChatAnchor} = await import('@components/wrappers/joinVoiceChatAnchor');
    return wrapJoinVoiceChatAnchor({
      _: 'messageService',
      peerId: PEER_ID,
      action: {_: 'messageActionGroupCall', call: {_: 'inputGroupCall', id: '123', access_hash: '456'}}
    } as any) as HTMLAnchorElement;
  }

  test('ask before joining the call a tg://voicechat link names, from a message or handed to the page', async() => {
    const {default: wrapUrl} = await import('@lib/richTextProcessor/wrapUrl');
    expect(wrapUrl(HREF).onclick).toBe('tg_voicechat');

    await click('tg_voicechat', HREF);

    expect(mocks.setInnerPeer).toHaveBeenCalledWith({peerId: PEER_ID});
    expect(mocks.joinCallFromLink).toHaveBeenCalledWith(PEER_ID, '123');
    expect(mocks.joinGroupCall).not.toHaveBeenCalled();
  });

  test('join from the service message of the call as the chat\'s Join button does', async() => {
    const a = await serviceMessageAnchor();
    expect(a.getAttribute('onclick')).toBe('tg_voicechat(this)');

    await (window as any).tg_voicechat(a);

    expect(mocks.joinGroupCall).toHaveBeenCalledWith(PEER_ID, '123');
    expect(mocks.joinCallFromLink).not.toHaveBeenCalled();
  });

  test('take a copy of the service message\'s anchor for a link', async() => {
    const a = (await serviceMessageAnchor()).cloneNode(true) as HTMLAnchorElement;

    await (window as any).tg_voicechat(a);

    expect(mocks.joinCallFromLink).toHaveBeenCalledWith(PEER_ID, '123');
    expect(mocks.joinGroupCall).not.toHaveBeenCalled();
  });

  test.each([
    'https://t.me/somechannel?livestream',
    'https://t.me/somechannel?videochat',
    'https://t.me/somechannel?voicechat=hash',
    'tg://resolve?domain=somechannel&livestream'
  ])('ask before joining the chat\'s running call by %s, whatever it calls it', async(href) => {
    mocks.resolveUsername.mockResolvedValue({_: 'channel', id: CHAT_ID, pFlags: {}});
    const {default: wrapUrl} = await import('@lib/richTextProcessor/wrapUrl');

    await click(wrapUrl(href).onclick, href);

    expect(mocks.resolveUsername).toHaveBeenCalledWith('somechannel');
    expect(mocks.setInnerPeer).toHaveBeenCalledWith({peerId: PEER_ID});
    expect(mocks.joinCallFromLink).toHaveBeenCalledWith(PEER_ID, undefined);
    expect(mocks.joinLiveStream).not.toHaveBeenCalled();
    expect(mocks.joinGroupCall).not.toHaveBeenCalled();
  });

  test('open a user a link of the kind names', async() => {
    mocks.resolveUsername.mockResolvedValue({_: 'user', id: 5, pFlags: {}});

    await click('im', 'https://t.me/someone?livestream');

    expect(mocks.openUsername).toHaveBeenCalledWith({userName: 'someone'});
    expect(mocks.joinCallFromLink).not.toHaveBeenCalled();
    expect(mocks.joinLiveStream).not.toHaveBeenCalled();
  });
});
