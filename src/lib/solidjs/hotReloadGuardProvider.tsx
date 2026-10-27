import {ParentProps} from 'solid-js';
import {SolidJSHotReloadGuardContext, SolidJSHotReloadGuardContextValue} from '@lib/solidjs/hotReloadGuard';

/**
 * The app's top level — its singletons, and the popups and tabs that pull them in — for code below it, which must not
 * import them: an import from there makes the whole app part of that module's graph (every test of it, every HMR
 * update through it). Filled at startup: the singletons register themselves where they are made, the rest comes from
 * @lib/solidjs/hotReloadGuardValue, which only the app's root imports. Components take it from the context
 * (useHotReloadGuard), other code reads it here at call time — never while modules are still being evaluated.
 */
export const hotReloadGuard: SolidJSHotReloadGuardContextValue = import.meta.hot?.data?.value ?? ({} as SolidJSHotReloadGuardContextValue);
let registered = !!hotReloadGuard.HotReloadGuard;

export function registerHotReloadGuard(values: Partial<Omit<SolidJSHotReloadGuardContextValue, 'HotReloadGuard'>>) {
  Object.assign(hotReloadGuard, values, {HotReloadGuard: SolidJSHotReloadGuardProvider});
  registered = true;
  if(import.meta.hot?.data) import.meta.hot.data.value = hotReloadGuard;
}

let load: () => Promise<unknown>;

/** How the app's root fills the registry, for what may mount the provider before the app is up */
export function setHotReloadGuardLoader(loader: () => Promise<unknown>) {
  load = loader;
}

/**
 * The registry filled, through the root's loader: the app's top level loaded, or loading for the first caller and
 * shared with the others (`registered` would not tell - a singleton registers itself before the rest is in). For code
 * that can run before the app is up and mounts the provider - the media editor, which the sign-up screen opens for the
 * new account's photo.
 */
export async function hotReloadGuardReady() {
  await load?.();
}

export default function SolidJSHotReloadGuardProvider(props: ParentProps) {
  if(!registered) {
    throw new Error('SolidJSHotReloadGuardProvider: nothing registered, import @lib/solidjs/hotReloadGuardValue at startup');
  }

  return (
    <SolidJSHotReloadGuardContext.Provider value={hotReloadGuard}>
      {props.children}
    </SolidJSHotReloadGuardContext.Provider>
  );
}
