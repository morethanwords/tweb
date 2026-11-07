import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {parseHtmlTree} from 'widget-sandbox/host/html-tree';
import {parseHtmlTreeParse5} from 'widget-sandbox/host/html-tree-parse5';
import {WIDGET_FIXTURES, widgetFixtureFiles} from '@/tests/helpers/widgetFixtures';

// The engine worker (the `worker` transport) has no DOMParser: it parses a widget's HTML with parse5 in its own engine
// (UPSTREAM.md, item 8), into the tree the page builds with the browser's parser. What both give is checked for both in
// widgetSandboxHtmlTree.test.ts; here, the worker's tree against the page's, and its own bound.
describe('a widget\'s HTML parsed in the engine worker', () => {
  it('gives the tree the page gives for every fixture widget', () => {
    const files = widgetFixtureFiles();
    expect(files.length).toBeGreaterThan(100);
    for(const file of files) {
      const request = JSON.stringify({html: fs.readFileSync(file, 'utf8')});
      expect(parseHtmlTreeParse5(request), path.relative(WIDGET_FIXTURES, file)).toBe(parseHtmlTree(request));
    }
  });

  it('keeps a <noscript>\'s content as text, as a browser with scripting on does, in the head too', () => {
    const [, , head, , body] = JSON.parse(parseHtmlTreeParse5(JSON.stringify({html: '<head><noscript><script>x()</script></noscript></head><body><noscript><b>n</b></noscript></body>'})));
    expect(head).toEqual([['noscript', 0, [], ['<script>x()</script>']]]);
    expect(body).toEqual([['noscript', 0, [], ['<b>n</b>']]]);
  });

  it('parses a fragment as the children of its context element, as the page does', () => {
    for(const request of [
      {html: '<td>a</td>', context: 'tr'},
      {html: 'a<b>b</b><!--c-->', context: 'div'},
      {html: '<i>t</i>', context: 'template'}
    ]) {
      const json = JSON.stringify(request);
      expect(parseHtmlTreeParse5(json), json).toBe(parseHtmlTree(json));
    }
  });
});
