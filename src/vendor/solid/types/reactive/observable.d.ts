import { Accessor, Setter } from "./signal.js";
declare global {
    interface SymbolConstructor {
        readonly observable: symbol;
    }
}
interface Observable<T> {
    subscribe(observer: ObservableObserver<T>): {
        unsubscribe(): void;
    };
    [Symbol.observable](): Observable<T>;
}
export type ObservableObserver<T> = ((v: T) => void) | {
    next?: (v: T) => void;
    error?: (v: any) => void;
    complete?: (v: boolean) => void;
};
/**
 * creates a simple observable from a signal's accessor to be used with the `from` operator of observable libraries like e.g. rxjs
 * ```typescript
 * import { from } from "rxjs";
 * const [s, set] = createSignal(0);
 * const obsv$ = from(observable(s));
 * obsv$.subscribe((v) => console.log(v));
 * ```
 * description https://www.solidjs.com/docs/latest/api#observable
 */
export declare function observable<T>(input: Accessor<T>): Observable<T>;
export declare function from<T>(producer: ((setter: Setter<T | undefined>) => () => void) | {
    subscribe: (fn: (v: T) => void) => (() => void) | {
        unsubscribe: () => void;
    };
}): Accessor<T | undefined>;
export {};
