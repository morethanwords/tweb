// `frame` sync transport (tweb, see UPSTREAM.md): the sandboxed srcdoc frame runs the renderer AND the QuickJS engine
// (src/renderer/frame-runtime.ts), so WidgetHost has no worker. The frame's CSP gains 'wasm-unsafe-eval'; the engine's
// messages (log / diag / stats / loaded / dead / bridge / storage) come back over the same private port as the
// renderer's.

import frameBundle from 'virtual:frame-bundle';
import { IframeRenderer } from './iframe-renderer';
import type { HostToWorker, WorkerToHost } from '../shared/protocol';

export class FrameEngineRenderer extends IframeRenderer {
  /** Engine → host messages, plus the frame validator's node count for stats. */
  onEngine: ((msg: WorkerToHost, nodes: number) => void) | null = null;
  /** The frame numbered a trusted press (it does what WidgetHost does with a renderer event, in its own thread). */
  onGesture: ((gesture: number) => void) | null = null;

  /** `url`: the engine frame document served from another site instead of srcdoc. */
  constructor(container: HTMLElement, theme: 'light' | 'dark', url?: string) {
    super(container, theme, { js: frameBundle, wasm: true, url });
  }

  protected receive(data: any) {
    if (data?.type === 'tw-engine') this.onEngine?.(data.msg as WorkerToHost, Number(data.nodes) || 0);
    else if (data?.type === 'tw-gesture') {
      if (Number.isInteger(data.gesture) && data.gesture > 0) this.onGesture?.(data.gesture);
    } else super.receive(data);
  }

  /** Host → engine message (what a worker would get through postMessage). */
  sendEngine(msg: HostToWorker, transfer: Transferable[] = []) {
    this.post({ type: 'tw-engine', msg }, transfer);
  }
}
