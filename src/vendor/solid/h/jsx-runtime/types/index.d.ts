export type { JSX } from "./jsx";
import type { JSX } from "./jsx";
declare function Fragment(props: {
    children: JSX.Element;
}): JSX.Element;
declare function jsx(type: any, props: any): () => (Node & {
    [key: string]: any;
}) | (Node & {
    [key: string]: any;
})[];
export { jsx, jsx as jsxs, jsx as jsxDEV, Fragment };
