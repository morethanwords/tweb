import {createSignal, onMount} from 'solid-js';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import {toastNew} from '@components/toast';
import classNames from '@helpers/string/classNames';
import copyQrCode from '@helpers/qrCode/copyQrCode';
import {paintQrCode} from '@helpers/qrCode/paintQrCode';
import {i18n, LangPackKey} from '@lib/langPack';
import styles from '@components/popups/linkQrCode.module.scss';

/**
 * "Invite by QR Code" — the sheet Telegram-iOS opens from an invite link's own
 * context menu (`QrCodeScreen`, QrCodeScreen.swift:139): a title, the code on a
 * white card, one line saying what scanning it does, and a copy action.
 *
 * Distinct from the profile QR (`myQrCode`), which is a shareable card built
 * around a peer — avatar, username, wallpaper. iOS keeps the two apart the same
 * way (`ChatQrCodeScreen` vs `QrCodeScreen`); this one only ever encodes a link.
 */
export type LinkQrCodePopupOptions = {
  url: string,
  /** The line under the code. iOS words it per link kind. */
  aboutLangKey: LangPackKey
};

/** 240pt of code inside a 256pt card (QrCodeScreen.swift:653-654). */
const QR_SIZE = 240;

export default function showLinkQrCodePopup(options: LinkQrCodePopupOptions) {
  const {url, aboutLangKey} = options;
  const [show, setShow] = createSignal(false);

  // The PNG is baked as soon as the code is painted, not on the click: the
  // clipboard only takes a write issued in the same tick as the user
  // activation, and `toBlob` is async — encoding on the click loses the
  // activation and Chrome throws `NotAllowedError` (the profile QR pre-bakes
  // for the same reason, myQrCode.tsx's FooterSlot).
  let blob: Blob | undefined;

  const onCopyClick = async() => {
    const outcome = await copyQrCode({blob, url});
    toastNew({langPackKey: outcome === 'image' ? 'QRCode.Copied' : outcome === 'link' ? 'LinkCopied' : 'Error.AnError'});
  };

  function Code() {
    let host!: HTMLDivElement;
    const [painted, setPainted] = createSignal(false);

    // qr-code-styling is lazy-loaded: the popup opens right away and the code
    // lands once the library is in. Painted on mount, so the host is there.
    onMount(async() => {
      try {
        const QRCodeStylingCtor = await import('qr-code-styling' as any).then((m) => m.default);
        const style = getComputedStyle(document.documentElement);
        const result = await paintQrCode({
          data: url,
          size: QR_SIZE,
          host,
          // Always black on white — the card stays white in every theme so the
          // code keeps the contrast a scanner needs.
          background: '#ffffff',
          foreground: '#000000',
          logoColor: style.getPropertyValue('--primary-color').trim() || '#000000',
          canvasClass: styles.qr,
          QRCodeStylingCtor
        });

        result.canvas.toBlob((baked) => {
          blob = baked;
        }, 'image/png');
        setPainted(true);
      } catch(err) {
        // Nothing to draw is not nothing to do: the footer keeps offering the
        // link itself.
        console.error('QR code paint failed', err);
      }
    });

    return (
      <>
        <PopupElement.Body class={styles.body}>
          <div ref={host} class={styles.card} />
          <div class={classNames(styles.about, 'text-overflow-wrap')}>{i18n(aboutLangKey)}</div>
        </PopupElement.Body>
        <PopupElement.Footer>
          <PopupElement.FooterButton
            iconLeft="copy"
            langKey={painted() ? 'QRCode.Copy' : 'CopyLink'}
            callback={onCopyClick}
          />
        </PopupElement.Footer>
      </>
    );
  }

  createPopup(() => (
    <PopupElement
      class={styles.popup}
      show={show()}
      closable
      old
    >
      <PopupElement.Header>
        <PopupElement.CloseButton />
        <PopupElement.Title title="InviteLink.QRCode.Title" />
      </PopupElement.Header>
      <Code />
    </PopupElement>
  ));

  queueMicrotask(() => setShow(true));
}
