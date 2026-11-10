import type {MessageMedia} from '@layer';
import {zlibSync} from 'fflate';

/**
 * Widgets to look at and test with: a copy of part of widget-sandbox v0.6.3 — its showcase, defaults and compat
 * corpus, its interactive widgets and bot demos (they ask the sandbox's mock bot, mockBot.ts), the resize and safe-area
 * ones, its attack corpus, and its conformance set (`conformance/auto`, `/visual`, `/sdk`) — and tweb's own bench widgets
 * (`bench/`, lib/widgetSandbox/bench.ts), loaded on demand.
 */

const FIXTURES = import.meta.glob<string>('./fixtures/**/*.html', {query: '?raw', import: 'default'});
const FIXTURE_PREFIX = './fixtures/';
/** The demos first, the attacks last. */
const GROUP_ORDER = ['showcase', 'interactive', 'bot-demos', 'resize', 'safe-area', 'defaults', 'conformance', 'compat', 'bench', 'attacks'];

/** `showcase/work/02-kanban`, `conformance/sdk/01-link-external`, `compat/tabs`, `attacks/api-fetch`, … */
export function listWidgetFixtures() {
  const groupIndex = (name: string) => GROUP_ORDER.indexOf(name.slice(0, name.indexOf('/')));
  return Object.keys(FIXTURES)
  .map((path) => path.slice(FIXTURE_PREFIX.length, -'.html'.length))
  .sort((a, b) => groupIndex(a) - groupIndex(b) || a.localeCompare(b));
}

export async function loadWidgetFixture(name: string) {
  const load = FIXTURES[FIXTURE_PREFIX + name + '.html'];
  if(!load) throw new Error(`no widget fixture "${name}"; see listWidgetFixtures()`);
  return load();
}

/** The widget as the server delivers it: a zlib stream of its source (level 9, as the server packs it), and the size it was sent with (0 for none). */
export function widgetMedia(html: string, width = 0, height = 0): MessageMedia.messageMediaWidget {
  return {_: 'messageMediaWidget', pFlags: {}, width, height, payload: zlibSync(new TextEncoder().encode(html), {level: 9})};
}
