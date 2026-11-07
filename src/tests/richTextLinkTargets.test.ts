/*
 * A link goes where it reads. When some of its text is drawn as something else — a custom emoji or a picture
 * (an image, its text only standing for it) or a spoiler (hidden) — it asks before it opens; a username or a bot
 * command drawn so is no link at all. A rich text's phone or email that is not the one it reads asks first too,
 * and is a text link where those are hidden.
 */

import {stubBrowserGlobals} from '@/tests/helpers/browserGlobals';
import type {MessageEntity, RichText} from '@layer';
import {concat, emoji, plain} from '@/tests/helpers/richText';

// wrapRichText reaches the worker proxy through langPack; none of that is needed to build a link
vi.mock('@lib/apiManagerProxy', () => import('@/tests/mocks/stubModule'));
// what is drawn of a custom emoji needs its sticker; the link around it only needs to know it is there
vi.mock('@environment/customEmojiSupport', () => ({default: false}));

let wrapRichText: typeof import('@lib/richTextProcessor/wrapRichText').default;
let wrapTelegramRichText: typeof import('@lib/richTextProcessor/wrapTelegramRichText').default;
let filterDisabledEntities: typeof import('@lib/richTextProcessor/filterDisabledEntities').default;
let MESSAGE_LINK_ENTITY_TYPES: ReadonlySet<MessageEntity['_']>;

beforeAll(async() => {
  stubBrowserGlobals();
  wrapRichText = (await import('@lib/richTextProcessor/wrapRichText')).default;
  wrapTelegramRichText = (await import('@lib/richTextProcessor/wrapTelegramRichText')).default;
  const filter = await import('@lib/richTextProcessor/filterDisabledEntities');
  filterDisabledEntities = filter.default;
  MESSAGE_LINK_ENTITY_TYPES = filter.MESSAGE_LINK_ENTITY_TYPES;
});


function draw(richText: RichText) {
  const {text, entities} = wrapTelegramRichText(richText);
  const container = document.createElement('div');
  container.append(wrapRichText(text, {entities, passEntities: {messageEntityBotCommand: true}}));
  return container;
}

const asks = (link: Element) => link?.getAttribute('onclick') === 'showMaskedAlert(this)';

describe('a link whose text is not all drawn as itself', () => {
  test('a URL ending in a custom emoji asks, and says where it goes', () => {
    const link = draw({_: 'textAutoUrl', text: concat(plain('https://telegram.org'), emoji('.evil.example/login'))})
    .querySelector('a.anchor-url');
    expect(link.getAttribute('href')).toBe('https://telegram.org.evil.example/login');
    expect(asks(link)).toBe(true);

    expect(asks(draw({_: 'textAutoUrl', text: plain('https://telegram.org')}).querySelector('a.anchor-url'))).toBe(false);
  });

  test('a text link to its own text asks when part of that text is an emoji or a spoiler', () => {
    const url = 'https://telegram.org.evil.example/login';
    const withEmoji = concat(plain('https://telegram.org'), emoji('.evil.example/login'));
    const withSpoiler = concat(plain('https://telegram.org'), {_: 'textSpoiler', text: plain('.evil.example/login')});
    expect(asks(draw({_: 'textUrl', text: withEmoji, url, webpage_id: '0'}).querySelector('a.anchor-url'))).toBe(true);
    expect(asks(draw({_: 'textUrl', text: withSpoiler, url, webpage_id: '0'}).querySelector('a.anchor-url'))).toBe(true);
    expect(asks(draw({_: 'textUrl', text: plain(url), url, webpage_id: '0'}).querySelector('a.anchor-url'))).toBe(false);
  });

  test('a username or a bot command partly drawn as an emoji is no link', () => {
    expect(draw({_: 'textMention', text: concat(plain('@durov'), emoji('_fake'))}).querySelector('a')).toBeNull();
    expect(draw({_: 'textMention', text: plain('@durov')}).querySelector('a.mention')).not.toBeNull();
    expect(draw({_: 'textBotCommand', text: concat(plain('/start'), emoji('_evil'))}).querySelector('a')).toBeNull();
    expect(draw({_: 'textBotCommand', text: plain('/start')}).querySelector('a')).not.toBeNull();
  });
});

describe('a rich text\'s phone and email', () => {
  test('ask first when they are not the number or the address they read', () => {
    const phone = (text: string, number: string) => draw({_: 'textPhone', text: plain(text), phone: number}).querySelector('a.phone-url');
    expect(phone('+1 800 555 0100', '+447700900123').getAttribute('href')).toBe('tel:+447700900123');
    expect(asks(phone('+1 800 555 0100', '+447700900123'))).toBe(true);
    expect(asks(phone('+1 (800) 555-0100', '+18005550100'))).toBe(false);

    const email = (text: string, address: string) => draw({_: 'textEmail', text: plain(text), email: address}).querySelector('a');
    expect(asks(email('support@telegram.org', 'phish@evil.example'))).toBe(true);
    expect(asks(email('Support@Telegram.org', 'support@telegram.org'))).toBe(false);
  });

  test('are hidden with text links, while a number found in a text is not', () => {
    const rich = wrapTelegramRichText(concat(
      {_: 'textPhone', text: plain('+1 800 555 0100'), phone: '+18005550100'},
      {_: 'textAutoPhone', text: plain(' +1 800 555 0199')}
    ));
    const kept = filterDisabledEntities(rich.entities, MESSAGE_LINK_ENTITY_TYPES);
    expect(kept.map((entity) => [entity._, entity.offset])).toEqual([['messageEntityPhone', 15]]);
  });
});
