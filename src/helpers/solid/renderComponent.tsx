import {Component} from 'solid-js';
import {render} from 'solid-js/web';
import {Middleware} from '../middleware';


type RenderComponentArgs<T extends object> = {
  element: HTMLElement;
  Component: Component<T>;
  middleware: Middleware;
} & (keyof T extends never ? { props?: T } : { props: T });;

export const renderComponent = <T extends object>({element, Component, props, middleware}: RenderComponentArgs<T>) => {
  const dipsose = render(() => <Component {...(props || ({} as T))} />, element);
  middleware.onDestroy(() => dipsose());
};
