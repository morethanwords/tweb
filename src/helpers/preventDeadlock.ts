import {fastRafPromise} from './schedulers';

/**
  * There is a edge-case bug that occurs when:
  * 1. A few tabs are opened but not focused immediately.
  * 2. Focus on one of the tabs.
  * 3. The tab is then reloaded.
  *
  * In this scenario, all tabs can freeze permanently because the non-focused tabs
  * start a dynamic import of some module before it was focused,
  * causing a cross-tab module import deadlock.
  *
  * Using fastRafPromise() (which internally waits for requestAnimationFrame) ensures that
  * the dynamic import is deferred until the next animation frame — effectively
  * delaying it until the user focuses the tab — and prevents this freeze.
  */
export async function preventCrossTabDynamicImportDeadlock() {
  await fastRafPromise();
}
