import {URL as NodeURL} from 'node:url';
import {describe, expect, it} from 'vitest';
import {checkLink} from 'widget-sandbox/shared/sdk-policy';

/** The URL the browser's own parser (WHATWG, UTS #46) makes of `url`, or null when it takes none. */
const browserHref = (url: string) => {
  try {
    return new NodeURL(url).href;
  } catch{
    return null;
  }
};

// The SDK's link rules (docs/sdk-v1.md §2.5) as the widget and the host both apply them.
describe('widget link policy', () => {
  it('puts a Unicode host in its xn-- form and percent-encodes the rest', () => {
    expect(checkLink('openLink', 'https://пример.испытание/путь?q=1')).toBe('https://xn--e1afmkfd.xn--80akhbyknj4f/%D0%BF%D1%83%D1%82%D1%8C?q=1');
    expect(checkLink('openLink', 'https://Bücher.example/')).toBe('https://xn--bcher-kva.example/');
    expect(checkLink('openLink', 'https://xn--e1afmkfd.xn--80akhbyknj4f/')).toBe('https://xn--e1afmkfd.xn--80akhbyknj4f/');
  });

  it('refuses a Unicode label that would pass for an ASCII one, or that is not letters and digits', () => {
    // U+212A KELVIN SIGN lowercases to "k"
    expect(checkLink('openLink', 'https://Kexample.org/')).toBeNull();
    expect(checkLink('openLink', 'https://a☃.org/')).toBeNull();
    expect(checkLink('openLink', 'https://a b.org/')).toBeNull();
  });

  it('maps a Unicode host as the browser does: each code point lowercased alone, compatibility forms, the deviations kept', () => {
    for(const url of [
      // the whole label's final-sigma rule made it ος, another host
      'https://ΟΣ.gr/',
      'https://ΣΊΣΥΦΟΣ.gr/',
      // a ς or a ß given stays
      'https://Σίσυφος.gr/',
      'https://Straße.de/',
      'https://ẞδ.de/',
      // U+2126 OHM SIGN, a ligature, a full-width letter, a titlecase digraph, the lunate and a mathematical final sigma
      'https://\u2126δ.gr/',
      'https://ﬁnança.br/',
      'https://ＡΒΓ.gr/',
      'https://ǅδ.com/',
      'https://δϲ.gr/',
      'https://δ𝛓.gr/',
      'https://İδ.tr/'
    ]) {
      expect(checkLink('openLink', url), url).toBe(browserHref(url));
    }
    // a label of a character of these blocks, beside a Greek letter: where the browser takes it, the same host or none
    // (where it takes none, by the bidi rule, which checkLink does not apply, there is nothing to compare)
    for(const [from, to] of [[0x80, 0x52f], [0x1e00, 0x1fff], [0x2100, 0x218f], [0xfb00, 0xfb4f], [0xff00, 0xffef], [0x1d400, 0x1d7ff]]) {
      for(let cp = from; cp <= to; cp++) {
        for(const url of [`https://δ${String.fromCodePoint(cp)}.gr/`, `https://${String.fromCodePoint(cp)}Σ.gr/`]) {
          const href = checkLink('openLink', url), browser = browserHref(url);
          if(href !== null && browser !== null) expect(href, url).toBe(browser);
        }
      }
    }
  });

  it('refuses what the browser maps otherwise than lowercasing does, rather than send another host', () => {
    // iota subscript, Cherokee, a variation selector, a full-width ASCII name
    for(const url of ['https://ᾳδ.gr/', 'https://ꭰᏸ.com/', 'https://пример\ufe0f.рф/', 'https://ｇｏｏｇｌｅ.com/']) {
      expect(browserHref(url), url).not.toBeNull();
      expect(checkLink('openLink', url), url).toBeNull();
    }
    // a mark first, which the browser refuses too
    expect(browserHref('https://\u0301δ.gr/')).toBeNull();
    expect(checkLink('openLink', 'https://\u0301δ.gr/')).toBeNull();
  });

  it('keeps the rest of the rules', () => {
    expect(checkLink('openLink', 'https://Example.ORG/Path')).toBe('https://example.org/Path');
    expect(checkLink('openLink', 'http://example.org/')).toBeNull();
    expect(checkLink('openLink', 'https://user:pw@example.org/')).toBeNull();
    expect(checkLink('openLink', 'https://t.me/telegram')).toBeNull();
    expect(checkLink('openTelegramLink', 'https://t.me/telegram')).toBe('https://t.me/telegram');
    expect(checkLink('openTelegramLink', 'https://тест.t.me/x')).toBe('https://xn--e1aybc.t.me/x');
    // 256 characters at most
    expect(checkLink('openLink', 'https://example.org/' + 'a'.repeat(236))).toHaveLength(256);
    expect(checkLink('openLink', 'https://example.org/' + 'a'.repeat(237))).toBeNull();
  });
});
