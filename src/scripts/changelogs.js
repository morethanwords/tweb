// @ts-check

/**
 * The changelogs are what people who use the app read: CHANGELOG.md in English, CHANGELOG_<lang>.md in
 * another language. A version's section is the post about it in @WebK_en / @WebK_ru, in rich message
 * Markdown, and its headlines with their leads are the short message sent once to the "Telegram" chat of
 * whoever updates to it (generate_changelog.js → public/changelogs/ → apiUpdatesManager). What is coming
 * waits under "### Unreleased" at the top until a version bump names it (change_version.js).
 * How to write one: .claude/skills/changelog/SKILL.md
 */

const fs = require('fs');
const path = require('path');

const escapeRegExp = require('../helpers/string/escapeRegExp.ts').default;
const {DEFAULT_RICH_MESSAGE_LIMITS} = require('../lib/appManagers/utils/richMessage/richMessageLimits.ts');

const ROOT = path.join(__dirname, '..', '..');
const UNRELEASED = 'Unreleased';
// * what a rich message holds
const MAX_POST_LENGTH = DEFAULT_RICH_MESSAGE_LIMITS.lengthLimit;
// * the app's message is a notice read in passing: a handful of lines and a link to the post
const MAX_HEADLINES = 6;
const MAX_LEAD_LENGTH = 160;
const MAX_APP_MESSAGE_LENGTH = 1000;
// * a block that is not the lead's sentence: a list's item, a quote, a table, a picture, HTML, a heading — but not
// * **bold** or a [link], which a lead may start with
const LEAD_NOT_A_SENTENCE = /^(?:[-*+]\s|\d+[.)]\s|[>|<#]|!\[)/;

// * "#### <emoji> <name>": a headline, listed in the app's message with its lead, the paragraph under it
const HEADLINE = /^#### (\S+) (.+)$/;
const EMOJI = /[\p{Extended_Pictographic}⃣]/u;
// * the last line once the post is out, which only the app's message shows
const POST_LINK = /^\[[^\]]+\]\(https:\/\/t\.me\/\w+\/\d+\)$/;
// * a clip of the post, which GitHub does not show: <!-- video: send.mp4 "caption" -->
const VIDEO = /^<!--\s*video:\s*(\S+?)(?:\s+"([^"]*)")?\s*-->$/;
// * the emoji the post shows animated, as the custom emoji of these ids (t.me/addemoji/RestrictedEmoji has the
// * animated twin of most emoji); GitHub and the app's message keep the plain ones:
// * <!-- animated emoji: 🎨 5431456208487716895, 👥 5372926953978341366 -->
const ANIMATED_EMOJI = /^<!--\s*animated emoji:\s*(.*?)\s*-->$/;
const ANIMATED_EMOJI_PAIR = /^(\S+)\s+(\d+)$/;

// * where a link may lead: what Telegram itself shows people
const LINK_HOST = /^(?:[\w-]+\.)*(?:telegram\.org|telegram\.me|t\.me|fragment\.com)$/i;
// * the names of Apple's systems are the only camelCase a person reads
const CAMEL_CASE_WORDS = new Set(['iOS', 'iPadOS', 'macOS', 'watchOS', 'tvOS', 'visionOS', 'iPhone', 'iPad', 'iCloud', 'eSIM']);
const DEVELOPER_ACRONYMS = ['APIs?', 'SDK', 'DOM', 'S?CSS', 'JSON', 'HMR', 'WASM', 'HLS', 'RTL', 'LTR', 'PRs?', 'NaN'];
const DEVELOPER_WORDS = [
  'mtproto', 'endpoints?', 'payloads?', 'workers?', 'sharedworkers?', 'serviceworkers?', 'indexeddb', 'websockets?',
  'webassembly', 'webrtc', 'vite', 'vitest', 'playwright', 'jsdom', 'oxlint', 'lint(?:er|ing)?', 'typescript',
  'typecheck', 'solidjs', 'bundles?', 'chunks?', 'components?', 'refactor(?:s|ed|ing)?', 'regressions?', 'specs?',
  'e2e', 'unit tests?', 'fixtures?', 'mock(?:s|ed)?', 'stub(?:s|bed)?', 'sandbox(?:es)?', 'feature flags?',
  'constructors?', 'schema', 'layer \\d+', 'race conditions?', 'a11y', 'i18n', 'lang ?packs?', 'import graph',
  'tdesktop', 'telegram-tt', '(?:re-?)?render(?:s|ed|ing)?', 'debounc\\w*', 'throttl\\w*', 'callbacks?',
  'listeners?', 'composer', 'topbar', 'regex(?:es)?', 'null', 'undefined', 'commits?', 'pull requests?', 'repo'
];
// * stems: Russian changes a word's ending
const DEVELOPER_STEMS_RU = [
  'рефактор', 'компонент', 'регресси', 'воркер', 'бандл', 'ререндер', 'рендер', 'фикстур', 'эндпоинт', 'пейлоад',
  'колбэк', 'коллбэк', 'листенер', 'композер', 'лейаут', 'коммит'
];

const TECHNICAL = [
  /`[^`]*`?/g,
  /\b[A-Za-z0-9]+_[A-Za-z0-9_]*[A-Za-z0-9]\b/g,
  /\b[\w./-]+\.(?:tsx?|jsx?|mjs|cjs|s?css|json|wasm)\b/gi,
  /\b(?:src|scripts|e2e)\/\S*/g,
  /\b\w+\(\)/g,
  /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/g,
  new RegExp(`\\b(?:${DEVELOPER_ACRONYMS.join('|')})\\b`, 'g'),
  new RegExp(`\\b(?:${DEVELOPER_WORDS.join('|')})\\b`, 'gi'),
  new RegExp(`(?<!\\p{L})(?:${DEVELOPER_STEMS_RU.join('|')})\\p{L}*`, 'giu')
];

function getChangelogFiles() {
  return fs.readdirSync(ROOT)
  .filter((fileName) => fileName.startsWith('CHANGELOG') && fileName.endsWith('.md'))
  .map((fileName) => ({
    fileName,
    filePath: path.join(ROOT, fileName),
    lang: (fileName.split('_')[1] || 'en').split('.')[0]
  }));
}

/**
 * @param {string} text
 * @returns {{title: string, version: string, body: string}[]}
 */
function parseChangelog(text) {
  return text.split(/^### /m).slice(1).map((chunk) => {
    const lines = chunk.split('\n');
    const title = lines.shift().trim();
    while(lines.length && !lines[lines.length - 1].trim()) {
      lines.pop();
    }

    return {title, version: title.split(' ')[0], body: lines.join('\n')};
  });
}

/**
 * @param {string} body
 */
function parseSection(body) {
  /** @type {Map<string, string>} the post's animated emoji, without variation selectors: their ids */
  const animated = new Map();
  /** @type {string[]} the pairs of an animated emoji line that are not an emoji and an id */
  const badAnimated = [];
  const lines = body.split('\n').filter((line) => {
    const match = line.trim().match(ANIMATED_EMOJI);
    if(!match) {
      return true;
    }

    for(const pair of match[1].split(',').map((pair) => pair.trim()).filter(Boolean)) {
      const [, emoji, id] = pair.match(ANIMATED_EMOJI_PAIR) || [];
      if(emoji && EMOJI.test(emoji)) {
        animated.set(emoji.replace(/️/g, ''), id);
      } else {
        badAnimated.push(pair);
      }
    }

    return false;
  });
  const link = lines.length && POST_LINK.test(lines[lines.length - 1].trim()) ? lines.pop().trim() : undefined;
  /** @type {{emoji: string, name: string, lead: string}[]} */
  const headlines = [];
  lines.forEach((line, index) => {
    const match = line.match(HEADLINE);
    if(!match || !EMOJI.test(match[1])) {
      return;
    }

    let i = index + 1;
    while(i < lines.length && !lines[i].trim()) {
      ++i;
    }

    const lead = [];
    for(; i < lines.length && lines[i].trim() && !lines[i].startsWith('#'); ++i) {
      lead.push(lines[i].trim());
    }

    headlines.push({emoji: match[1], name: match[2].trim(), lead: lead.join(' ')});
  });

  return {post: lines.join('\n').trimEnd(), headlines, link, animated, badAnimated};
}

/**
 * Every emoji of `animated` in a line of the post, as its custom emoji: ![🎨](tg://emoji?id=…), or in a line of
 * HTML (a group's <summary>), where Markdown is not read, <tg-emoji emoji-id="…">🎨</tg-emoji>
 * @param {string} line
 * @param {Map<string, string>} animated
 */
function animateEmoji(line, animated) {
  if(!animated.size) {
    return line;
  }

  const isHtml = line.trimStart().startsWith('<');
  // * one pass, longest first, so the alternative text of one put in place is not taken for another; an emoji that
  // * is a part of another (❤ of ❤️‍🔥, 👋 of 👋🏽) is left alone
  const emoji = [...animated.keys()].sort((a, b) => b.length - a.length);
  const alone = (/** @type {string} */ pattern) => `(?<!\\u200D)(?:${pattern})\\uFE0F?(?!\\uFE0F?[\\u200D\\u20E3\\u{1F3FB}-\\u{1F3FF}])`;
  const regExp = new RegExp(emoji.map((emoji) => alone([...emoji].map(escapeRegExp).join('\\uFE0F?'))).join('|'), 'gu');
  return line.replace(regExp, (match) => {
    const id = animated.get(match.replace(/\uFE0F/g, ''));
    return isHtml ? `<tg-emoji emoji-id="${id}">${match}</tg-emoji>` : `![${match}](tg://emoji?id=${id})`;
  });
}

/**
 * The message the app sends to the "Telegram" chat: the headlines with their leads, and the link to the post.
 * A section written before the posts is sent as it is
 * @param {string} body
 */
function getAppMessage(body) {
  const {headlines, link} = parseSection(body);
  if(!headlines.length) {
    return body.replace(/^\*(\s)/gm, '•$1');
  }

  const lines = headlines.map(({emoji, name, lead}) => {
    return `${emoji} **${/[.!?…]$/.test(name) ? name : name + '.'}** ${lead}`;
  });

  return lines.join('\n') + (link ? '\n\n' + link : '');
}

/**
 * The post for the channel: the section without its link, its headings raised to the post's levels, every clip
 * handed to `video` to be put in place, and its animated emoji in place of the plain ones
 * @param {string} body
 * @param {(file: string, caption?: string) => string} video
 */
function getPost(body, video) {
  const {post, animated} = parseSection(body);
  return post
  .replace(/^(#{4,6}) /gm, (_, hashes) => hashes.slice(2) + ' ')
  .split('\n')
  .map((line) => {
    const match = line.trim().match(VIDEO);
    return match ? video(match[1], match[2]) : animateEmoji(line, animated);
  })
  .join('\n');
}

/**
 * What keeps a section from going out to people: it is empty, has no headline, does not fit, or reads as
 * written for a developer — each technical finding is the text that gave it away
 * @param {string} body
 * @returns {string[]}
 */
function findProblems(body) {
  const problems = [];
  if(!body.trim()) {
    return ['nothing is written'];
  }

  const {post, headlines, badAnimated} = parseSection(body);
  for(const pair of badAnimated) {
    problems.push(`an animated emoji that is not an emoji and the id of its custom emoji: "${pair}"`);
  }

  if(!headlines.length) {
    problems.push('no headline: a "#### <emoji> <name>" heading with its lead under it');
  } else if(headlines.length > MAX_HEADLINES) {
    problems.push(`${headlines.length} headlines, more than the ${MAX_HEADLINES} the app's message lists: put the rest under a heading without an emoji`);
  }

  for(const {name, lead} of headlines) {
    if(!lead || LEAD_NOT_A_SENTENCE.test(lead)) {
      problems.push(`"${name}" starts with something other than its lead sentence`);
    } else if(lead.length > MAX_LEAD_LENGTH) {
      problems.push(`the lead of "${name}" is ${lead.length} characters, more than ${MAX_LEAD_LENGTH}`);
    } else if(/(^|[^*])\*(?!\*)|(^|\W)_(?!_)|~~|\|\||==/.test(lead)) {
      problems.push(`the lead of "${name}" is the app's message too: only plain text, **bold** and links`);
    }
  }

  const appMessage = getAppMessage(body);
  if(appMessage.length > MAX_APP_MESSAGE_LENGTH) {
    problems.push(`the app's message is ${appMessage.length} characters, more than ${MAX_APP_MESSAGE_LENGTH}`);
  }

  if(post.length > MAX_POST_LENGTH) {
    problems.push(`${post.length} characters, more than the ${MAX_POST_LENGTH} a post holds`);
  }

  if(body.includes('__')) {
    problems.push('"__" is bold in the post and italic in the app: write **bold** or *italic*');
  }

  /** @type {string[]} */
  const urls = [];
  const text = body
  .split('\n')
  .map((line) => {
    const match = line.trim().match(VIDEO);
    return match ? match[2] || '' : ANIMATED_EMOJI.test(line.trim()) ? '' : line;
  })
  .join('\n')
  .replace(/\[([^\]]*)\]\(([^)\s]*)\)/g, (_, linkText, url) => (urls.push(url), linkText))
  .replace(/\bhttps?:\/\/[^\s)]+/g, (url) => (urls.push(url), ''))
  .replace(/\*\*|~~/g, '');

  for(const url of urls) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch(err) {
      problems.push(`a link that is not one: ${url}`);
      continue;
    }

    if(!LINK_HOST.test(parsed.hostname)) {
      problems.push(`a link outside Telegram: ${url}`);
    } else if(/^bugs\./i.test(parsed.hostname) && parsed.pathname.length > 1) {
      problems.push(`a link to a bug report: ${url}`);
    }
  }

  for(const word of text.match(/\b[a-z]+[A-Z][A-Za-z0-9]*\b/g) || []) {
    if(!CAMEL_CASE_WORDS.has(word)) {
      problems.push(`"${word}"`);
    }
  }

  for(const regExp of TECHNICAL) {
    for(const match of text.match(regExp) || []) {
      problems.push(`"${match}"`);
    }
  }

  return [...new Set(problems)];
}

/**
 * Turns the Unreleased section into the version's own; by then its post is out, and the section links to it
 * @param {string} text
 * @param {string} title the version as it is built, "2.3 (685)"
 */
function releaseChangelog(text, title) {
  const [section] = parseChangelog(text);
  if(section?.title !== UNRELEASED) {
    throw new Error(`there is no "### ${UNRELEASED}" section on top`);
  }

  const problems = findProblems(section.body);
  if(!parseSection(section.body).link) {
    problems.push('no link to its post in the channel on the last line');
  }

  if(problems.length) {
    throw new Error(`"### ${UNRELEASED}" cannot go out to people: ${problems.join(', ')}`);
  }

  return text.replace(`### ${UNRELEASED}`, `### ${title}`);
}

module.exports = {
  UNRELEASED,
  getChangelogFiles,
  parseChangelog,
  parseSection,
  getAppMessage,
  getPost,
  findProblems,
  releaseChangelog
};
