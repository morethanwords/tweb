// tweb (`worker`, see UPSTREAM.md): the glue's `parse` host call in a worker, which has no DOMParser. parse5 runs in
// the worker's own engine instead of inside QuickJS, where it took 35–60 ms of a widget's first task. The tree is
// what the shim builds from parse5 itself (sandbox/dom.ts `build`, `setAttrs`), in html-tree.ts's format.

import { parse, parseFragment } from 'parse5';
import { MAX_HTML } from './html-tree';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HTML_NS = 'http://www.w3.org/1999/xhtml';

type TreeNode = string | [0, string] | [string, number, string[], TreeNode[]];

function attrsOf(attrs: { name: string; value: string; prefix?: string }[] | undefined): string[] {
  const out: string[] = [];
  for (const a of attrs ?? []) out.push(a.prefix ? `${a.prefix}:${a.name}` : a.name, a.value);
  return out;
}

function childrenOf(node: any): TreeNode[] {
  const out: TreeNode[] = [];
  for (const c of node.childNodes ?? []) {
    if (c.nodeName === '#text') out.push(c.value);
    else if (c.nodeName === '#comment') out.push([0, c.data]);
    else if (c.tagName) out.push([c.tagName, c.namespaceURI === SVG_NS ? 1 : 0, attrsOf(c.attrs), childrenOf(c.tagName === 'template' && c.content ? c.content : c)]);
  }
  return out;
}

/** html-tree.ts `parseHtmlTree`, with parse5: `{html}` a document, `{html, context, svg}` a fragment; '' leaves it to the shim. */
export function parseHtmlTreeParse5(arg: string): string {
  let req: { html?: unknown; context?: unknown; svg?: unknown };
  try { req = JSON.parse(arg); } catch { return ''; }
  if (typeof req?.html !== 'string' || req.html.length > MAX_HTML) return '';
  if (typeof req.context === 'string') {
    const context = { nodeName: req.context, tagName: req.context, attrs: [], namespaceURI: req.svg === true ? SVG_NS : HTML_NS, childNodes: [], parentNode: null };
    return JSON.stringify(childrenOf((parseFragment as (ctx: unknown, html: string) => any)(context, req.html)));
  }
  const root = (parse(req.html) as any).childNodes.find((n: any) => n.tagName === 'html');
  const head = root?.childNodes.find((n: any) => n.tagName === 'head');
  const body = root?.childNodes.find((n: any) => n.tagName === 'body');
  // a <frameset> document: left to the shim
  if (!head || !body) return '';
  return JSON.stringify([attrsOf(root.attrs), attrsOf(head.attrs), childrenOf(head), attrsOf(body.attrs), childrenOf(body)]);
}
