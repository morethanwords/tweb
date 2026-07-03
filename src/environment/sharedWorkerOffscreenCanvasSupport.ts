/**
 * OffscreenCanvas presentation (transferControlToOffscreen) is fundamentally
 * incompatible with SharedWorker. A placeholder canvas's compositor frame sink is
 * bound to the client_id of the renderer PROCESS that owns it, and a SharedWorker can
 * be hosted in a different process than a connecting tab. When the worker submits a
 * frame for that tab's canvas, the browser rejects the cross-process frame-sink
 * submission ("Invalid client ID") and kills the renderer with
 * RESULT_CODE_KILLED_BAD_MESSAGE — an uncatchable full-tab crash that reproduces
 * whenever two same-origin tabs land in different renderer processes.
 *
 * So renderers that transfer a tab-owned OffscreenCanvas into their worker must use a
 * per-tab dedicated Worker, never a SharedWorker. Use this flag in place of
 * IS_SHARED_WORKER_SUPPORTED for them. Kept as a named constant so it can be flipped
 * in one place if the platform ever supports the combination.
 */
const IS_SHARED_WORKER_OFFSCREEN_CANVAS_SUPPORTED = false;

export default IS_SHARED_WORKER_OFFSCREEN_CANVAS_SUPPORTED;
