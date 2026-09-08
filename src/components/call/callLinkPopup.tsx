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
import confirmationPopup from '@components/confirmationPopup';
import showLinkQrCodePopup from '@components/popups/linkQrCode';
import rootScope from '@lib/rootScope';
import noop from '@helpers/noop';
import type {GroupCallId} from '@appManagers/appGroupCallsManager';
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
  initial?: boolean,
  /** The call the link belongs to. Revoking needs it; without it that item is hidden. */
  callId?: GroupCallId,
  /**
   * Whether this account may reset the link. tdesktop's `canManage()` for a
   * conference is the `creator` flag and nothing else (data_group_call.cpp:154).
   */
  canManage?: boolean
};

/**
 * "Call Link" — the box tdesktop shows once a conference exists only as a link
 * (`ShowConferenceCallLinkBox`, calls_group_common.cpp:283). Same shape as the
 * join box it is a sibling of: logo, title, one line of explanation, then the
 * link itself and what you can do with it.
 */
export default function showCallLinkPopup(options: CallLinkPopupOptions) {
  const {initial, callId, canManage} = options;
  // Revoking mints a new link in place, so nothing may capture the old one.
  const [link, setLink] = createSignal(options.link);
  const [show, setShow] = createSignal(false);

  const share = () => {
    setShow(false);
    shareUrlToPeers({
      url: link(),
      multiSelect: true,
      toastKey: 'InviteLinkSentSingle',
      toastKeyForMany: 'InviteLinkSentMany'
    });
  };

  /**
   * `reset_invite_hash` is how tdesktop revokes a call link
   * (calls_group_common.cpp:315-337): reset it, then show the box again on the
   * link the server just minted.
   */
  const revoke = async() => {
    await confirmationPopup({
      titleLangKey: 'RevokeLink',
      descriptionLangKey: 'CallLink.RevokeAlert',
      button: {langKey: 'RevokeButton', isDanger: true}
    });

    try {
      const managers = rootScope.managers.appGroupCallsManager;
      await managers.toggleGroupCallSettings(callId, {resetInviteHash: true});
      const newLink = await managers.exportGroupCallInvite(callId);
      setLink(newLink);
      inviteLink.setUrl(newLink);
      toastNew({langPackKey: 'CallLink.Revoked'});
    } catch(err) {
      console.error('revoke call link failed', err);
      toastNew({langPackKey: 'Error.AnError'});
    }
  };

  // The shared link box — the link itself (click to copy), a menu on it the way
  // iOS hangs one off an invite link (InviteLinkInviteController.swift:384),
  // and its actions underneath.
  const listenerSetter = createListenerSetter();
  const shareButton = Button('', {text: 'Share'});
  const copyButton = Button('', {text: 'Copy'});
  attachClickEvent(shareButton, () => share(), {listenerSetter});
  attachClickEvent(copyButton, () => inviteLink.copyLink(), {listenerSetter});
  const inviteLink = new InviteLink({
    listenerSetter,
    url: options.link,
    class: classNames(styles.inviteLink, !initial && styles.inviteLinkLast),
    buttons: [{
      icon: 'copy',
      text: 'CopyLink',
      onClick: () => inviteLink.copyLink()
    }, {
      icon: 'qr',
      text: 'InviteLink.ContextGetQRCode',
      onClick: () => showLinkQrCodePopup({
        url: link(),
        aboutLangKey: 'InviteLink.QRCode.InfoGroupCall'
      })
    }, {
      icon: 'delete',
      className: 'danger',
      text: 'RevokeLink',
      onClick: () => void revoke().catch(noop),
      // The box that opens right after creating a link never offers to throw
      // it away, and only the creator may (calls_group_common.cpp:315).
      verify: () => !!callId && !initial && !!canManage
    }],
    button: [shareButton, copyButton]
  });

  const join = () => {
    const slug = extractConferenceSlug(link());
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
