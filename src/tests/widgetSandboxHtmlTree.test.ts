import {describe, expect, it} from 'vitest';
import {parseHtmlTree} from 'widget-sandbox/host/html-tree';
import {parseHtmlTreeParse5} from 'widget-sandbox/host/html-tree-parse5';

// The page parses a widget's HTML with the browser's own parser for the sandbox (UPSTREAM.md, item 5), and the engine
// worker, which has no DOMParser, with parse5 in its own engine (item 8): the shim builds its DOM from either tree as it
// would from parse5's (widgetSandboxHtmlTreeParse5.test.ts holds the worker's own cases).
describe.each([
  ['the page', parseHtmlTree],
  ['the engine worker', parseHtmlTreeParse5]
])('a widget\'s HTML parsed by %s', (_, parseHtml) => {
  const parse = (request: object) => {
    const json = parseHtml(JSON.stringify(request));
    return json ? JSON.parse(json) : json;
  };

  it('gives a document as its head and its body, the way a browser builds them', () => {
    const [htmlAttrs, headAttrs, head, bodyAttrs, body] = parse({
      html: '<html lang="en"><style>p{}</style><body class="b"><p id="x">a<b>c</b></p><!--note--><table><tr><td>1</td></tr></table></body></html>'
    });
    expect(htmlAttrs).toEqual(['lang', 'en']);
    expect(headAttrs).toEqual([]);
    expect(head).toEqual([['style', 0, [], ['p{}']]]);
    expect(bodyAttrs).toEqual(['class', 'b']);
    expect(body[0]).toEqual(['p', 0, ['id', 'x'], ['a', ['b', 0, [], ['c']]]]);
    expect(body[1]).toEqual([0, 'note']);
    // the <tbody> a browser adds
    expect(body[2]).toEqual(['table', 0, [], [['tbody', 0, [], [['tr', 0, [], [['td', 0, [], ['1']]]]]]]]);
  });

  it('keeps SVG names in their case and namespaced attributes whole', () => {
    const body = parse({html: '<svg viewBox="0 0 1 1"><linearGradient xlink:href="#a"/></svg>'})[4];
    expect(body).toEqual([['svg', 1, ['viewBox', '0 0 1 1'], [['linearGradient', 1, ['xlink:href', '#a'], []]]]]);
  });

  it('hands over a template\'s content', () => {
    const body = parse({html: '<div><template><i>t</i></template></div>'})[4];
    expect(body[0][3]).toEqual([['template', 0, [], [['i', 0, [], ['t']]]]]);
  });

  it('parses a fragment as the children of its context element', () => {
    expect(parse({html: '<tr><td>x</td></tr>', context: 'tbody'})).toEqual([['tr', 0, [], [['td', 0, [], ['x']]]]]);
    expect(parse({html: '<circle r="1"/>', context: 'g', svg: true})).toEqual([['circle', 1, ['r', '1'], []]]);
  });

  it('leaves HTML past 16 KB to the shim, where the CPU and memory limits stop it', () => {
    // parse5 is quadratic in the nesting; a browser's parser builds a DOM of any size outside the widget's memory limit
    const flat = '<p>a</p>'.repeat(2048);
    expect(flat.length).toBe(16 * 1024);
    expect(parse({html: flat})[4].length).toBe(2048);
    expect(parse({html: flat + ' '})).toBe('');
    expect(parse({html: '<ul>'.repeat(8192)})).toBe('');
    expect(parse({html: '<div></div>'.repeat(200_000), context: 'div'})).toBe('');
  });

  it('leaves to the shim what it does not take: a frameset document, a malformed request', () => {
    expect(parse({html: '<frameset><frame></frameset>'})).toBe('');
    expect(parseHtml('not json')).toBe('');
    expect(parse({html: 1})).toBe('');
  });
});

describe('a widget\'s HTML parsed by the page', () => {
  it('leaves to the shim HTML with a <noscript>, which the browser\'s parser takes as markup, scripting off', () => {
    // in the head a script in it would come out after it, and run
    expect(parseHtmlTree(JSON.stringify({html: '<head><noscript><script>x()</script></noscript></head><body>b</body>'}))).toBe('');
    expect(parseHtmlTree(JSON.stringify({html: '<NoScript><b>n</b></NoScript>', context: 'div'}))).toBe('');
  });

  it('leaves to the shim a fragment whose context no element can be (the worker\'s parse5 takes it, as the shim\'s does)', () => {
    expect(parseHtmlTree(JSON.stringify({html: '<b>x</b>', context: 'not a name'}))).toBe('');
  });
});
