/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

/**
 * A Document Picture-in-Picture window starts as a blank document — none of the app's CSS reaches it.
 * This clones every stylesheet from `source` into `target` and keeps them live:
 *  - `<style>`/`<link>` additions & removals (Vite HMR, themeController's appended night-`<style>`);
 *  - the `<html>` class + inline style (the `.night` toggle, theme CSS custom properties, and the
 *    JS-owned layout vars `--vh` / `--chat-width` / `--left-column-width` …) mirrored on every change;
 *  - the `<body>` class (`has-chat`, `right-column-floats`, `is-mobile`, …).
 *
 * Per-source-sheet node mapping means unchanged sheets are never re-created, so theme/layout updates
 * don't flash the whole PiP. Returns a disposer that stops every observer.
 */
export default function mirrorDocumentStyles(source: Document, target: Document): () => void {
  // Maps a source stylesheet's owner node -> the cloned node we maintain in `target.head`.
  const mirrored = new Map<Node, HTMLStyleElement | HTMLLinkElement>();

  const syncSheets = () => {
    const seen = new Set<Node>();

    for(const sheet of Array.from(source.styleSheets)) {
      const owner = sheet.ownerNode;
      if(!owner) continue;
      seen.add(owner);

      let node = mirrored.get(owner);
      let cssText: string | undefined;
      try {
        cssText = Array.from(sheet.cssRules).map((rule) => rule.cssText).join('\n');
      } catch{
        // Cross-origin sheet — cssRules throws. Re-link it by href instead of inlining.
      }

      if(cssText !== undefined) {
        if(!node || node.tagName !== 'STYLE') {
          node?.remove();
          node = target.createElement('style');
          mirrored.set(owner, node);
          target.head.append(node);
        }
        if(sheet.media?.mediaText) node.media = sheet.media.mediaText;
        if(node.textContent !== cssText) node.textContent = cssText;
      } else {
        const href = (sheet.ownerNode as HTMLLinkElement).href;
        if(!href) continue;
        if(!node || node.tagName !== 'LINK') {
          node?.remove();
          node = target.createElement('link');
          (node as HTMLLinkElement).rel = 'stylesheet';
          mirrored.set(owner, node);
          target.head.append(node);
        }
        if(sheet.media?.mediaText) node.media = sheet.media.mediaText;
        if((node as HTMLLinkElement).href !== href) (node as HTMLLinkElement).href = href;
      }
    }

    for(const [owner, node] of mirrored) {
      if(!seen.has(owner)) {
        node.remove();
        mirrored.delete(owner);
      }
    }
  };

  const copyAttributes = (from: Element, to: Element, names: string[]) => {
    for(const name of names) {
      const value = from.getAttribute(name);
      if(value === null) to.removeAttribute(name);
      else if(to.getAttribute(name) !== value) to.setAttribute(name, value);
    }
  };

  const syncRoot = () => copyAttributes(source.documentElement, target.documentElement, ['class', 'style', 'dir', 'lang']);
  const syncBody = () => copyAttributes(source.body, target.body, ['class']);

  syncSheets();
  syncRoot();
  syncBody();

  let scheduled = false;
  const scheduleSheets = () => {
    if(scheduled) return;
    scheduled = true;
    Promise.resolve().then(() => {
      scheduled = false;
      syncSheets();
    });
  };

  // textContent of an existing <style> mutates as a childList change on that descendant.
  const headObserver = new MutationObserver(scheduleSheets);
  headObserver.observe(source.head, {childList: true, subtree: true, characterData: true});

  const rootObserver = new MutationObserver(syncRoot);
  rootObserver.observe(source.documentElement, {attributes: true, attributeFilter: ['class', 'style', 'dir', 'lang']});

  const bodyObserver = new MutationObserver(syncBody);
  bodyObserver.observe(source.body, {attributes: true, attributeFilter: ['class']});

  return () => {
    headObserver.disconnect();
    rootObserver.disconnect();
    bodyObserver.disconnect();
    mirrored.clear();
  };
}
