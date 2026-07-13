/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {MessageEntity, RichText} from '@layer';
import parseMarkdown from '@lib/richTextProcessor/parseMarkdown';
import sortEntities from '@lib/richTextProcessor/sortEntities';
import {encodeInlineMath} from '@helpers/math/mathMarker';

// * Escaped characters (\* \_ \` …) are stashed as Private Use Area placeholders — one distinct
// * code point per escapable char — so they pass through the emphasis regexes and parseMarkdown
// * WITHOUT being seen as markdown delimiters, then are restored to the literal char by cleanup().
// * (The old `\x00X\x00` triple left the literal X in the stream, which re-triggered *emphasis*.)
const ESCAPABLE = '\\*_`[]<>~|()#+-=!.';
const ESC_PUA_BASE = 0xE000;
// matches exactly the PUA range used for escape placeholders (ESC_PUA_BASE .. +ESCAPABLE.length-1)
const ESC_PUA_RE = new RegExp(
  '[' + String.fromCharCode(ESC_PUA_BASE) + '-' + String.fromCharCode(ESC_PUA_BASE + ESCAPABLE.length - 1) + ']',
  'g'
);
const SOH = '\x01';
// A footnote reference `[^id]` becomes `\x03N\x03` (N = its number). splitOnSentinels builds a
// clickable superscript directly from it — done as a dedicated sentinel (not `[N](#fn-N)` markdown)
// so the top-level parseMarkdown pass doesn't create a link entity that would sever the pair.
const FN_SENTINEL = '\x03';
const SUP_SENTINEL = '\x04';
const SUB_SENTINEL = '\x06';
const MARK_SENTINEL = '\x07';

const SENTINEL_TYPE: Record<string, 'textSuperscript' | 'textSubscript' | 'textMarked'> = {
  [SUP_SENTINEL]: 'textSuperscript',
  [SUB_SENTINEL]: 'textSubscript',
  [MARK_SENTINEL]: 'textMarked'
};

const SENTINEL_RE = /([\x03\x04\x06\x07])([^\x03\x04\x06\x07]+?)\1/g;

const CONVERTIBLE = new Set<MessageEntity['_']>([
  'messageEntityBold',
  'messageEntityItalic',
  'messageEntityUnderline',
  'messageEntityStrike',
  'messageEntityCode',
  'messageEntityPre',
  'messageEntityTextUrl',
  'messageEntityUrl',
  'messageEntityEmail',
  'messageEntityPhone',
  'messageEntityHighlight',
  'messageEntityAnchor',
  'messageEntitySubscript',
  'messageEntitySuperscript'
]);

// * preprocess CommonMark dialect into parseMarkdown's dialect.
// * parseMarkdown supports `**X**` (bold), `__X__` (italic — quirky), `_-_X_-_` (underline),
// * `~~X~~` (strike), `||X||` (spoiler), `` `X` ``, ``` ```pre``` ```, `[t](u)`.
// * It does NOT support `*X*`, `_X_`, `***X***`, `\X` escapes, `<url>`, HTML, $math$, [^fn].
function preprocess(raw: string, refs?: Map<string, string>, footnoteNumbers?: Map<string, number>): string {
  let s = raw;

  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<br\s*\/?>/gi, '\n');

  // <sub>X</sub>, <sup>X</sup>, <mark>X</mark> → sentinel pairs preserved through entity build,
  // converted to textSubscript/textSuperscript/textMarked in postProcessSentinels.
  s = s.replace(/<sub\b[^<>]*>([\s\S]*?)<\/sub>/gi, `${SUB_SENTINEL}$1${SUB_SENTINEL}`);
  s = s.replace(/<sup\b[^<>]*>([\s\S]*?)<\/sup>/gi, `${SUP_SENTINEL}$1${SUP_SENTINEL}`);
  s = s.replace(/<mark\b[^<>]*>([\s\S]*?)<\/mark>/gi, `${MARK_SENTINEL}$1${MARK_SENTINEL}`);

  // Strip layout / container tags (keep their inner text). Inline formatting tags (b/strong, i/em,
  // u, s/strike/del) are NOT stripped here — they are converted to real styling further below.
  s = s.replace(/<\/?(div|details|summary|p|span)\b[^<>]*>/gi, '');

  s = s.replace(/<(https?:\/\/[^\s<>]+)>/g, '[$1]($1)');
  s = s.replace(/<([\w.+-]+@[\w.-]+\.\w+)>/g, '[$1](mailto:$1)');

  // Footnote references [^id]. A known (defined) footnote → \x03N\x03, rendered as a clickable
  // superscript linking to its definition. An unknown one → a plain \x04id\x04 superscript.
  s = s.replace(/\[\^([^\]\n]+)\]/g, (_full, id) => {
    const n = footnoteNumbers?.get(id);
    return n !== undefined ? FN_SENTINEL + n + FN_SENTINEL : SUP_SENTINEL + id + SUP_SENTINEL;
  });

  // Reference-style links [text][id] → [text](url).
  if(refs && refs.size > 0) {
    s = s.replace(/\[([^\]\n]+)\]\[([^\]\n]+)\]/g, (full, text, id) => {
      const url = refs.get(String(id).toLowerCase());
      return url ? `[${text}](${url})` : full;
    });
  }

  // [text](url "title") → [text](url) — strip optional title.
  s = s.replace(/\[([^\]\n]+)\]\(\s*([^\s)]+)\s+"[^"]*"\s*\)/g, '[$1]($2)');

  // Inline math $X$ → a base64-protected marker carried verbatim to the IV, which renders it with
  // Temml. Encoding it here (before the escape / emphasis passes) keeps the raw LaTeX source intact.
  s = s.replace(/(?<!\\|\$)\$(?!\s|\$)([^$\n]+?)(?<!\s)\$(?!\$)/g, (_full, src) => encodeInlineMath(src));

  s = s.replace(/\\([\\*_`\[\]<>~|()#+\-=!.])/g, (_full, ch) => String.fromCharCode(ESC_PUA_BASE + ESCAPABLE.indexOf(ch)));

  // ***X*** / ___X___ → bold + italic, using parseMarkdown's `**X**` outer and `__X__` inner.
  // Must run BEFORE single `__X__` so the inserted inner `__` markers stay paired.
  const tripleReplacement = `${SOH}**${SOH}__${SOH}$1${SOH}__${SOH}**${SOH}`;
  s = s.replace(/___([^\n_\x00\x01]+?)___/g, tripleReplacement);
  s = s.replace(/\*\*\*([^\n*\x00\x01]+?)\*\*\*/g, tripleReplacement);

  // CommonMark __X__ (bold) → parseMarkdown's **X**. Content excludes \x01 so that
  // the inner `__` from triple replacements (wrapped in \x01) isn't matched.
  s = s.replace(/__([^\n_\x00\x01]+?)__/g, `${SOH}**$1**${SOH}`);

  // CommonMark *X* (italic) → parseMarkdown's __X__ (italic).
  s = s.replace(/(?<![*\\\x00\x01])\*(?![\s*\x00\x01])([^\n*\x00\x01]+?)(?<![\s\x00\x01])\*(?![*\x00\x01])/g, `${SOH}__$1__${SOH}`);

  // CommonMark _X_ (italic) → parseMarkdown's __X__. Skip when adjacent to word chars (snake_case).
  s = s.replace(/(?<![_\\\w\x00\x01])_(?![_\s\x00\x01])([^\n_\x00\x01]+?)(?<![\s\x00\x01])_(?![_\w\x00\x01])/g, `${SOH}__$1__${SOH}`);

  // Safe inline formatting HTML → parseMarkdown markers, SOH-wrapped so they parse in any position.
  // Runs after the emphasis passes so any `*` / `_` content inside is already converted and nests.
  s = s.replace(/<(?:strong|b)\b[^<>]*>([\s\S]*?)<\/(?:strong|b)>/gi, `${SOH}**$1**${SOH}`);
  s = s.replace(/<(?:em|i)\b[^<>]*>([\s\S]*?)<\/(?:em|i)>/gi, `${SOH}__$1__${SOH}`);
  s = s.replace(/<u\b[^<>]*>([\s\S]*?)<\/u>/gi, `${SOH}_-_$1_-_${SOH}`);
  s = s.replace(/<(?:s|strike|del)\b[^<>]*>([\s\S]*?)<\/(?:s|strike|del)>/gi, `${SOH}~~$1~~${SOH}`);

  return s;
}

function cleanup(s: string): string {
  if(!s) return s;
  s = s.replace(/\x01/g, '');
  // restore escaped-char PUA placeholders back to their literal character
  s = s.replace(ESC_PUA_RE, (ch) => ESCAPABLE[ch.charCodeAt(0) - ESC_PUA_BASE]);
  return s;
}

function plain(s: string): RichText {
  return s ? {_: 'textPlain', text: s} : {_: 'textEmpty'};
}

function wrapEntity(entity: MessageEntity, sourceText: string, inner: RichText): RichText {
  switch(entity._) {
    case 'messageEntityBold':
      return {_: 'textBold', text: inner};
    case 'messageEntityItalic':
      return {_: 'textItalic', text: inner};
    case 'messageEntityUnderline':
      return {_: 'textUnderline', text: inner};
    case 'messageEntityStrike':
      return {_: 'textStrike', text: inner};
    case 'messageEntityCode':
    case 'messageEntityPre':
      return {_: 'textFixed', text: inner};
    case 'messageEntityTextUrl':
      return {_: 'textUrl', text: inner, url: cleanup(entity.url), webpage_id: 0};
    case 'messageEntityUrl':
      return {_: 'textUrl', text: inner, url: cleanup(sourceText), webpage_id: 0};
    case 'messageEntityEmail':
      return {_: 'textEmail', text: inner, email: cleanup(sourceText)};
    case 'messageEntityPhone':
      return {_: 'textPhone', text: inner, phone: cleanup(sourceText)};
    case 'messageEntityHighlight':
      return {_: 'textMarked', text: inner};
    case 'messageEntityAnchor':
      return {_: 'textAnchor', text: inner, name: entity.name || ''};
    case 'messageEntitySubscript':
      return {_: 'textSubscript', text: inner};
    case 'messageEntitySuperscript':
      return {_: 'textSuperscript', text: inner};
    default:
      return inner;
  }
}

function buildSegment(text: string, entities: MessageEntity[], from: number, to: number): RichText {
  const parts: RichText[] = [];
  let cursor = from;
  let i = 0;
  while(i < entities.length) {
    const e = entities[i];
    const eStart = e.offset;
    const eEnd = e.offset + e.length;
    if(eStart < cursor || eEnd > to) {
      ++i;
      continue;
    }

    if(eStart > cursor) {
      parts.push(plain(cleanup(text.slice(cursor, eStart))));
    }

    const children: MessageEntity[] = [];
    let j = i + 1;
    while(j < entities.length) {
      const c = entities[j];
      if(c.offset >= eStart && c.offset + c.length <= eEnd) {
        children.push(c);
        ++j;
      } else {
        break;
      }
    }

    const innerText = text.slice(eStart, eEnd);
    let inner: RichText;
    if(children.length > 0) {
      const adjusted = children.map((c) => ({...c, offset: c.offset - eStart}));
      inner = buildSegment(innerText, adjusted, 0, innerText.length);
    } else {
      inner = parseAndBuild(innerText);
    }

    parts.push(wrapEntity(e, innerText, inner));
    cursor = eEnd;
    i = j;
  }

  if(cursor < to) {
    parts.push(plain(cleanup(text.slice(cursor, to))));
  }

  if(parts.length === 0) return {_: 'textEmpty'};
  if(parts.length === 1) return parts[0];
  return {_: 'textConcat', texts: parts};
}

function parseAndBuild(text: string): RichText {
  if(!text) return {_: 'textEmpty'};
  const [t, entities] = parseMarkdown(text, [], true);
  const filtered = entities.filter((e) => CONVERTIBLE.has(e._));
  sortEntities(filtered);
  return buildSegment(t, filtered, 0, t.length);
}

function splitOnSentinels(text: string): RichText {
  SENTINEL_RE.lastIndex = 0;
  const parts: RichText[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  // A sentinel pair can be severed when its wrapped content gets inline formatting (the entity
  // tree splits the run, leaving each marker in a different textPlain). Drop any such stray
  // marker so a raw control char never leaks into rendered text, instead of showing garbage.
  const pushPlain = (s: string) => {
    s = s.replace(/[\x03\x04\x06\x07]/g, '');
    if(s) parts.push({_: 'textPlain', text: s});
  };
  while((m = SENTINEL_RE.exec(text)) !== null) {
    if(m.index > last) {
      pushPlain(text.slice(last, m.index));
    }
    if(m[1] === FN_SENTINEL) {
      // Footnote reference: a superscript number that links to its definition (#fn-N), wrapped in an
      // anchor (#fnref-N) so the definition's back-link can jump here. N is a plain number — no inner
      // markdown — so building the RichText directly (not via parseMarkdown) can't sever the pair.
      const n = m[2];
      parts.push({
        _: 'textAnchor',
        name: 'fnref-' + n,
        text: {
          _: 'textSuperscript',
          text: {_: 'textUrl', url: '#fn-' + n, text: {_: 'textPlain', text: n}, webpage_id: 0}
        }
      });
    } else {
      // Parse the wrapped content so inline markdown inside <sub>/<sup>/<mark> (e.g. **bold**) is
      // rendered, not shown literally — the surrounding sentinel chars block parseMarkdown otherwise.
      parts.push({_: SENTINEL_TYPE[m[1]], text: postProcessSentinels(parseAndBuild(m[2]))} as RichText);
    }
    last = m.index + m[0].length;
  }
  if(last < text.length) {
    pushPlain(text.slice(last));
  }
  if(parts.length === 0) return {_: 'textEmpty'};
  if(parts.length === 1) return parts[0];
  return {_: 'textConcat', texts: parts};
}

function postProcessSentinels(rt: RichText): RichText {
  switch(rt._) {
    case 'textPlain':
      if(/[\x03\x04\x06\x07]/.test(rt.text)) return splitOnSentinels(rt.text);
      return rt;
    case 'textConcat':
      return {_: 'textConcat', texts: rt.texts.map(postProcessSentinels)};
    case 'textBold':
    case 'textItalic':
    case 'textUnderline':
    case 'textStrike':
    case 'textFixed':
    case 'textMarked':
    case 'textSubscript':
    case 'textSuperscript':
    case 'textUrl':
    case 'textEmail':
    case 'textPhone':
    case 'textAnchor':
      return {...rt, text: postProcessSentinels(rt.text)};
    default:
      return rt;
  }
}

export default function inlineMarkdownToRichText(
  raw: string,
  refs?: Map<string, string>,
  footnoteNumbers?: Map<string, number>
): RichText {
  if(!raw) return {_: 'textEmpty'};
  const trimmed = preprocess(raw, refs, footnoteNumbers).replace(/^\s+|\s+$/g, '');
  const built = parseAndBuild(trimmed);
  return postProcessSentinels(built);
}
