/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { i18n, join, LangPackKey } from "../lib/langPack";
import formatDuration, { DurationType } from "./formatDuration";

const CALL_DURATION_LANG_KEYS: {[type in DurationType]: LangPackKey} = {
  s: 'Seconds',
  m: 'Minutes',
  h: 'Hours',
  d: 'Days',
  w: 'Weeks'
};
export default function formatCallDuration(duration: number) {
  const a = formatDuration(duration, 2);
  const elements = a.map(d => i18n(CALL_DURATION_LANG_KEYS[d.type], [d.duration]));

  const fragment = document.createElement('span');
  fragment.append(...join(elements, false));

  return fragment;
}
