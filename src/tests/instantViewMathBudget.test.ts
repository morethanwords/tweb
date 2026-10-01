import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {afterAll, afterEach, beforeAll, describe, expect, test, vi} from 'vitest';
import {MAX_FORMULA_EXPANDED_TOKENS, MAX_FORMULA_NODES, renderLatexInto} from '@components/instantViewMath';
import type {Temml} from '@helpers/math/loadTemml';
import {getMiddleware} from '@helpers/middleware';

// The Node build carries the same patch as the script the app loads (patches/temml.patch), so
// the library-level budget is exercised on real Temml; the app loads its copy via a <script>
// tag jsdom cannot fetch, so `loadTemml` is the seam.
const require = createRequire(import.meta.url);
const temml: Temml & {renderToString(source: string, options?: object): string} = require('temml/dist/temml.cjs');
vi.mock('@helpers/math/loadTemml', () => ({default: () => Promise.resolve(temml)}));

// the report's payload: a 200-character macro body used 999 times — one short of `maxExpand`
const bodyBomb = '\\def\\x{' + 'a'.repeat(200) + '}' + '\\x'.repeat(999);
// 90k tokens from ONE expansion of a `#1#1…` macro (under the budget by itself), repeated 30 times
const argumentBomb = '\\def\\x#1{' + '#1'.repeat(300) + '}' + ('\\x{' + 'a'.repeat(300) + '}').repeat(30);
// stays under the token budget (99 902) and is stopped by the node budget instead
const nodeBomb = '\\def\\x{' + 'a'.repeat(100) + '}' + '\\x'.repeat(999);
// no macro at all: `\cancelto` builds its body twice, so nesting is exponential in the builder
const cancelBomb = Array.from({length: 12}).reduce<string>((source) => `\\cancelto{x}{${source}}`, 'x');
// 1500 cells and 1500 rows from 6 expansions
const matrixBomb = '\\def\\a{' + 'x&'.repeat(500) + '}\\def\\b{' + '\\\\'.repeat(500) + '}' +
  '\\begin{matrix}\\a\\a\\a x\\b\\b\\b\\end{matrix}';
// `Number("999…")` is Infinity, which the column loop ran towards until the heap was gone
const columnBomb = '\\begin{alignedat}{' + '9'.repeat(310) + '}x\\end{alignedat}';
// 60k `\middle`s: the `\left` handler used to copy its body once per delimiter
const middleBomb = '\\def\\a{' + 'x\\middle|'.repeat(100) + '}\\left(' + '\\a'.repeat(600) + '+\\right)';

// the app's budgets (see renderLatexInto); the library defaults are ten times looser
function renderToString(source: string) {
  return temml.renderToString(source, {
    displayMode: true,
    throwOnError: true,
    maxExpandTokens: MAX_FORMULA_EXPANDED_TOKENS,
    maxNodes: MAX_FORMULA_NODES
  });
}

describe('formula budgets', () => {
  // jsdom gives MathML elements no `style`, which Temml writes to while building the DOM; HTML
  // elements keep their own, so a bag on `Element` reaches only the MathML ones
  beforeAll(() => {
    Object.defineProperty(Element.prototype, 'style', {
      configurable: true,
      get() {
        return this.__style ??= {};
      }
    });
  });
  afterAll(() => {
    delete (Element.prototype as any).style;
  });
  afterEach(() => {
    document.body.textContent = '';
  });

  test('the shipped Temml charges expanded tokens against a budget', () => {
    const shipped = readFileSync(require.resolve('temml/dist/temml.min.js'), 'utf8');
    expect(shipped).toContain('maxExpandTokens');
    expect(shipped).toContain('countExpandedTokens');
    expect(shipped).toContain('maxNodes');
    expect(shipped).toContain('Too many columns in alignat');
  });

  test('a formula that builds too many MathML nodes is cut off while building', () => {
    for(const source of [cancelBomb, matrixBomb]) {
      const started = performance.now();
      expect(() => renderToString(source)).toThrow(/Too many MathML nodes/);
      expect(performance.now() - started).toBeLessThan(10_000);
    }
  });

  test('an alignat column count is capped', () => {
    expect(() => renderToString(columnBomb)).toThrow(/Too many columns/);
  });

  test('delimiters from a macro are collected in linear time', () => {
    const started = performance.now();
    expect(() => renderToString(middleBomb)).toThrow(/Too many expanded tokens/);
    expect(performance.now() - started).toBeLessThan(10_000);
  });

  test('a long macro body used many times is cut off', () => {
    const started = performance.now();
    expect(() => renderToString(bodyBomb)).toThrow(/Too many expanded tokens/);
    expect(performance.now() - started).toBeLessThan(10_000);
  });

  test('a macro fed a long argument is cut off before the argument is pasted', () => {
    const started = performance.now();
    expect(() => renderToString(argumentBomb)).toThrow(/Too many expanded tokens/);
    expect(performance.now() - started).toBeLessThan(10_000);
  });

  test('the budget is per formula and leaves ordinary macro use alone', () => {
    const source = '\\newcommand{\\vv}[1]{\\mathbf{#1}}' +
      Array.from({length: 500}, (_, i) => `\\vv{x_${i}}`).join('+');
    expect(renderToString(source)).toContain('<math');
    expect(renderToString(source)).toContain('<math');
    expect(() => renderToString('\\def\\x{a}' + '\\x'.repeat(1001))).toThrow(/Too many expansions/);
  });

  test('a formula over the node budget is shown as its source', async() => {
    const element = document.createElement('span');
    document.body.append(element);
    await renderLatexInto(element, nodeBomb, true);
    expect(element.textContent).toBe(nodeBomb);
    expect(element.childElementCount).toBe(0);
  });

  test('a formula over the token budget is shown as its source', async() => {
    const element = document.createElement('span');
    await renderLatexInto(element, bodyBomb, true);
    expect(element.textContent).toBe(bodyBomb);
    expect(element.childElementCount).toBe(0);
  });

  // ~1k nodes, in groups of 100 so that the build itself stays cheap
  const thousandNodes = '\\def\\x{{' + 'a'.repeat(100) + '}}' + '\\x'.repeat(10);
  const mount = () => {
    const element = document.createElement('span');
    document.body.append(element);
    return element;
  };
  // every typeset arms a frame that resets the allowance, so one frame leaves it full whatever
  // the tests before did
  const freshFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  test('formulas beyond a frame\'s allowance wait for the next frame', async() => {
    await freshFrame();
    const elements = Array.from({length: 6}, mount);
    const typeset = () => elements.filter((element) => element.querySelector('math')).length;

    const done = Promise.all(elements.map((element) => renderLatexInto(element, thousandNodes, true)));
    await Promise.resolve();
    // the first ones fill the frame's allowance of 2k nodes, the rest still show their source
    expect(typeset()).toBe(2);
    expect(elements[5].textContent).toBe(thousandNodes);

    await done;
    expect(typeset()).toBe(6);
  });

  test('a formula deferred to a later frame leaves a destroyed generation alone', async() => {
    await freshFrame();
    renderLatexInto(mount(), thousandNodes, true);
    renderLatexInto(mount(), thousandNodes, true);
    const middleware = getMiddleware();
    const element = mount();
    const ready = renderLatexInto(element, thousandNodes, true, middleware.get());
    await Promise.resolve();
    expect(element.querySelector('math')).toBeNull();

    middleware.destroy();
    await ready;
    expect(element.textContent).toBe(thousandNodes);
    expect(element.childElementCount).toBe(0);
  });

  test('the composer\'s formula is typeset at once whatever the frame has left', async() => {
    await freshFrame();
    renderLatexInto(mount(), thousandNodes, true);
    renderLatexInto(mount(), thousandNodes, true);
    const element = mount();
    renderLatexInto(element, 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}', true, undefined, true);
    await Promise.resolve();
    expect(element.querySelector('math')).toBeTruthy();
  });

  test('a formula within both budgets is typeset', async() => {
    const element = document.createElement('span');
    document.body.append(element);
    await renderLatexInto(element, 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}', true);
    expect(element.querySelector('math')).toBeTruthy();
    expect(element.textContent).not.toContain('\\frac');
  });
});
