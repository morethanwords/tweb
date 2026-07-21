export const THREADED_WORKER_TYPES = ['crypto', 'lottie'] as const;
export type ThreadedWorkerType = typeof THREADED_WORKER_TYPES[number];

// SharedWorkers can survive reloads. Bump this whenever their message protocol
// becomes incompatible so a new page cannot attach to a stale worker realm.
export const THREADED_WORKER_PROTOCOL_QUERY_PARAM = '__tweb_threaded_worker_protocol';
export const THREADED_WORKER_PROTOCOL_VERSION = 4;
