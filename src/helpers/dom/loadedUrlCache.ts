type LoadedURLLoad = {
  valid: boolean,
  url: string
};

const loadedURLs = new Set<string>();
const pendingLoads = new Map<string, Set<LoadedURLLoad>>();

export function hasLoadedURL(url: string) {
  return loadedURLs.has(url);
}

export function markLoadedURL(url: string) {
  loadedURLs.add(url);
}

export function beginLoadedURLLoad(url: string): LoadedURLLoad {
  const load = {valid: true, url};
  const loads = pendingLoads.get(url) ?? new Set();
  loads.add(load);
  pendingLoads.set(url, loads);
  return load;
}

export function finishLoadedURLLoad(load: LoadedURLLoad, loaded: boolean) {
  const loads = pendingLoads.get(load.url);
  loads?.delete(load);
  if(!loads?.size) {
    pendingLoads.delete(load.url);
  }

  if(loaded && load.valid) {
    markLoadedURL(load.url);
  }
  load.valid = false;
}

export function forgetLoadedURL(url: string) {
  loadedURLs.delete(url);
  const loads = pendingLoads.get(url);
  if(loads) {
    for(const load of loads) {
      load.valid = false;
    }
    pendingLoads.delete(url);
  }
}
