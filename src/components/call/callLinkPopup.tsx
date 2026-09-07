import {createSignal, Show} from 'solid-js';
import CallLogo from '@components/call/callLogo';
import anchorCallback from '@helpers/dom/anchorCallback';
import classNames from '@helpers/string/classNames';
import {DelimiterWithText} from '@components/chat/giveaway';
import MediaHeader from '@components/mediaHeader';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import shareUrlToPeers from '@components/popups/shareUrl';
import {toastNew} from '@components/toast';
import Button from '@components/button';
import {InviteLink} from '@components/sidebarLeft/tabs/inviteLink';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import createListenerSetter from '@helpers/solid/createListenerSetter';
import {i18n} from '@lib/langPack';
import appImManager from '@lib/appImManager';
import noop from '@helpers/noop';
import styles from '@components/call/callLinkPopup.module.scss';

/**
 * The slug a conference invite link carries. tdesktop pulls it out of the link
 * the same way (`ExtractConferenceSlug`, calls_group_common.cpp:528) rather
 * than keeping it beside the link.
 */
export function extractConferenceSlug(link: string): string | undefined {
  return /[?&#]slug=([^&#]+)/.exec(link)?.[1] ||
    /\/call\/([^/?&#]+)/.exec(link)?.[1];
}

export type CallLinkPopupOptions = {
  link: string,
  /**
   * The box straight after creating the link, which is the only one that
   * offers "be the first to join" — tdesktop gates the whole footer on
   * `args.initial` (calls_group_common.cpp:424).
   */
  initial?: boolean
};

/**
 * "Call Link" — the box tdesktop shows once a conference exists only as a link
 * (`ShowConferenceCallLinkBox`, calls_group_common.cpp:283). Same shape as the
 * join box it is a sibling of: logo, title, one line of explanation, then the
 * link itself and what you can do with it.
 */
export default function showCallLinkPopup(options: CallLinkPopupOptions) {
  const {link, initial} = options;
  const [show, setShow] = createSignal(false);

  const share = () => {
    setShow(false);
    shareUrlToPeers({
      url: link,
      multiSelect: true,
      toastKey: 'InviteLinkSentSingle',
      toastKeyForMany: 'InviteLinkSentMany'
    });
  };

  // The shared link box — the link itself (click to copy) with its actions
  // underneath, here two of them.
  const listenerSetter = createListenerSetter();
  const shareButton = Button('', {text: 'Share'});
  const copyButton = Button('', {text: 'Copy'});
  attachClickEvent(shareButton, () => share(), {listenerSetter});
  attachClickEvent(copyButton, () => inviteLink.copyLink(), {listenerSetter});
  const inviteLink = new InviteLink({
    listenerSetter,
    url: link,
    class: styles.inviteLink,
    // The link box copies on click and there is a Copy button right below it;
    // a third copy affordance inside the box would be noise.
    noRightButton: true,
    button: [shareButton, copyButton]
  });

  const join = () => {
    const slug = extractConferenceSlug(link);
    if(!slug) {
      toastNew({langPackKey: 'Error.AnError'});
      return;
    }

    setShow(false);
    // Pressing "be the first to join" IS the agreement to join this call —
    // tdesktop goes straight into it too (calls_group_common.cpp:462). Without
    // this the generic "join this call?" box would ask again.
    appImManager.joinConference(
      {_: 'inputGroupCallSlug', slug},
      {confirmed: true}
    ).catch(noop);
  };

  createPopup(() => (
    <PopupElement
      class={styles.popup}
      show={show()}
      closable
      old
    >
      <PopupElement.Header class={styles.header}>
        <PopupElement.CloseButton />
      </PopupElement.Header>
      <PopupElement.Body class="text-overflow-wrap">
        <MediaHeader class={styles.mediaHeader}>
          <CallLogo icon="link" />
          <MediaHeader.Title>{i18n('CallLink.Title')}</MediaHeader.Title>
          <MediaHeader.Subtitle secondary>{i18n('CallLink.About')}</MediaHeader.Subtitle>
        </MediaHeader>
        {inviteLink.container}
        <Show when={initial}>
          <DelimiterWithText langKey="PremiumOr" />
          <div class={classNames('text-center', 'secondary', styles.joinLine)}>
            {i18n('CallLink.Join', [
              (() => {
                // The `>` in the string becomes the arrow icon (superFormatter).
                const a = anchorCallback(join);
                a.classList.add('primary');
                a.append(i18n('CallLink.JoinLink'));
                return a;
              })()
            ])}
          </div>
        </Show>
      </PopupElement.Body>
    </PopupElement>
  ));

  queueMicrotask(() => setShow(true));
}
