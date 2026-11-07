// Sandbox worker (`sab` transport): one glue (glue.ts) per worker, messages over postMessage, layout queries blocking
// on the SharedArrayBuffer the host answers into.

import { createGlue } from './glue';
import type { HostToWorker, WorkerToHost } from '../shared/protocol';

// Only the first evaluation of this module takes the messages. In a code-split build, the chunks quickjs loads with
// `import()` while warming import shared code back from this file, and Chrome evaluates a module worker's main script
// again when it is imported: the second copy took `onmessage` over with an empty state, so a pooled worker answered
// the `start` that came after its warm-up with "start before warm".
const BOOTED = Symbol.for('widget-sandbox.worker');
if (!(globalThis as any)[BOOTED]) {
  (globalThis as any)[BOOTED] = true;
  const glue = createGlue({ post: (msg: WorkerToHost) => (self as unknown as Worker).postMessage(msg) });
  self.onmessage = (e: MessageEvent<HostToWorker>) => glue.receive(e.data);
}
