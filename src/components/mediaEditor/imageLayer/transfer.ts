import type {TransferConsumer, TransferEvent} from '@helpers/dom/transferConsumer';
import isTargetAnInput from '@helpers/dom/isTargetAnInput';
import {isAllowedStaticImageMime, selectStaticImageLayerFile} from '@components/mediaEditor/imageLayer/source';

/** Synchronous advertised-file gate only. Actual byte validation/decode remains
 * in the importer. Unsupported/multiple inputs keep the app's existing route;
 * a JPEG/PNG whose bytes are invalid belongs to the editor and reports an error.
 */
export function isSingleStaticImageTransfer(event: TransferEvent) {
  const transfer = 'clipboardData' in event ? event.clipboardData : event.dataTransfer;
  if(!transfer) return false;
  const items = Array.from(transfer.items || []).filter(item => item.kind === 'file');
  if(items.length > 1) return false;
  if(event.type === 'dragover') return items.length === 1 && isAllowedStaticImageMime(items[0].type);
  const files = Array.from(transfer.files || []);
  if(!files.length && items.length === 1) {
    const file = items[0].getAsFile();
    if(file) files.push(file);
  }
  return !!selectStaticImageLayerFile(files);
}

export function createImageLayerTransferConsumer(options: {
  enabled: () => boolean;
  consume: (event: TransferEvent) => void;
}): TransferConsumer {
  return event => {
    if(!options.enabled()) return false;
    const target = event.target as HTMLElement;
    if(isTargetAnInput(target) || target?.closest?.('input, textarea, [contenteditable="true"]') ||
      !isSingleStaticImageTransfer(event)) return false;
    options.consume(event);
    return true;
  };
}
