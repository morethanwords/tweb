import Button from '@components/buttonTsx';
import {toastNew} from '@components/toast';
import {shareToPeers} from '@components/popups/shareUrl';
import I18n, {LangPackKey} from '@lib/langPack';
import copyQrCode from '@helpers/qrCode/copyQrCode';
import createDownloadAnchor from '@helpers/dom/createDownloadAnchor';
import {ObjectURLScope} from '@helpers/objectUrl';
import classNames from '@helpers/string/classNames';
import {onCleanup} from 'solid-js';
import {isExpiring, secondsLeft} from './link';

export type ExportActionsOptions = {
  /** The picture, made at the call (inside the click for copy: the clipboard takes the promise) */
  makeImage: () => Promise<Blob> | undefined,
  url: () => string,
  /** The file name without extension: the username or the title */
  fileName: () => string,
  /** When the code on screen runs out (unix seconds); absent, or `undefined`, for a code that does not */
  expires?: () => number | undefined,
  /** The toast of the refusal: the fee code says its own */
  expiringToast?: LangPackKey | (() => LangPackKey)
};

/** Within `EXPIRY_CUTOFF_SECONDS` of its end a code would be dead on arrival */
const endsSoon = (expires: number | undefined) => expires !== undefined && isExpiring(secondsLeft(expires));

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

/** Copy, share to chats and save a PNG of the card; all three refuse a code that is about to expire */
export function createExportActions(options: ExportActionsOptions) {
  const scope = new ObjectURLScope();
  const timers = new Set<number>();
  // the screen has gone (closed, or another account shown): what was still being made opens nothing
  let disposed = false;
  onCleanup(() => {
    disposed = true;
    scope.dispose();
    timers.forEach((timer) => clearInterval(timer));
  });

  const refuse = (expires = options.expires?.()) => {
    if(!endsSoon(expires)) return false;
    toastNew({langPackKey: (typeof options.expiringToast === 'function' ? options.expiringToast() : options.expiringToast) ?? 'QRCode.LinkExpiring'});
    return true;
  };

  const copy = async() => {
    // no code yet (a contact link on its way): nothing to copy, as Android shares nothing then
    if(!options.url() || refuse()) return;
    const outcome = await copyQrCode({blob: options.makeImage(), url: options.url()});
    toastNew({langPackKey: outcome === 'image' ? 'QRCode.Copied' : outcome === 'link' ? 'QRCode.CopiedLink' : 'Error.AnError'});
  };

  const save = async() => {
    if(refuse()) return;
    const image = options.makeImage();
    if(!image) return;

    const blob = await image;
    if(disposed) return;
    const url = scope.create(blob);
    createDownloadAnchor(url, safeFileName(options.fileName()), () => scope.release(url));
    toastNew({langPackKey: 'QRCode.Saved'});
  };

  const share = async() => {
    // the code on screen now is what goes: its link and its end are taken with its picture, as a newer code may
    // replace it on screen while the picker is open
    const expires = options.expires?.();
    if(refuse(expires)) return;
    const image = options.makeImage();
    if(!image) return;
    const link = options.url();

    const blob = await image;
    const size = await imageSize(blob);
    if(disposed) return;
    const file = new File([blob], safeFileName(options.fileName()), {type: 'image/png'});

    const popup = shareToPeers({
      chatRightsActions: ['send_photos'],
      send: (managers, {peerId, threadId, monoforumThreadId}, confirmedPaymentResult) => {
        if(endsSoon(expires)) return;
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

    // the code that was taken running out while the picker is open closes it
    if(expires !== undefined) {
      const timer = window.setInterval(() => {
        if(!endsSoon(expires)) return;
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

export function ExportShareSaveButtons(props: {
  actions: ExportActions,
  class?: string,
  shareClass?: string,
  saveClass?: string,
  groupClass?: string,
  shareRef?: (element: HTMLElement) => void
}) {
  return (
    <div class={props.groupClass}>
      <Button.Icon
        ref={props.shareRef}
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
