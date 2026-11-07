import fs from 'node:fs';
import path from 'node:path';
import type {MessageMedia} from '@layer';

export const WIDGET_FIXTURES = path.resolve(__dirname, '../../lib/widgetSandbox/fixtures');

/** Every widget fixture's HTML file under `dir`. */
export const widgetFixtureFiles = (dir = WIDGET_FIXTURES): string[] => fs.readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
  const file = path.join(dir, entry.name);
  return entry.isDirectory() ? widgetFixtureFiles(file) : entry.name.endsWith('.html') ? [file] : [];
});

/** A message's widget as the server sends it, at the bot's size (0: auto), with no source. */
export const makeWidgetMedia = (fields: Partial<MessageMedia.messageMediaWidget> = {}): MessageMedia.messageMediaWidget => ({
  _: 'messageMediaWidget',
  pFlags: {},
  width: 0,
  height: 0,
  payload: new Uint8Array(),
  ...fields
});
