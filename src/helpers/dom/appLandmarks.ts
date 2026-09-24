/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {attachClickEvent} from '@helpers/dom/clickEvent';
import cancelEvent from '@helpers/dom/cancelEvent';
import I18n from '@lib/langPack';

/**
 * WCAG 2.4.1 Bypass Blocks.
 *
 * The link keeps its `href` so it stays a real link for assistive technology,
 * but it must NOT be followed: the browser would write `#column-center` into
 * `location.hash`, and that hash is the app's deep-link route — a bare fragment
 * used to fall through to the `#/im` branch and open a NaN peer. So the click is
 * cancelled and focus is moved to the target directly, leaving the URL alone.
 */
export function attachSkipToContent(link: HTMLElement, target: HTMLElement) {
  // It ships `hidden`, because index.html is served before the language pack:
  // an empty link left in the tab order is itself a violation (axe `link-name`),
  // and there is nothing to skip to until the chat UI exists. Name it, then show it.
  link.append(I18n.format('AccDescr.SkipToConversation', true));
  link.hidden = false;

  return attachClickEvent(link, (e) => {
    cancelEvent(e);
    target.focus();
  });
}

/**
 * index.html is served before the language pack exists, so the landmark names
 * cannot be written into the markup. These are plain attributes rather than
 * `i18n()` elements, so they are re-applied whenever the language changes.
 */
export function setLandmarkLabels(navigation: HTMLElement, complementary: HTMLElement) {
  navigation?.setAttribute('aria-label', I18n.format('AccDescr.ChatList', true));
  complementary?.setAttribute('aria-label', I18n.format('AccDescr.ChatInfo', true));
}
