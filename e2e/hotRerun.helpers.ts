import type {Page} from '@playwright/test';

/*
 * A hot update runs a module again, often with its code unchanged: every importer of an edited module gets a new stamp
 * and runs again under the boundary that takes the update. The dev server's transform keeps what live code holds of
 * the previous evaluation (src/helpers/hotRegistry.ts) and reloads the page for what it cannot keep - so a module run
 * again with the same code must never ask for a reload, but where reloading is the rule itself. A false reload is a hot
 * update the developer loses.
 */

// the reloads the rules ask for even with the code unchanged
const EXPECTED = [
  // namespace I18n holds the strings: it cannot be kept, its code with it
  /^\/src\/lib\/langPack\.ts \(namespace I18n: /,
  // methods of another evaluation are branded for its private members (the SDP parser, MovablePanel, ...)
  /\((\w+: it has private members|\w+: its superclass \w+ has private members)/
];

/** Before the page loads: every module it loads stays in the resource timeline (the default buffer keeps 250) */
export function recordModules(page: Page) {
  return page.addInitScript(() => performance.setResourceTimingBufferSize(100_000));
}

/** Every app module the page loaded, evaluated once more under a stamp of its own: the reloads it asks for, and errors */
export async function rerunLoadedModules(page: Page) {
  const result = await page.evaluate(async() => {
    const origin = location.origin;
    const modules = [...new Set(performance.getEntriesByType('resource')
    .map((entry) => entry.name)
    .filter((name) => name.startsWith(origin + '/src/') && /\.(ts|tsx)$/.test(name.split('?')[0]))
    .map((name) => name.slice(origin.length).split('?')[0])
    .filter((path) => !/^\/src\/helpers\/hot(Module|Registry)\.ts$/.test(path))
    // a worklet's or a worker's entry runs in a realm of its own
    .filter((path) => !/\.(worklet|worker)\.tsx?$/.test(path)))];
    const registry = (globalThis as any)[Symbol.for('tweb.hotRegistry')];
    const reloads: string[] = [];
    const errors: string[] = [];
    registry.onReload = (path: string, reason: string) => reloads.push(`${path} (${reason})`);
    const stamp = Date.now();
    try {
      for(const path of modules) {
        try {
          await import(/* @vite-ignore */ `${path}?t=${stamp}`);
        } catch(err) {
          errors.push(`${path}: ${String((err as Error)?.message ?? err).slice(0, 200)}`);
        }
      }
      // what the registry compares once the modules have run, and retries for a cycle's late imports
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } finally {
      registry.onReload = undefined;
    }
    return {modules: modules.length, reloads: [...new Set(reloads)], errors};
  });

  return {...result, unexpected: result.reloads.filter((reload) => !EXPECTED.some((expected) => expected.test(reload)))};
}
