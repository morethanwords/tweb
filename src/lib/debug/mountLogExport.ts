/*
 * Main-thread-only wiring of the log-export window helpers (window.downloadLogs /
 * window.collectLogs). Imported once from src/index.ts.
 *
 * This MUST live outside logsBuffer.ts. logsBuffer is a leaf pulled in by the
 * universal logger() on the hot path, so it ends up in *every* worker bundle
 * (mtproto, crypto, lottie, …). exportLogs.ts statically imports apiManagerProxy
 * (which spawns the mtproto + crypto workers), and Vite's worker bundler walks
 * the whole module graph of each worker entry — including modules behind a
 * literal `import('./exportLogs')`, which Rollup still discovers statically and
 * keeps in the graph (it only splits the chunk, it doesn't drop it). The result
 * was a "Circular worker imports detected" build failure
 * (crypto.worker -> index.worker -> crypto.worker). Keeping this reference in a
 * module reachable only from the main entry keeps exportLogs out of worker graphs.
 */

import {MOUNT_CLASS_TO} from '@config/debug';

if(MOUNT_CLASS_TO) {
  MOUNT_CLASS_TO.downloadLogs = (filename?: string) => import('./exportLogs').then((m) => m.downloadLogs(filename));
  MOUNT_CLASS_TO.collectLogs = () => import('./exportLogs').then((m) => m.collectLogs());
}
