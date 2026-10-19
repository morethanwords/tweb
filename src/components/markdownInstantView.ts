/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import parseMarkdownToPage from '@lib/richTextProcessor/parseMarkdownToPage';
import type SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';

export function openMarkdownInstantView({
  raw,
  url = '',
  HotReloadGuardProvider
}: {
  raw: string,
  url?: string,
  HotReloadGuardProvider: typeof SolidJSHotReloadGuardProvider
}) {
  const page = parseMarkdownToPage(raw, url);
  // * mark page as fully cached so openInstantViewInAppBrowser doesn't fetch
  // * 0 is falsy and hides the views row in InstantView footer
  page.views = 0;
  hotReloadGuard.openInstantViewInAppBrowser({cachedPage: page, HotReloadGuardProvider});
}
