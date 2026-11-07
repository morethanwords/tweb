// `frame` sync transport (tweb, see UPSTREAM.md): the renderer core, the validator and the QuickJS glue in ONE
// sandboxed srcdoc frame, so a layout query is answered in this thread with no IPC. Trusted code only; the widget's JS
// still runs only inside QuickJS (invariant 1) and every op still passes the validator before the renderer applies it
// (invariant 2), but the validator now shares the frame with the engine.
//
// Page ⇄ frame (over the private MessagePort, like the iframe renderer):
//   page → frame: {type:'tw-engine', msg: HostToWorker} (init carries wasmBinary), or a HostToRenderer msg
//   frame → page: {type:'tw-engine', msg: WorkerToHost, nodes} (log / diag / stats / loaded / dead / bridge / storage),
//                 {type:'tw-gesture', gesture} (a gesture number issued for a trusted press, before the event reaches
//                 the engine), or a RendererToHost msg (size / media / gesture claim / violation)

import { createGlue } from '../host/glue';
import { parseHtmlTree } from '../host/html-tree';
import { createRenderer } from './core';
import { documentEnv } from './document-env';
import { Validator } from '../host/validator';
import { GestureCounter } from '../host/user-activation';
import { finiteNumber } from '../host/message-guards';
import { resolvePolicy, type HostToRenderer, type HostToWorker, type RendererToHost, type WorkerToHost } from '../shared/protocol';

document.currentScript?.remove();

const core = createRenderer(documentEnv(document, true));
const gestures = new GestureCounter();
let validator: Validator | null = null;
/** A preview (an inline result not sent yet) takes no input, as WidgetHost.onRenderer has it on every other transport. */
let preview = false;
let port: MessagePort | null = null;
let captured: Extract<RendererToHost, { type: 'result' }> | null = null;

const toPage = (msg: unknown, transfer: Transferable[] = []) => port?.postMessage(msg, transfer);
const engineToPage = (msg: WorkerToHost) => toPage({ type: 'tw-engine', msg, nodes: validator?.nodeCount ?? 0 });

// Engine → host, handled in-frame: what WidgetHost.onWorker does with a worker's messages.
const post = (msg: WorkerToHost) => {
  switch (msg.type) {
    case 'ops': {
      if (!validator) return;
      const ops = validator.processOps(msg.ops);
      // a counted cap passed under strict: the widget stops as WidgetHost stops it (the renderer keeps its last render)
      if (validator.stopped) return glue.kill(validator.stopped);
      if (ops.length) core.onMessage({ type: 'ops', ops });
      return;
    }
    case 'listen': if (validator) core.onMessage({ type: 'listen', types: validator.validateListen(msg.types), since: finiteNumber(msg.since) }); return;
    case 'pd': if (validator) core.onMessage({ type: 'preventDefault', keys: validator.validatePreventDefault(msg.keys) }); return;
    case 'anim': {
      if (!validator) return;
      const anims = validator.validateAnim(msg.anims);
      const now = finiteNumber(msg.now);
      if (anims.length && now !== undefined) core.onMessage({ type: 'anim', now, anims });
      return;
    }
    case 'raf': core.onMessage({ type: 'requestFrame' }); return;
    case 'query': return; // `frame` queries never travel: `query` below
    // after the loading tasks' ops (the glue posts them first): text changes are rate-limited from here on
    case 'loaded': validator?.markLoaded(); engineToPage(msg); return;
    default: engineToPage(msg);
  }
};

// A layout query: validated, then answered by the renderer core synchronously, in this thread.
const query = (queryJson: string) => {
  let q = null;
  try { q = validator?.validateQuery(JSON.parse(queryJson)) ?? null; } catch {}
  if (!q) return { json: '{"error":"invalid query"}' };
  if (q.q === 'matchMedia') q.query = validator!.rewriteMediaQuery(q.query);
  captured = null;
  core.onMessage({ type: 'query', qid: 0, query: q });
  const c = captured as Extract<RendererToHost, { type: 'result' }> | null;
  captured = null;
  return c ? { json: JSON.stringify(c.result ?? null), binary: c.binary } : { json: '{"error":"no answer"}' };
};

const glue = createGlue({ post, query, parseHTML: parseHtmlTree });

// Renderer → host: inputs go straight into the engine; layout reports go to the page.
function fromRenderer(msg: RendererToHost, transfer?: Transferable[]) {
  switch (msg.type) {
    case 'result': captured = msg; return;
    case 'event': {
      // a tap on a preview selects the result (the client's), and the widget gets nothing
      if (preview) return;
      // What WidgetHost does with a renderer event: a trusted press gets a gesture number, which the page must know
      // first, since a link call made in the event's task carries it and the page accepts only numbers it issued.
      // tweb: any pointerdown begins a press, trusted or not (a second finger's is neither, and has no claim)
      if (msg.ev?.type === 'pointerdown') gestures.pressBegan();
      const gesture = msg.trusted === true ? gestures.gestureFor(msg.ev) : 0;
      if (gesture) toPage({ type: 'tw-gesture', gesture });
      glue.receive(gesture ? { type: 'event', ev: msg.ev, gesture } : { type: 'event', ev: msg.ev });
      return;
    }
    // tweb: a primary press began: the gestures the frame numbers start anew (user-activation.ts `pressBegan`)
    case 'gesture': gestures.pressBegan(); toPage(msg, transfer); return;
    case 'frame': glue.receive({ type: 'frame', time: msg.time }); return;
    case 'resize': glue.receive({ type: 'resize', entries: msg.entries }); return;
    default: toPage(msg, transfer);
  }
}

function fromPage(data: any) {
  if (data?.type === 'tw-engine') {
    const msg = data.msg as HostToWorker;
    if (msg.type === 'init' || msg.type === 'warm') {
      preview = msg.config.isPreview === true;
      validator = new Validator((kind, detail) => engineToPage({ type: 'diag', kind, detail }), { colorScheme: msg.config.theme, scope: 'document' });
      validator.setPolicy(resolvePolicy(msg.config.policy));
    } else if (msg.type === 'theme' && validator) {
      const ops = validator.setTheme(msg.theme);
      if (ops.length) core.onMessage({ type: 'ops', ops });
    }
    glue.receive(msg);
    return;
  }
  core.onMessage(data as HostToRenderer);
}

// The frame makes the port and hands the embedding window, and it alone, the other end (same handshake as renderer.ts).
const channel = new MessageChannel();
// once the document is there, as when the host's port came
const announce = () => {
  port = channel.port1;
  core.init(fromRenderer);
  port.onmessage = (ev) => fromPage(ev.data);
  window.parent.postMessage({ type: 'tw-renderer-ready' }, '*', [channel.port2]);
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', announce, { once: true });
else announce();
