import {afterEach, describe, expect, test, vi} from 'vitest';
import {renderLatexInto} from '@components/instantViewMath';

// Temml ships as an IIFE global loaded through a <script> tag (see loadTemml for why it must not
// be bundled), and jsdom does not fetch external scripts — so the loader is the seam to stub.
// jsdom's MathML elements also have no `style`, which the real Temml writes to; stand in for it
// with the shape it produces for `a=b \tag{1}\label{electronHelpers}` plus a `\ref` pointing at it.
vi.mock('@helpers/math/loadTemml', () => ({
  default: () => Promise.resolve({
    render: (source: string, element: HTMLElement) => {
      const label = source.match(/\\label\{([^}]+)\}/)[1];
      element.innerHTML = `<math><mtable><mtr id="${label}"><mtd></mtd></mtr>` +
        `<mrow class="tml-ref" href="#${label}"></mrow></mtable></math>`;
    }
  })
}));

// `\label{…}` is the only way message content can put an `id` of its choosing into the document.
// Ids are exposed on `window` under their own name, and they collide with whatever already owns
// them — so a rendered formula must never keep the name it asked for.
describe('rendered LaTeX labels', () => {
  afterEach(() => {
    document.body.textContent = '';
  });

  async function render(source: string) {
    const element = document.createElement('span');
    document.body.append(element);
    renderLatexInto(element, source, true);
    await vi.waitFor(() => expect(element.querySelector('[id]')).toBeTruthy());
    return element;
  }

  test('a label cannot mint a global of its own name', async() => {
    // the click-XSS report used `\label{electronHelpers}` to forge the Electron bridge binding
    const element = await render('a=b \\tag{1}\\label{electronHelpers}');

    expect(document.getElementById('electronHelpers')).toBeNull();
    const id = element.querySelector('[id]').getAttribute('id');
    expect(id).toMatch(/^tml-label-\d+-electronHelpers$/);
    // cross-references keep pointing at the namespaced id
    expect(element.querySelector('[href]').getAttribute('href')).toEqual('#' + id);
  });

  test('a label cannot collide with an id the app already owns', async() => {
    const page = document.createElement('div');
    page.id = 'page-chats';
    document.body.append(page);

    await render('a=b \\tag{1}\\label{page-chats}');
    expect(document.getElementById('page-chats')).toBe(page);
  });

  test('two formulas asking for the same label stay distinct', async() => {
    const first = await render('a=b \\tag{1}\\label{eq}');
    const second = await render('c=d \\tag{2}\\label{eq}');

    expect(first.querySelector('[id]').getAttribute('id'))
    .not.toEqual(second.querySelector('[id]').getAttribute('id'));
  });
});
