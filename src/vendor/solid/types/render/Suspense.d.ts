import type { JSX } from "../jsx.js";
/**
 * **[experimental]** controls the order in which suspended content is rendered
 *
 * @description https://www.solidjs.com/docs/latest/api#suspenselist-experimental
 */
export declare function SuspenseList(props: {
    children: JSX.Element;
    revealOrder: "forwards" | "backwards" | "together";
    tail?: "collapsed" | "hidden";
}): JSX.Element;
/**
 * tracks all resources inside a component and renders a fallback until they are all resolved
 * ```typescript
 * const AsyncComponent = lazy(() => import('./component'));
 *
 * <Suspense fallback={<LoadingIndicator />}>
 *   <AsyncComponent />
 * </Suspense>
 * ```
 * @description https://www.solidjs.com/docs/latest/api#suspense
 */
export declare function Suspense(props: {
    fallback?: JSX.Element;
    children: JSX.Element;
}): JSX.Element;
