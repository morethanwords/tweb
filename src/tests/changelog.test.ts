import {readFileSync} from 'fs';
import {createRequire} from 'module';
import {describe, expect, it} from 'vitest';
import compareVersion from '@helpers/compareVersion';

const require = createRequire(import.meta.url);
const {
  UNRELEASED,
  getChangelogFiles,
  parseChangelog,
  getAppMessage,
  getPost,
  findProblems,
  releaseChangelog
} = require('../scripts/changelogs.js');

type Section = {title: string, version: string, body: string};

// * the sections up to this one were written before the changelog was for people only, and stay as they are
const WRITTEN_FOR_PEOPLE_AFTER = '2.1.0';

const SECTION = [
  'Two years of work, in a few words.',
  '',
  '#### ✈️ Messages fly as you send them',
  'A sent message flies from the message field into its place in the chat.',
  '',
  'Stickers and GIFs fly too.',
  '',
  '<!-- video: send.mp4 "Sending a message" -->',
  '',
  '#### 👥 Switch accounts in place',
  'Up to four accounts, one click apart, **without reloading**.',
  '',
  '#### More',
  '- Calls can go peer-to-peer again.',
  '',
  '[More in the channel](https://t.me/WebK_en/18)'
].join('\n');

describe('changelogs', () => {
  const files = (getChangelogFiles() as {fileName: string, filePath: string}[]).map((file) => ({
    ...file,
    sections: parseChangelog(readFileSync(file.filePath, 'utf8')) as Section[]
  }));
  const getChecked = (sections: Section[]) => sections.filter((section) => {
    return section.version === UNRELEASED || compareVersion(section.version, WRITTEN_FOR_PEOPLE_AFTER) > 0;
  });

  it('has a section per version, newest first, and what is coming only on top', () => {
    expect(files.map((file) => file.fileName)).toContain('CHANGELOG.md');

    for(const {fileName, sections} of files) {
      sections.forEach((section, index) => {
        if(section.version === UNRELEASED) {
          expect(index, `${fileName}: "### ${UNRELEASED}" goes on top`).toBe(0);
          expect(section.title, fileName).toBe(UNRELEASED);
          return;
        }

        expect(section.title, fileName).toMatch(/^\d+(?:\.\d+)+(?: \(\d+\))?$/);
        const newer = sections[index - 1];
        if(newer && newer.version !== UNRELEASED) {
          expect(compareVersion(newer.version, section.version), `${fileName}: ${newer.title} before ${section.title}`).toBe(1);
        }
      });
    }
  });

  it('tells every language of the same released versions', () => {
    const getReleased = (sections: Section[]) => getChecked(sections)
    .filter((section) => section.version !== UNRELEASED)
    .map((section) => section.title);
    const [english, ...others] = files.map((file) => ({fileName: file.fileName, titles: getReleased(file.sections)}));

    for(const other of others) {
      expect(other.titles, other.fileName).toEqual(english.titles);
    }
  });

  it('is written for the people who use the app', () => {
    for(const {fileName, sections} of files) {
      for(const section of getChecked(sections)) {
        expect(findProblems(section.body), `${fileName}, ${section.title}: say what people see and can do, not how it was built (.claude/skills/changelog/SKILL.md)`).toEqual([]);
      }
    }
  });

  it('sends the app\'s message as the headlines with their leads, and the link to the post', () => {
    expect(getAppMessage(SECTION)).toBe([
      '✈️ **Messages fly as you send them.** A sent message flies from the message field into its place in the chat.',
      '👥 **Switch accounts in place.** Up to four accounts, one click apart, **without reloading**.',
      '',
      '[More in the channel](https://t.me/WebK_en/18)'
    ].join('\n'));

    // * a section from before the posts goes as it was written
    expect(getAppMessage('* One.\n* Two.')).toBe('• One.\n• Two.');
  });

  it('posts the section without its link, its headings raised, its clips in place', () => {
    expect(getPost(SECTION, (file: string, caption: string) => `[${file}: ${caption}]`)).toBe([
      'Two years of work, in a few words.',
      '',
      '## ✈️ Messages fly as you send them',
      'A sent message flies from the message field into its place in the chat.',
      '',
      'Stickers and GIFs fly too.',
      '',
      '[send.mp4: Sending a message]',
      '',
      '## 👥 Switch accounts in place',
      'Up to four accounts, one click apart, **without reloading**.',
      '',
      '## More',
      '- Calls can go peer-to-peer again.'
    ].join('\n'));
  });

  it('shows the emoji asked for animated in the post only', () => {
    const section = [
      '<!-- animated emoji: ✈️ 5431456208487716895, ❤ 5372926953978341366 -->',
      'Flights ✈ and hearts ❤️, but not ❤️‍🔥.',
      '',
      '#### ✈️ Messages fly as you send them',
      'A sent message flies into its place.',
      '',
      '<!-- video: send.mp4 "A flight ✈️" -->',
      '',
      '<details><summary>❤️ Hearts</summary>'
    ].join('\n');

    expect(getPost(section, (file: string, caption: string) => `[${file}: ${caption}]`)).toBe([
      'Flights ![✈](tg://emoji?id=5431456208487716895) and hearts ![❤️](tg://emoji?id=5372926953978341366), but not ❤️‍🔥.',
      '',
      '## ![✈️](tg://emoji?id=5431456208487716895) Messages fly as you send them',
      'A sent message flies into its place.',
      '',
      '[send.mp4: A flight ✈️]',
      '',
      '<details><summary><tg-emoji emoji-id="5372926953978341366">❤️</tg-emoji> Hearts</summary>'
    ].join('\n'));
    expect(getAppMessage(section)).toBe('✈️ **Messages fly as you send them.** A sent message flies into its place.');
    expect(findProblems(section)).toEqual([]);
    expect(findProblems(section.replace('❤ 5372926953978341366', 'heart 53'))).toContain(
      'an animated emoji that is not an emoji and the id of its custom emoji: "heart 53"'
    );
  });

  it('turns away a section that does not fit its two places', () => {
    expect(findProblems(SECTION)).toEqual([]);
    expect(findProblems('')).toEqual(['nothing is written']);
    expect(findProblems('Just text.')).toEqual(['no headline: a "#### <emoji> <name>" heading with its lead under it']);
    expect(findProblems('#### More\n- Item.')).toEqual(['no headline: a "#### <emoji> <name>" heading with its lead under it']);

    const headlines = (count: number) => Array.from({length: count}, (_, i) => `#### ⭐ Thing ${i}\nIt is new.`).join('\n\n');
    expect(findProblems(headlines(7))).toEqual(['7 headlines, more than the 6 the app\'s message lists: put the rest under a heading without an emoji']);
    expect(findProblems('#### ⭐ Thing\n\n- A list first.')).toEqual(['"Thing" starts with something other than its lead sentence']);
    expect(findProblems('#### ⭐ Thing\n1. A numbered list first.')).toEqual(['"Thing" starts with something other than its lead sentence']);
    expect(findProblems('#### ⭐ Thing\n> A quote first.')).toEqual(['"Thing" starts with something other than its lead sentence']);
    // * a lead may start bold, or with a link
    expect(findProblems('#### ⭐ Thing\n**Work and personal** can now live in one tab.')).toEqual([]);
    expect(findProblems('#### ⭐ Thing\n[Topics](https://telegram.org/blog/topics) come to groups.')).toEqual([]);
    expect(findProblems(`#### ⭐ Thing\n${'a'.repeat(161)}`)).toEqual(['the lead of "Thing" is 161 characters, more than 160']);
    expect(findProblems('#### ⭐ Thing\nIt is *very* new.')).toEqual(['the lead of "Thing" is the app\'s message too: only plain text, **bold** and links']);
    expect(findProblems('#### ⭐ Thing\nIt is new.\n\nAnd __bold__.')).toEqual(['"__" is bold in the post and italic in the app: write **bold** or *italic*']);
    expect(findProblems(`#### ⭐ Thing\nIt is new.\n\n${'a '.repeat(16400)}`)).toEqual(['32824 characters, more than the 32768 a post holds']);
  });

  it('turns away what reads as written for a developer', () => {
    const problems = (text: string) => findProblems(`#### ⭐ Thing\nIt is new.\n\n${text}`);
    expect(problems('Folders work better on [iOS-like screens](https://telegram.org/blog/folders) on an *iPhone*.\n* Calls can go peer-to-peer again.')).toEqual([]);
    expect(problems('Привет, это **обычный** текст: папки работают быстрее, а [подробности здесь](https://t.me/WebK_ru/15).')).toEqual([]);

    expect(problems('The `pinned` flag no longer gets lost.')).toEqual(['"`pinned`"']);
    expect(problems('appMessagesManager keeps the anchor_msg_id.')).toEqual(['"appMessagesManager"', '"anchor_msg_id"']);
    expect(problems('Fixed in src/lib/rootScope.ts by calling setPeer().')).toEqual(['"rootScope"', '"setPeer"', '"src/lib/rootScope.ts"', '"setPeer()"']);
    expect(problems('Reverts 8eb7679dd.')).toEqual(['"8eb7679dd"']);
    expect(problems('The API of the SharedWorker after a refactor.')).toEqual(['"API"', '"SharedWorker"', '"refactor"']);
    expect(problems('Пузыри больше не ререндерятся, а воркер не падает.')).toEqual(['"ререндерятся"', '"воркер"']);
    expect(problems('<!-- video: worker.mp4 "The worker" -->')).toEqual(['"worker"']);
    expect(problems('See [the report](https://bugs.telegram.org/c/66818) and https://github.com/morethanwords/tweb.')).toEqual([
      'a link to a bug report: https://bugs.telegram.org/c/66818',
      'a link outside Telegram: https://github.com/morethanwords/tweb.'
    ]);
  });

  it('turns what is coming into the version that is built, once its post is out', () => {
    expect(releaseChangelog(`### Unreleased\n${SECTION}\n\n### 2.2 (1)\nOld things.\n`, '2.3 (2)')).toBe(`### 2.3 (2)\n${SECTION}\n\n### 2.2 (1)\nOld things.\n`);

    expect(() => releaseChangelog('### 2.2 (1)\nOld things.\n', '2.3 (2)')).toThrow('there is no "### Unreleased" section on top');
    expect(() => releaseChangelog('### Unreleased\n\n### 2.2 (1)\nOld things.\n', '2.3 (2)')).toThrow('nothing is written');
    expect(() => releaseChangelog('### Unreleased\n#### ⭐ Thing\nA worker fix.\n\n[Post](https://t.me/WebK_en/18)\n', '2.3 (2)')).toThrow('"worker"');
    expect(() => releaseChangelog('### Unreleased\n#### ⭐ Thing\nIt is new.\n', '2.3 (2)')).toThrow('no link to its post in the channel on the last line');
  });
});
