/*
 * tweb/managers-before-await: a function that waits reads its managers once, before the wait, bound to the
 * account session (bindManagersToSession) - after it, the tab's own managers would be those of whichever
 * account it shows by then. Runs the rule through oxlint over code that marks every line it must report.
 */
import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {afterAll, describe, expect, test} from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const dir = mkdtempSync(path.join(tmpdir(), 'tweb-managers-rule-'));
afterAll(() => rmSync(dir, {recursive: true, force: true}));

function reportedLines(source: string, options?: {allowThis?: boolean}) {
  const file = path.join(dir, 'fixture.tsx');
  const config = path.join(dir, '.oxlintrc.json');
  writeFileSync(file, source);
  writeFileSync(config, JSON.stringify({
    jsPlugins: [{name: 'tweb', specifier: path.join(ROOT, 'scripts/oxlint/twebPlugin.mjs')}],
    categories: {correctness: 'off'},
    rules: {'tweb/managers-before-await': options ? ['error', options] : 'error'}
  }));

  let output: string;
  try {
    output = execFileSync(path.join(ROOT, 'node_modules/.bin/oxlint'), ['-c', config, '-f', 'unix', file], {encoding: 'utf8', stdio: 'pipe'});
  } catch(err) {
    output = (err as {stdout: string}).stdout;
  }

  return [...output.matchAll(/fixture\.tsx:(\d+):\d+:.*managers-before-await/g)].map((match) => +match[1]);
}

// * the lines a fixture marks with `// reported` (`{/* reported */}` in JSX)
const markedLines = (source: string) => source.split('\n').flatMap((line, index) => /\/\/ reported|\/\* reported \*\//.test(line) ? [index + 1] : []);

describe('tweb/managers-before-await', () => {
  test('reports managers read after a wait, and kept as they are for after one', () => {
    const source = `
declare const rootScope: any, wait: () => Promise<void>, createPopup: (callback: () => any) => void, PopupElement: any;
declare const button: {onclick: () => void}, getAccountManagers: (accountNumber: number) => any;
export async function afterAwait() {
  rootScope.managers.a.read();
  await wait();
  rootScope.managers.a.write(); // reported
}
export function inContinuation() {
  wait().then(() => rootScope.managers.a.write()); // reported
  setTimeout(() => rootScope.managers.a.write(), 10); // reported
}
export async function inCallbackRunAtOnce(ids: number[]) {
  await wait();
  ids.forEach((id) => rootScope.managers.a.write(id)); // reported
}
export async function inLoop(ids: number[]) {
  for(const id of ids) {
    rootScope.managers.a.write(id); // reported
    await wait();
  }
}
export async function keptAsTheyAre() {
  const managers = rootScope.managers; // reported
  await wait();
  managers.a.write();
}
export function keptMethod() {
  const write = rootScope.managers.a.write; // reported
  wait().then(() => write());
}
export function keptForAHandler() {
  const managers = rootScope.managers; // reported
  button.onclick = async() => {
    await wait();
    managers.a.write();
  };
}
export async function keptAsAFallback(props: {managers?: any}) {
  const managers = props.managers || rootScope.managers; // reported
  await wait();
  managers.a.write();
}
export async function keptAsAChoice(accountNumber?: number) {
  const managers = accountNumber ? getAccountManagers(accountNumber) : rootScope.managers; // reported
  await wait();
  managers.a.write();
}
export async function popupAfterAwait() {
  await wait();
  createPopup(() => (
    <PopupElement class="late"> {/* reported */}
      <PopupElement.Body />
    </PopupElement>
  ));
}
export async function popupInAPromiseAfterAwait() {
  await wait();
  return new Promise<void>((resolve) => {
    createPopup(() => <PopupElement onClose={resolve} />); // reported
  });
}
export class Screen {
  managers: any;
  async keptByDestructuring() {
    const {managers} = this; // reported
    await wait();
    managers.a.write();
  }
  async ownAfterAwait() {
    await wait();
    this.managers.a.write(); // reported
  }
}
`;
    expect(reportedLines(source)).toEqual(markedLines(source));
  });

  test('lets through what is read before the wait, bound, for every account, or in a handler of its own', () => {
    const source = `
declare const rootScope: any, wait: () => Promise<void>, bindManagersToSession: (managers: any) => any;
declare const createPopup: (callback: () => any) => void, PopupElement: any;
declare const button: {onclick: () => void};
export async function bound() {
  const managers = bindManagersToSession(rootScope.managers);
  await wait();
  managers.a.write();
}
export async function readBeforeTheWait() {
  await rootScope.managers.a.read();
}
export async function everyAccount() {
  await wait();
  rootScope.managers.all.a.stop();
}
export async function setsThem(managers: any) {
  await wait();
  rootScope.managers = managers;
}
export async function handlerOfItsOwn() {
  await wait();
  button.onclick = () => rootScope.managers.a.write();
}
export function keptWithoutWaiting() {
  const managers = rootScope.managers;
  managers.a.write();
}
export function fallbackWithoutWaiting(props: {managers?: any}) {
  const managers = props.managers || rootScope.managers;
  [1, 2].forEach((id) => managers.a.write(id));
}
export async function popupHandedItsManagers() {
  const managers = bindManagersToSession(rootScope.managers);
  await wait();
  createPopup(() => <PopupElement managers={managers} />);
}
export function popupAtOnce() {
  createPopup(() => <PopupElement />);
}
`;
    expect(reportedLines(source)).toEqual([]);
  });

  test('allowThis: managers tied to an account when the class is made are read whenever', () => {
    const source = `
declare const wait: () => Promise<void>;
export class Chat {
  managers: any;
  async send() {
    await wait();
    this.managers.a.write();
  }
}
`;
    expect(reportedLines(source, {allowThis: true})).toEqual([]);
  });
});
