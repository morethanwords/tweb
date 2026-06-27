/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import DOCUMENT_PICTURE_IN_PICTURE_SUPPORTED from '@environment/documentPictureInPictureSupport';
import {setAppWindow, getOverlayRoot} from '@helpers/appWindow';
import mirrorDocumentStyles from '@helpers/dom/mirrorDocumentStyles';
import appChatBackground from '@components/chat/bubbles/chatBackground';
import {delegateEvents, render} from 'solid-js/web';
import {MOUNT_CLASS_TO} from '@config/debug';
import {logger} from '@lib/logger';
import ClientPipPlaceholder from '@components/clientPipPlaceholder';

const log = logger('CLIENT-PIP');

// The whole IM page (`.whole.page-chats` → #main-columns → the sidebars/list/chat). Moving this whole
// subtree — not just #main-columns — keeps every `.page-chats`-scoped and `body.*`-scoped layout rule
// matching (the columns collapse if #main-columns is orphaned from its .page-chats ancestor).
const APP_ROOT_ID = 'page-chats';
const PIP_WIDTH = 430;
const PIP_HEIGHT = 760;

type PipState = {
  pipWindow: Window,
  moved: {node: Element, placeholder: Comment}[],
  placeholderScreen: HTMLElement,
  disposePlaceholder: () => void,
  disposeStyles: () => void,
  cleanup: () => void
};

let state: PipState | undefined;

export function isClientPipOpen() {
  return !!state;
}

/**
 * Move the WHOLE live client (`#main-columns`) into `pipWindow`'s document — same app instance, so
 * it's instant (no boot). Pure DOM move + style mirror + metrics rebind; parameterized by the target
 * window so the headless harness can drive it with a plain iframe (which has a real viewport, unlike
 * the 0×0 preview tab). Returns false if already popped out or the shell is missing.
 */
export function moveAppToWindow(pipWindow: Window, onReturn: () => void = moveAppBack): boolean {
  if(state) return false;
  const appRoot = document.getElementById(APP_ROOT_ID);
  if(!appRoot) return false;

  const doc = pipWindow.document;
  const disposeStyles = mirrorDocumentStyles(document, doc);

  // The pip document is bare — give html/body the resets the app shell expects to fill.
  const reset = doc.createElement('style');
  reset.textContent = 'html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden}';
  doc.head.append(reset);
  doc.title = document.title;

  // Point the metrics layer (windowSize / mediaSizes / updateColumnWidths / --vh) at the pip window
  // BEFORE the move, so the very first layout pass sizes for the pip viewport instead of the tab's.
  setAppWindow(pipWindow);

  // Move every top-level app node — the #page-chats shell AND the body-level overlay roots (stories
  // viewer, audio player, media-recording stage, sidebar drawer overlay, svg defs) — so overlays
  // opened in the pip have their roots there too. Each leaves a placeholder comment so it returns to
  // the exact same spot. Skip <script>s and the pip target itself (the harness iframe is in the body).
  const moved: {node: Element, placeholder: Comment}[] = [];
  Array.from(document.body.children).forEach((node) => {
    if(node.tagName === 'SCRIPT') return;
    if((node as HTMLIFrameElement).contentWindow === pipWindow) return;
    const placeholder = document.createComment('client-pip');
    node.before(placeholder);
    doc.body.append(node); // cross-document adopt; listeners & state survive
    moved.push({node, placeholder});
  });

  // Solid delegates onClick/onInput/etc. to the MAIN document (`delegateEvents` defaults to
  // `window.document`), running ONE handler that walks up from the target to the node's `$$click`
  // prop. The moved nodes keep those props, but the handler isn't on the pip document — so every
  // Solid `onClick` is dead in the pip until we install the same delegated handlers there. (The
  // event-name Set lives at the documented `_$DX_DELEGATE` key.)
  const delegated = (document as any)['_$DX_DELEGATE'] as Set<string> | undefined;
  if(delegated?.size) delegateEvents([...delegated], doc);

  // Shown in the now-empty tab so it doesn't read as a blank page; the button brings the client back
  // without the user having to find the pip window's own close control.
  const placeholderScreen = document.createElement('div');
  document.body.append(placeholderScreen);
  const disposePlaceholder = render(() => <ClientPipPlaceholder onReturn={onReturn} />, placeholderScreen);

  state = {pipWindow, moved, placeholderScreen, disposePlaceholder, disposeStyles, cleanup: () => {}};

  // The wallpaper canvas/gradient renderer doesn't survive the cross-document move — rebuild it fresh
  // in the pip document.
  appChatBackground.reRender();

  return true;
}

/** Move the client back into the main tab and tear down the pip plumbing. */
export function moveAppBack(): void {
  if(!state) return;
  const {moved, placeholderScreen, disposePlaceholder, disposeStyles, cleanup} = state;
  cleanup();
  disposePlaceholder();
  placeholderScreen.remove();
  setAppWindow(window); // rebind metrics to the tab before the move so it reflows for the real viewport
  moved.forEach(({node, placeholder}) => placeholder.replaceWith(node));

  // Same as on the way out — the wallpaper canvas didn't survive moving back; rebuild it in the tab.
  appChatBackground.reRender();

  disposeStyles();
  state = undefined;
}

/**
 * Return the client to the tab AND dismiss the pip window. Mirrors the internal `closePip` closure wired
 * to the pip's own pagehide/visibility auto-return; exported so the "Exit Picture-in-Picture" menu entry
 * (and any other in-app affordance) can close the pip without the user reaching for the OS chrome.
 */
export function closeClientPip(): void {
  const pipWindow = state?.pipWindow;
  moveAppBack();
  try {
    pipWindow?.close();
  } catch{}
}

/**
 * Pop the whole client out into an always-on-top Document Picture-in-Picture window. MUST be called
 * from a user gesture (the topbar button) so `requestWindow` is permitted. Auto-returns: once the tab
 * has actually been left and is then re-shown, the app moves back and the pip closes.
 */
export default async function openClientPip(): Promise<void> {
  if(!DOCUMENT_PICTURE_IN_PICTURE_SUPPORTED) return;
  if(state) {
    try {
      state.pipWindow.focus();
    } catch{}
    return;
  }

  let pipWindow: Window;
  try {
    pipWindow = await window.documentPictureInPicture!.requestWindow({width: PIP_WIDTH, height: PIP_HEIGHT});
  } catch(err) {
    log.error('requestWindow failed', err);
    return;
  }

  const closePip = () => {
    moveAppBack();
    try {
      pipWindow.close();
    } catch{}
  };

  if(!moveAppToWindow(pipWindow, closePip)) {
    try {
      pipWindow.close();
    } catch{}
    return;
  }

  let leftTab = false;
  const onVisibility = () => {
    if(document.visibilityState === 'hidden') leftTab = true;
    else if(leftTab) closePip();
  };

  state.cleanup = () => {
    document.removeEventListener('visibilitychange', onVisibility);
    pipWindow.removeEventListener('pagehide', closePip);
  };

  document.addEventListener('visibilitychange', onVisibility);
  // Dismissing via the OS chrome fires `pagehide`, not our close().
  pipWindow.addEventListener('pagehide', closePip);
}

// Expose the core for the headless harness — a plain iframe (real viewport) stands in for the pip
// window, letting the move + metrics-rebind be validated where requestWindow can't run.
MOUNT_CLASS_TO && ((MOUNT_CLASS_TO as any).clientPip = {moveAppToWindow, moveAppBack, closeClientPip, openClientPip, isClientPipOpen, getOverlayRoot});
