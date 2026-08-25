import convertPunycode from '@vendor/convertPunycode';
import {normalizeUrlProtocol} from '@lib/richTextProcessor/matchUrlProtocol';

// * inspired by https://github.com/Ajaxy/telegram-tt/blob/6b52024107b7b534fc25dfaddd91868f653d0092/src/util/browser/url.ts#L43
// * the plain latin/non-latin split it (and Telegram for iOS) uses misses a mix of two non-latin
// * scripts — `пօчта.рф` is cyrillic with an armenian `օ` — and cries wolf on `例え.jp`,
// * so the scripts are resolved per label instead, following UTS #39.
// * this is a script-level heuristic, not a confusables table: same-script look-alikes
// * (`rnicrosoft.com`, `paypa1.com`) need a skeleton match the browser already does for us.

// scripts a domain label may legitimately be written in (UTS #39 "recommended scripts").
// a letter from anything else — Cherokee, Osage, Vai … — is a spoofing tool, not a real domain
const RECOMMENDED_SCRIPTS = [
  'Latin', 'Cyrillic', 'Greek', 'Armenian', 'Hebrew', 'Arabic', 'Thaana',
  'Devanagari', 'Bengali', 'Gurmukhi', 'Gujarati', 'Oriya', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Sinhala',
  'Thai', 'Lao', 'Tibetan', 'Myanmar', 'Georgian', 'Ethiopic', 'Khmer',
  'Han', 'Hiragana', 'Katakana', 'Hangul', 'Bopomofo'
] as const;

type Script = typeof RECOMMENDED_SCRIPTS[number];

const SCRIPT_REG_EXPS = RECOMMENDED_SCRIPTS.map((script) => [script, new RegExp(`\\p{Script=${script}}`, 'u')] as const);
const LETTER_REG_EXP = /\p{L}/u;
// digits, hyphens, and script-neutral letters such as the japanese `ー` belong to no script in particular
const SCRIPTLESS_REG_EXP = /[\p{Script=Common}\p{Script=Inherited}]/u;

// scripts that legitimately co-occur inside a single label (UTS #39 "highly restrictive")
const ALLOWED_SCRIPT_SETS: Script[][] = [
  ['Han', 'Hiragana', 'Katakana'],
  ['Han', 'Hangul'],
  ['Han', 'Bopomofo']
];

// scripts full of latin look-alikes: `аррӏе.com` is single-script cyrillic and still a spoof
const LATIN_CONFUSABLE_SCRIPTS: Script[] = ['Cyrillic', 'Greek', 'Armenian'];

const scriptsCache: Map<string, Script> = new Map();
function getScript(char: string) {
  let script = scriptsCache.get(char);
  if(script === undefined) {
    if(scriptsCache.size > 1024) { // a tab open for days must not accumulate every letter it has seen
      scriptsCache.clear();
    }

    script = SCRIPT_REG_EXPS.find(([, regExp]) => regExp.test(char))?.[0] ?? null;
    scriptsCache.set(char, script);
  }

  return script;
}

// returns the scripts the label is written in, or undefined if it uses a script no registry allows
function getLabelScripts(label: string) {
  const scripts: Set<Script> = new Set();
  for(const char of label) {
    if(!LETTER_REG_EXP.test(char) || SCRIPTLESS_REG_EXP.test(char)) {
      continue;
    }

    const script = getScript(char);
    if(!script) {
      return;
    }

    scripts.add(script);
  }

  return scripts;
}

export default function isSuspiciousUrl(url: string): boolean {
  url = normalizeUrlProtocol(url);

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch(e) {
    return true; // invalid url — treat it as suspicious
  }

  // `https://почта.рф@evil.com` opens evil.com; the part that reads like a host is just a login
  if(parsed.username || parsed.password) {
    return true;
  }

  let hostname: string;
  try {
    hostname = convertPunycode(parsed.hostname);
  } catch(e) {
    return true; // malformed punycode
  }

  const labels = hostname.toLowerCase().split('.');
  if(labels.length > 1 && labels[0] === 'www') { // a latin `www.` on `www.почта.рф` is not a spoof
    labels.shift();
  }

  const domainScripts: Set<Script> = new Set();
  for(const label of labels) {
    const scripts = getLabelScripts(label);
    if(!scripts) {
      return true;
    }

    if(
      scripts.size > 1 &&
      !ALLOWED_SCRIPT_SETS.some((allowed) => Array.from(scripts).every((script) => allowed.includes(script)))
    ) {
      return true;
    }

    scripts.forEach((script) => domainScripts.add(script));
  }

  // every label is single-script on its own, but a cyrillic/greek/armenian label next to a latin
  // one is the classic whole-script homograph; `例え.jp` mixes scripts too and confuses nobody
  return domainScripts.has('Latin') && LATIN_CONFUSABLE_SCRIPTS.some((script) => domainScripts.has(script));
}
