import Button from '@components/buttonTsx';
import {toastNew} from '@components/toast';
import {shareToPeers} from '@components/popups/shareUrl';
import I18n, {LangPackKey} from '@lib/langPack';
import copyQrCode from '@helpers/qrCode/copyQrCode';
import createDownloadAnchor from '@helpers/dom/createDownloadAnchor';
import {ObjectURLScope} from '@helpers/objectUrl';
import classNames from '@helpers/string/classNames';
import {onCleanup} from 'solid-js';

/** How long before a code's expiry the three actions are refused */
export const EXPORT_EXPIRY_MARGIN_MS = 3000;

export type ExportActionsOptions = {
  /** The picture, made at the call (inside the click for copy: the clipboard takes the promise) */
  makeImage: () => Promise<Blob> | undefined,
  url: () => string,
  /** The file name without extension: the username or the title */
  fileName: () => string,
  /** True within `EXPORT_EXPIRY_MARGIN_MS` of the code's expiry; absent for a code that does not expire */
  isExpiring?: () => boolean,
  /** The toast of the refusal: the fee code says its own */
  expiringToast?: LangPackKey | (() => LangPackKey)
};

function safeFileName(name: string) {
  return (name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '').replace(/^[\s.@]+|[\s.]+$/g, '') || 'qr-code') + '.png';
}

async function imageSize(blob: Blob) {
  try {
    const bitmap = await createImageBitmap(blob);
    const size = {width: bitmap.width, height: bitmap.height};
    bitmap.close();
    return size;
  } catch{
    return {};
  }
}

/** The popup is made a frame later than the call that opens it: wait for its container to stand in it */
function raiseOverQrScreen(container: HTMLElement, tries = 20) {
  const popup = container.closest<HTMLElement>('.popup');
  if(popup) popup.style.zIndex = '6';
  else if(tries) requestAnimationFrame(() => raiseOverQrScreen(container, tries - 1));
}

/** Copy, share to chats and save a PNG of the card; all three refuse a code that is about to expire */
export function createExportActions(options: ExportActionsOptions) {
  const scope = new ObjectURLScope();
  const timers = new Set<number>();
  onCleanup(() => {
    scope.dispose();
    timers.forEach((timer) => clearInterval(timer));
  });

  const refuse = () => {
    if(!options.isExpiring?.()) return false;
    toastNew({langPackKey: (typeof options.expiringToast === 'function' ? options.expiringToast() : options.expiringToast) ?? 'QRCode.LinkExpiring'});
    return true;
  };

  const copy = async() => {
    if(refuse()) return;
    const outcome = await copyQrCode({blob: options.makeImage(), url: options.url()});
    toastNew({langPackKey: outcome === 'image' ? 'QRCode.Copied' : outcome === 'link' ? 'QRCode.CopiedLink' : 'Error.AnError'});
  };

  const save = async() => {
    if(refuse()) return;
    const image = options.makeImage();
    if(!image) return;

    const url = scope.create(await image);
    createDownloadAnchor(url, safeFileName(options.fileName()), () => scope.release(url));
    toastNew({langPackKey: 'QRCode.Saved'});
  };

  const share = async() => {
    if(refuse()) return;
    const image = options.makeImage();
    if(!image) return;

    const blob = await image;
    const file = new File([blob], safeFileName(options.fileName()), {type: 'image/png'});
    const size = await imageSize(blob);
    const link = options.url();

    const popup = shareToPeers({
      chatRightsActions: ['send_photos'],
      send: (managers, {peerId, threadId, monoforumThreadId}, confirmedPaymentResult) => {
        if(options.isExpiring?.()) return;
        managers.appMessagesManager.sendFile({
          peerId,
          threadId,
          replyToMonoforumPeerId: monoforumThreadId,
          confirmedPaymentResult,
          file,
          caption: link,
          ...size
        });
      }
    });

    // the picker is opened from a screen that stands over every popup: it goes over that one
    raiseOverQrScreen(popup.selector.container);

    // a code that runs out while the picker is open closes it
    if(options.isExpiring) {
      const timer = window.setInterval(() => {
        if(!options.isExpiring()) return;
        clearInterval(timer);
        timers.delete(timer);
        popup.hide();
      }, 1000);
      timers.add(timer);
    }
  };

  return {copy, share, save};
}

export type ExportActions = ReturnType<typeof createExportActions>;

/** The bottom circles: copy at the start, share and save together at the end (the link and fee island sits between) */
export function ExportCopyButton(props: {actions: ExportActions, class?: string}) {
  return (
    <Button.Icon
      class={classNames('btn-icon', props.class)}
      icon="copy"
      aria-label={I18n.format('QRCode.Copy', true)}
      onClick={props.actions.copy}
    />
  );
}

export function ExportShareSaveButtons(props: {actions: ExportActions, class?: string, shareClass?: string, saveClass?: string, groupClass?: string}) {
  return (
    <div class={props.groupClass}>
      <Button.Icon
        class={classNames('btn-icon', props.class, props.shareClass)}
        icon="forward"
        aria-label={I18n.format('QRCode.Share', true)}
        onClick={props.actions.share}
      />
      <Button.Icon
        class={classNames('btn-icon', props.class, props.saveClass)}
        icon="download"
        aria-label={I18n.format('Save', true)}
        onClick={props.actions.save}
      />
    </div>
  );
}
