/*
 * The conference join popup. Everything it says comes from data the caller
 * passes in — who invited us and who is already in the call — so the wording
 * is the whole feature: tdesktop's `ConferenceCallJoinConfirm` names up to
 * three people and counts the rest against the call's full count.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import '@helpers/peerIdPolyfill';

const mocks = vi.hoisted(() => ({
  popupFactory: undefined as (() => any) | undefined,
  onClose: undefined as (() => void) | undefined
}));

vi.mock('@lib/langPack', () => ({
  i18n: (key: string, args?: unknown[]) => (args?.length ? `${key}:${args.join('|')}` : key)
}));

vi.mock('@components/wrappers/peerTitle', () => ({
  default: ({peerId}: {peerId: PeerId}) => Promise.resolve('peer' + peerId)
}));

vi.mock('@lib/rootScope', () => ({
  default: {get myId() { return MY_ID; }}
}));

vi.mock('@components/iconTsx', () => ({
  IconTsx: (props: any) => <span data-icon={props.icon} />
}));

vi.mock('@components/stackedAvatars', () => ({
  StackedAvatarsTsx: (props: any) => (
    <span data-testid="stacked-avatars" data-peer-ids={props.peerIds.join(',')} data-size={props.avatarSize} />
  )
}));

vi.mock('@components/mediaHeader', () => {
  const MediaHeader = (props: any) => <div data-testid="media-header">{props.children}</div>;
  MediaHeader.Sticker = (props: any) => <div data-testid="sticker">{props.element}</div>;
  MediaHeader.Title = (props: any) => <div data-testid="title">{props.children}</div>;
  MediaHeader.Subtitle = (props: any) => <div data-testid="subtitle">{props.children}</div>;
  return {default: MediaHeader};
});

vi.mock('@components/popups/indexTsx', () => {
  const PopupElement = (props: any) => {
    mocks.onClose = props.onClose;
    return <div>{props.children}</div>;
  };
  PopupElement.Header = (props: any) => <div>{props.children}</div>;
  PopupElement.CloseButton = () => <button data-testid="close" />;
  PopupElement.Body = (props: any) => <div>{props.children}</div>;
  PopupElement.Footer = (props: any) => <div>{props.children}</div>;
  PopupElement.FooterButton = (props: any) => (
    <button data-testid="footer-button" onClick={props.callback}>{props.children || props.langKey}</button>
  );

  return {
    default: PopupElement,
    createPopup: (factory: () => any) => {
      mocks.popupFactory = factory;
    }
  };
});

import showConferenceJoinPopup, {ConferenceJoinPopupOptions} from '@components/call/conferenceJoinPopup';

const MY_ID = (1).toPeerId();
const INVITER = (101).toPeerId();
const A = (201).toPeerId();
const B = (202).toPeerId();
const C = (203).toPeerId();
const D = (204).toPeerId();

let dispose: () => void;
let container: HTMLElement;

// Wrapped so that awaiting the render doesn't also await the popup's own
// promise — that one only settles once the popup is answered.
async function open(options: ConferenceJoinPopupOptions) {
  const promise = showConferenceJoinPopup(options);
  // The popup is built once the peer titles resolve.
  await vi.waitFor(() => expect(mocks.popupFactory).toBeTypeOf('function'));

  container = document.createElement('div');
  document.body.append(container);
  dispose = render(() => mocks.popupFactory!(), container);

  return {promise};
}

const text = (testId: string) => container.querySelector(`[data-testid="${testId}"]`)?.textContent;

describe('conference join popup', () => {
  beforeEach(() => {
    mocks.popupFactory = undefined;
    mocks.onClose = undefined;
  });

  afterEach(() => {
    dispose?.();
    document.body.replaceChildren();
  });

  it('leads with the call glyph, the title and who is inviting', async() => {
    const {promise} = await open({inviterPeerId: INVITER, participantPeerIds: []});

    expect(container.querySelector('[data-testid="sticker"] [data-icon]').getAttribute('data-icon')).toBe('phone_filled');
    expect(text('title')).toBe('ConferenceCall.Join.Title');
    expect(text('subtitle')).toBe(`ConferenceCall.Join.TextInviter:peer${INVITER}`);
    expect(text('footer-button')).toBe('ConferenceCall.Join.Button');
    // Nobody in the call yet — nothing to separate or to list.
    expect(container.querySelector('[data-testid="stacked-avatars"]')).toBeNull();

    (container.querySelector('[data-testid="footer-button"]') as HTMLElement).click();
    await expect(promise).resolves.toBeUndefined();
  });

  it('falls back to the impersonal invite when there is no inviter to name', async() => {
    const {promise} = await open({participantPeerIds: []});
    expect(text('subtitle')).toBe('ConferenceCall.Join.Text');
    mocks.onClose!();
    await expect(promise).rejects.toBeUndefined();

    dispose();
    // Being invited by yourself is not information.
    const {promise: second} = await open({inviterPeerId: MY_ID, participantPeerIds: []});
    expect(text('subtitle')).toBe('ConferenceCall.Join.Text');
    mocks.onClose!();
    await expect(second).rejects.toBeUndefined();
  });

  it('names up to three people who already joined, under their avatars', async() => {
    const {promise} = await open({inviterPeerId: INVITER, participantPeerIds: [A, B]});

    const avatars = container.querySelector('[data-testid="stacked-avatars"]');
    expect(avatars.getAttribute('data-peer-ids')).toBe(`${A},${B}`);
    expect(container.textContent).toContain(`ConferenceCall.Join.AlreadyTwo:peer${A}|peer${B}`);

    mocks.onClose!();
    await expect(promise).rejects.toBeUndefined();
  });

  it('counts the rest against the call’s full count, not the listed page', async() => {
    const {promise} = await open({
      inviterPeerId: INVITER,
      participantPeerIds: [A, B, C, D],
      participantsCount: 12
    });

    // Only three faces fit; 12 in the call minus the two named leads the text,
    // so the plural form is picked from the count.
    expect(container.querySelector('[data-testid="stacked-avatars"]').getAttribute('data-peer-ids'))
    .toBe(`${A},${B},${C}`);
    expect(container.textContent).toContain(`ConferenceCall.Join.AlreadyMany:10|peer${A}|peer${B}`);

    mocks.onClose!();
    await expect(promise).rejects.toBeUndefined();
  });
});
