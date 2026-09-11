// The probe runs on the bootstrap path (the crypto pool is registered before anything can talk to the
// worker, and the first sticker waits for the lottie pool), so a blob: URL that neither resolves nor
// rejects must not hold it up forever. Members are probed in parallel, so this caps the whole wait.
const PROBE_TIMEOUT = 3000;

async function canLoad(url: string) {
  let timeout: ReturnType<typeof setTimeout>;
  try {
    const response = await Promise.race([
      fetch(url),
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => resolve(null), PROBE_TIMEOUT);
      })
    ]);

    response?.body?.cancel();
    return !!response?.ok;
  } catch(err) {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * The extra members of a worker pool are constructed from blob: URLs minted inside the shared worker,
 * so every tab builds the same SharedWorker per pool member. WebKit sometimes hands back a URL this
 * tab cannot load at all - not even `fetch` it - and the worker built from it never comes up. That
 * failure is silent: the port is already in the pool, so everything routed to that member (lottie
 * round-robins every player over them) just never comes back.
 *
 * Probe the URL from the tab that is about to use it and fall back to a tab-local URL for the same
 * blob, keeping the pool the same width and in the same order.
 */
export default async function usableWorkerURL(
  url: string,
  blob: Blob,
  onFallback?: (url: string) => void
): Promise<string> {
  if(!url.startsWith('blob:') || await canLoad(url)) {
    return url;
  }

  onFallback?.(url);
  return URL.createObjectURL(blob);
}
