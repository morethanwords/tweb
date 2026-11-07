// tweb (`inline`, `frame`; see UPSTREAM.md): the widget's HTML parsed by the browser's own parser instead of parse5
// inside QuickJS, which spent 35–60 ms of a widget's first task on it (the shim builds its DOM from the tree in 2–4 ms).
// Trusted code in a window; a worker has no DOMParser, and the shim keeps parse5 there.
//
// The documents are inert (DOMParser's, with no browsing context): nothing in them runs or loads, the same ground
// HTML sanitizers stand on. What leaves is strings only, in the shape the shim's build() takes from parse5:
//
//   node     = text (a string) | [0, data] (a comment) | [localName, flags, attrs, children] (an element)
//   flags    = 1 when the element is in the SVG namespace
//   attrs    = [qualifiedName, value, ...]
//   children = node[]; a <template>'s are its content's
//   document = [htmlAttrs, headAttrs, headChildren, bodyAttrs, bodyChildren]
//   fragment = node[] (the children the context element gets)

const SVG_NS = 'http://www.w3.org/2000/svg';
/**
 * The longest HTML parsed here, and by parse5 in a worker (html-tree-parse5.ts). Either parse runs to its end outside
 * QuickJS's interrupt and its memory limit. Here, in the page's thread (`inline`) or the renderer's frame (`frame`), a
 * DOM of whatever size the widget wrote is built, walked and serialized before anything checks it. In a worker, in the
 * thread every widget's engine shares, parse5 is quadratic in the depth of open elements (it has no depth cap like a
 * browser's 512): nested `<ul>`s took 0.12 s at 16 KB and 0.5 s at 32 KB on a development VM, `<div></div>` × 200 000
 * (2.2 MB, written by `innerHTML`) 79 s. Longer HTML goes back to the shim's own parse5, which the CPU and memory limits
 * stop: slower, so a document of the profile's (up to 32 KB) past this pays for it at its start — the largest of tweb's
 * fixtures is 14.5 KB.
 */
export const MAX_HTML = 16 * 1024;
/**
 * DOMParser parses with scripting off, where a <noscript> holds markup: in the head a <script> in it comes out after it
 * (the shim would run it) and other markup goes on into the body, shown. A browser with scripting on, and parse5, keep
 * its content as text: HTML with one is left to the shim's parse5.
 */
const NOSCRIPT = /<noscript/i;

type TreeNode = string | [0, string] | [string, number, string[], TreeNode[]];

let inert: Document | null = null;
/** An inert document to parse fragments in (an element's innerHTML there runs the fragment algorithm with it as context). */
function inertDocument(): Document {
  return inert ??= new DOMParser().parseFromString('', 'text/html');
}

function attrsOf(el: Element): string[] {
  const out: string[] = [];
  for (const a of Array.from(el.attributes)) out.push(a.name, a.value);
  return out;
}

function childrenOf(parent: Node): TreeNode[] {
  const out: TreeNode[] = [];
  for (let c = parent.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === 3) out.push((c as Text).data);
    else if (c.nodeType === 8) out.push([0, (c as Comment).data]);
    else if (c.nodeType === 1) {
      const el = c as Element;
      const name = el.localName;
      const svg = el.namespaceURI === SVG_NS;
      out.push([name, svg ? 1 : 0, attrsOf(el), childrenOf(name === 'template' && !svg ? (el as HTMLTemplateElement).content : el)]);
    }
  }
  return out;
}

/**
 * The glue's `parse` host call: `{html}` is a whole document, `{html, context, svg}` a fragment for innerHTML on a
 * `context` element (in the SVG namespace when `svg`). Returns the tree as JSON, or '' (the shim parses itself).
 */
export function parseHtmlTree(arg: string): string {
  let req: { html?: unknown; context?: unknown; svg?: unknown };
  try { req = JSON.parse(arg); } catch { return ''; }
  if (typeof req?.html !== 'string' || req.html.length > MAX_HTML || NOSCRIPT.test(req.html)) return '';
  if (typeof req.context === 'string') {
    const doc = inertDocument();
    let ctx: Element;
    try {
      ctx = req.svg === true ? doc.createElementNS(SVG_NS, req.context) : doc.createElement(req.context);
    } catch {
      return '';
    }
    ctx.innerHTML = req.html;
    return JSON.stringify(childrenOf(ctx instanceof HTMLTemplateElement ? ctx.content : ctx));
  }
  const doc = new DOMParser().parseFromString(req.html, 'text/html');
  const html = doc.documentElement, head = doc.head, body = doc.body;
  // a <frameset> document: left to parse5
  if (!html || !head || body?.localName !== 'body') return '';
  return JSON.stringify([attrsOf(html), attrsOf(head), childrenOf(head), attrsOf(body), childrenOf(body)]);
}
