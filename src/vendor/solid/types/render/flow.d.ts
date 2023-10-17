import { Accessor } from "../reactive/signal.js";
import type { JSX } from "../jsx.js";
/**
 * creates a list elements from a list
 *
 * it receives a map function as its child that receives a list element and an accessor with the index and returns a JSX-Element; if the list is empty, an optional fallback is returned:
 * ```typescript
 * <For each={items} fallback={<div>No items</div>}>
 *   {(item, index) => <div data-index={index()}>{item}</div>}
 * </For>
 * ```
 * If you have a list with fixed indices and changing values, consider using `<Index>` instead.
 *
 * @description https://www.solidjs.com/docs/latest/api#for
 */
export declare function For<T extends readonly any[], U extends JSX.Element>(props: {
    each: T | undefined | null | false;
    fallback?: JSX.Element;
    children: (item: T[number], index: Accessor<number>) => U;
}): JSX.Element;
/**
 * Non-keyed iteration over a list creating elements from its items
 *
 * To be used if you have a list with fixed indices, but changing values.
 * ```typescript
 * <Index each={items} fallback={<div>No items</div>}>
 *   {(item, index) => <div data-index={index}>{item()}</div>}
 * </Index>
 * ```
 * If you have a list with changing indices, better use `<For>`.
 *
 * @description https://www.solidjs.com/docs/latest/api#index
 */
export declare function Index<T extends readonly any[], U extends JSX.Element>(props: {
    each: T | undefined | null | false;
    fallback?: JSX.Element;
    children: (item: Accessor<T[number]>, index: number) => U;
}): JSX.Element;
type RequiredParameter<T> = T extends () => unknown ? never : T;
/**
 * Conditionally render its children or an optional fallback component
 * @description https://www.solidjs.com/docs/latest/api#show
 */
export declare function Show<T, TRenderFunction extends (item: Accessor<NonNullable<T>>) => JSX.Element>(props: {
    when: T | undefined | null | false;
    keyed?: false;
    fallback?: JSX.Element;
    children: JSX.Element | RequiredParameter<TRenderFunction>;
}): JSX.Element;
export declare function Show<T, TRenderFunction extends (item: NonNullable<T>) => JSX.Element>(props: {
    when: T | undefined | null | false;
    keyed: true;
    fallback?: JSX.Element;
    children: JSX.Element | RequiredParameter<TRenderFunction>;
}): JSX.Element;
/**
 * switches between content based on mutually exclusive conditions
 * ```typescript
 * <Switch fallback={<FourOhFour />}>
 *   <Match when={state.route === 'home'}>
 *     <Home />
 *   </Match>
 *   <Match when={state.route === 'settings'}>
 *     <Settings />
 *   </Match>
 * </Switch>
 * ```
 * @description https://www.solidjs.com/docs/latest/api#switchmatch
 */
export declare function Switch(props: {
    fallback?: JSX.Element;
    children: JSX.Element;
}): JSX.Element;
export type MatchProps<T> = {
    when: T | undefined | null | false;
    keyed?: boolean;
    children: JSX.Element | ((item: NonNullable<T> | Accessor<NonNullable<T>>) => JSX.Element);
};
/**
 * selects a content based on condition when inside a `<Switch>` control flow
 * ```typescript
 * <Match when={condition()}>
 *   <Content/>
 * </Match>
 * ```
 * @description https://www.solidjs.com/docs/latest/api#switchmatch
 */
export declare function Match<T, TRenderFunction extends (item: Accessor<NonNullable<T>>) => JSX.Element>(props: {
    when: T | undefined | null | false;
    keyed?: false;
    children: JSX.Element | RequiredParameter<TRenderFunction>;
}): JSX.Element;
export declare function Match<T, TRenderFunction extends (item: NonNullable<T>) => JSX.Element>(props: {
    when: T | undefined | null | false;
    keyed: true;
    children: JSX.Element | RequiredParameter<TRenderFunction>;
}): JSX.Element;
export declare function resetErrorBoundaries(): void;
/**
 * catches uncaught errors inside components and renders a fallback content
 *
 * Also supports a callback form that passes the error and a reset function:
 * ```typescript
 * <ErrorBoundary fallback={
 *   (err, reset) => <div onClick={reset}>Error: {err.toString()}</div>
 * }>
 *   <MyComp />
 * </ErrorBoundary>
 * ```
 * Errors thrown from the fallback can be caught by a parent ErrorBoundary
 *
 * @description https://www.solidjs.com/docs/latest/api#errorboundary
 */
export declare function ErrorBoundary(props: {
    fallback: JSX.Element | ((err: any, reset: () => void) => JSX.Element);
    children: JSX.Element;
}): JSX.Element;
export {};
