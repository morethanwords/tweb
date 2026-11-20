import cancelEvent from '@helpers/dom/cancelEvent';

export type TransferEvent = ClipboardEvent | DragEvent;
export type TransferConsumer = (event: TransferEvent) => boolean;

// Only the top consumer of this document may claim a transfer. A rejecting modal
// must not send the paste through to an editor hidden beneath it.
const consumers = new WeakMap<Document, TransferConsumer[]>();
const claimed = new WeakSet<Event>();

export function registerTransferConsumer(doc: Document, consumer: TransferConsumer) {
  let stack = consumers.get(doc);
  if(!stack) consumers.set(doc, stack = []);
  stack.push(consumer);
  let removed = false;
  return () => {
    if(removed) return;
    removed = true;
    const index = stack.indexOf(consumer);
    if(index !== -1) stack.splice(index, 1);
    if(!stack.length) consumers.delete(doc);
  };
}

/** Must run synchronously at the start of app document capture, before chat
 * snapshots/file extraction. Also used by standalone overlays without the app.
 * No editor imports, DOM queries or cross-window instanceof checks here.
 */
export function dispatchTransferConsumer(event: TransferEvent) {
  if(claimed.has(event)) return true;
  const target = event.target as Node;
  const doc = target?.nodeType === 9 ? target as Document : target?.ownerDocument;
  const stack = consumers.get(doc);
  const consumer = stack?.[stack.length - 1];
  if(!consumer?.(event)) return false;
  claimed.add(event);
  cancelEvent(event);
  return true;
}
