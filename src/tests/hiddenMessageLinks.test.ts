import {describe, expect, test} from 'vitest';
import '@helpers/peerIdPolyfill';
import type {Message, PeerSettings} from '@layer';
import {
  HIDDEN_LINK_ENTITY_TYPES,
  shouldHideMessageLinks,
  shouldHidePeerMessageLinks
} from '@components/chat/bubbles/hiddenLinks';
import filterDisabledEntities, {
  MESSAGE_LINK_ENTITY_SELECTOR
} from '@lib/richTextProcessor/filterDisabledEntities';
import parseEntities from '@lib/richTextProcessor/parseEntities';

let wrapRichText: typeof import('@lib/richTextProcessor/wrapRichText').default;
let createSolidMessageText: typeof import('@components/chat/bubbleParts/solidMessageText').createSolidMessageText;

beforeAll(async() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/webp;base64,');
  vi.doMock('@lib/customEmoji/element', () => ({
    default: {
      create: () => document.createElement('span')
    }
  }));
  vi.doMock('@lib/customEmoji/renderer', () => ({
    CustomEmojiRendererElement: {
      create: () => ({})
    }
  }));
  vi.doMock('@components/dotRenderer', () => ({
    default: {
      attachBluffTextSpoilerTarget: () => {}
    }
  }));
  vi.doMock('@lib/langPack', () => ({
    default: {
      format: () => '',
      // The code-block header's icons read this. Without it any test here that renders a
      // messageEntityPre dies in Icon() instead of exercising what it meant to.
      getIsRTL: () => false
    },
    i18n: () => document.createTextNode('')
  }));
  ({default: wrapRichText} = await import('@lib/richTextProcessor/wrapRichText'));
  ({createSolidMessageText} = await import('@components/chat/bubbleParts/solidMessageText'));
});

afterAll(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const incomingMessage = {
  _: 'message',
  pFlags: {}
} as Message.message;

const outgoingMessage = {
  _: 'message',
  pFlags: {out: true}
} as Message.message;

const localMessage = {
  _: 'message',
  pFlags: {local: true}
} as Message.message;

const serviceMessage = {
  _: 'messageService',
  pFlags: {}
} as Message.messageService;

const emptyPeerSettings = {
  _: 'peerSettings',
  pFlags: {}
} as PeerSettings;

const userPeerId = (1 as UserId).toPeerId(false);
const groupPeerId = (1 as ChatId).toPeerId(true);

describe('hidden message links', () => {
  test('requires loaded suspicious-user settings like iOS', () => {
    expect(shouldHidePeerMessageLinks(userPeerId)).toBe(false);
    expect(shouldHidePeerMessageLinks(userPeerId, emptyPeerSettings)).toBe(false);
    expect(shouldHideMessageLinks(incomingMessage, userPeerId)).toBe(false);
    expect(shouldHideMessageLinks(incomingMessage, userPeerId, emptyPeerSettings)).toBe(false);
  });

  test('uses the server report and block flags', () => {
    const reportSettings = {
      _: 'peerSettings',
      pFlags: {report_spam: true}
    } as PeerSettings;
    const blockSettings = {
      _: 'peerSettings',
      pFlags: {block_contact: true}
    } as PeerSettings;
    const addContactSettings = {
      _: 'peerSettings',
      pFlags: {add_contact: true}
    } as PeerSettings;

    expect(shouldHidePeerMessageLinks(userPeerId, reportSettings)).toBe(true);
    expect(shouldHidePeerMessageLinks(userPeerId, blockSettings)).toBe(true);
    expect(shouldHidePeerMessageLinks(userPeerId, addContactSettings)).toBe(false);
    expect(shouldHideMessageLinks(incomingMessage, userPeerId, reportSettings)).toBe(true);
    expect(shouldHideMessageLinks(incomingMessage, userPeerId, blockSettings)).toBe(true);
    expect(shouldHideMessageLinks(outgoingMessage, userPeerId, reportSettings)).toBe(false);
    expect(shouldHideMessageLinks(localMessage, userPeerId, blockSettings)).toBe(false);
    expect(shouldHideMessageLinks(serviceMessage, userPeerId, reportSettings)).toBe(false);
  });

  test('keeps group links enabled before and after peer settings load', () => {
    const reportSettings = {
      _: 'peerSettings',
      pFlags: {report_spam: true}
    } as PeerSettings;

    expect(shouldHidePeerMessageLinks(groupPeerId)).toBe(false);
    expect(shouldHidePeerMessageLinks(groupPeerId, emptyPeerSettings)).toBe(false);
    expect(shouldHidePeerMessageLinks(groupPeerId, reportSettings)).toBe(false);
    expect(shouldHideMessageLinks(incomingMessage, groupPeerId, reportSettings)).toBe(false);
    expect(shouldHideMessageLinks(incomingMessage, groupPeerId, reportSettings, true)).toBe(false);
  });

  test('supports a test-only non-contact override without changing message scope', () => {
    expect(shouldHideMessageLinks(incomingMessage, userPeerId, emptyPeerSettings, true)).toBe(true);
    expect(shouldHideMessageLinks(outgoingMessage, userPeerId, emptyPeerSettings, true)).toBe(false);
    expect(shouldHideMessageLinks(localMessage, userPeerId, emptyPeerSettings, true)).toBe(false);
    expect(shouldHideMessageLinks(serviceMessage, userPeerId, emptyPeerSettings, true)).toBe(false);
  });

  test('matches the iOS suspicious-peer entity set and retains the stricter cashtag rule', () => {
    const entities = filterDisabledEntities([{
      _: 'messageEntityUrl',
      offset: 0,
      length: 4
    }, {
      _: 'messageEntityEmail',
      offset: 5,
      length: 5
    }, {
      _: 'messageEntityMentionName',
      offset: 11,
      length: 4,
      user_id: 1 as UserId
    }, {
      _: 'messageEntityBankCard',
      offset: 16,
      length: 4
    }, {
      _: 'messageEntityCashtag',
      offset: 21,
      length: 4
    }, {
      _: 'messageEntityBold',
      offset: 26,
      length: 4
    }], HIDDEN_LINK_ENTITY_TYPES);

    expect(entities.map((entity) => entity._)).toEqual(['messageEntityBold']);
  });

  test('also removes links detected locally from plain text', () => {
    const entities = filterDisabledEntities(
      parseEntities('https://example.com'),
      HIDDEN_LINK_ENTITY_TYPES
    );

    expect(entities).toHaveLength(0);
  });

  test('keeps phone links interactive while rich navigation is disabled', () => {
    const container = document.createElement('div');
    container.append(wrapRichText('link +123', {
      entities: [{
        _: 'messageEntityUrl',
        offset: 0,
        length: 4
      }, {
        _: 'messageEntityPhone',
        offset: 5,
        length: 4
      }],
      disabledEntities: HIDDEN_LINK_ENTITY_TYPES,
      noNavigation: true
    }));

    expect(container.querySelector('.anchor-url')).toBeNull();
    expect(container.querySelector('a[href="tel:+123"]')).not.toBeNull();
  });

  test('marks only entity navigation disabled by the suspicious-peer policy', () => {
    const container = document.createElement('div');
    container.append(wrapRichText('link +123 /go 0:01', {
      entities: [{
        _: 'messageEntityUrl',
        offset: 0,
        length: 4
      }, {
        _: 'messageEntityPhone',
        offset: 5,
        length: 4
      }, {
        _: 'messageEntityBotCommand',
        offset: 10,
        length: 3
      }, {
        _: 'messageEntityTimestamp',
        offset: 14,
        length: 4,
        time: 1
      }],
      passEntities: {messageEntityBotCommand: true},
      fromBot: true,
      maxMediaTimestamp: 60
    }));

    expect(container.querySelector('.anchor-url')?.matches(MESSAGE_LINK_ENTITY_SELECTOR)).toBe(true);
    expect(container.querySelector('.phone-url')?.matches(MESSAGE_LINK_ENTITY_SELECTOR)).toBe(false);
    expect(container.querySelector('a[href^="tg://bot_command"]')?.matches(MESSAGE_LINK_ENTITY_SELECTOR)).toBe(false);
    expect(container.querySelector('.timestamp')?.matches(MESSAGE_LINK_ENTITY_SELECTOR)).toBe(false);
  });

  test('updates a stable streaming body before a link arrives', () => {
    const host = document.createElement('div');
    const controller = createSolidMessageText(host, {
      sourceRevision: 1,
      source: {
        _: 'textWithEntities',
        text: 'wait',
        entities: []
      },
      phase: 'streaming'
    }, {
      reducedMotion: () => true,
      richTextOptions: {
        disabledEntities: HIDDEN_LINK_ENTITY_TYPES,
        noNavigation: true
      }
    });
    const root = host.firstElementChild;

    controller.setPolicy();
    controller.update({
      sourceRevision: 2,
      source: {
        _: 'textWithEntities',
        text: 'wait https://example.com',
        entities: [{
          _: 'messageEntityUrl',
          offset: 5,
          length: 19
        }]
      },
      phase: 'streaming'
    });

    expect(host.firstElementChild).toBe(root);
    expect(root.querySelector('a')).not.toBeNull();
    controller.dispose();
  });
});
