import {Component, createRoot} from 'solid-js';
import {render} from 'solid-js/web';
import type SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import {Middleware} from '@helpers/middleware';

type RenderComponentArgs<T extends object> = {
  element?: HTMLElement,
  Component: Component<T>,
  middleware: Middleware,
  HotReloadGuard?: typeof SolidJSHotReloadGuardProvider
} & (keyof T extends never ? {props?: T} : {props: T});

export const renderComponent = <T extends object>({
  element,
  Component,
  props,
  middleware,
  HotReloadGuard
}: RenderComponentArgs<T>) => {
  const ToRender = HotReloadGuard ?
    () => <HotReloadGuard><Component {...(props || ({} as T))} /></HotReloadGuard> :
    () => <Component {...(props || ({} as T))} />;

  const dispose = element ?
    render(() => <ToRender />, element) :
    createRoot((dispose) => {<ToRender />; return dispose});
  middleware.onDestroy(() => dispose());
};
