import {createMemo, createSignal, JSX, onCleanup, onMount, untrack, useContext} from 'solid-js';
import {unwrap} from 'solid-js/store';
import {ChatFull, ChatTheme, UserFull, WallPaper} from '@layer';
import PopupElement, {createPopup, PopupContext} from '@components/popups/indexTsx';
import Chat from '@components/chat/chat';
import {ChatBackground, ChatBackgroundTheme} from '@components/chat/bubbles/chatBackground';
import {ChatType} from '@components/chat/chatType';
import {NULL_PEER_ID} from '@appManagers/constants';
import themeController from '@helpers/themeController';
import appImManager from '@lib/appImManager';
import rootScope from '@lib/rootScope';
import {i18n, LangPackKey} from '@lib/langPack';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import replaceContent from '@helpers/dom/replaceContent';
import {useFullPeer} from '@stores/fullPeers';
import {appState} from '@stores/appState';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import ListenerSetter from '@helpers/listenerSetter';

export type ChatPreviewAnchor = HTMLElement | {x: number, y: number} | {
  x: number, y: number, left: number, right: number, top: number, bottom: number
};

export type ChatPreviewOptions = {
  peerId: PeerId,
  threadId?: number,
  monoforumThreadId?: number,
  lastMsgId?: number,
  anchor?: ChatPreviewAnchor
};

/**
 * Build a preview anchor from a dialog row. Anchors to the LEFT COLUMN's right edge
 * (instead of the row's own right edge) so the 8px gap from the sidebar is constant
 * regardless of the row's internal padding. Shared by Shift+Click and the context-menu
 * "Preview" entry — both want the popup pinned the same way.
 */
export function chatPreviewAnchorFromDialogRow(li: HTMLElement): ChatPreviewAnchor {
  const rect = li.getBoundingClientRect();
  const columnEl = li.closest<HTMLElement>('#column-left, .sidebar-left');
  const columnRight = columnEl?.getBoundingClientRect().right ?? rect.right;
  return {
    x: columnRight,
    y: rect.top + rect.height / 2,
    left: rect.left,
    right: columnRight,
    top: rect.top,
    bottom: rect.bottom
  };
}

export const CHAT_PREVIEW_POPUP_KIND = Symbol('chat-preview-popup');

const PREVIEW_W = 432;
const PREVIEW_H = 540;
const MARGIN = 8;

export default function showChatPreviewPopup(options: ChatPreviewOptions): void {
  if(!options.peerId || options.peerId === NULL_PEER_ID) return;

  // Shift+clicking through several dialogs in a row should swap the preview, not stack them.
  PopupElement.getPopups(CHAT_PREVIEW_POPUP_KIND).forEach((p) => p.hide());

  const [show, setShow] = createSignal(true);
  const handle = {hide: () => setShow(false)};

  let containerEl!: HTMLDivElement;
  // Held in outer scope so `onClose` (fires before the 250ms close animation) can call
  // `chat.beforeDestroy()` while `onCleanup` (fires after the animation, inside Inner) does
  // the full teardown.
  let chatRef: Chat | undefined;

  function Inner() {
    const context = useContext(PopupContext);
    const middleware = untrack(() => context.middlewareHelper).get();
    const managers = untrack(() => context.managers);
    const listenerSetter = new ListenerSetter();

    const chat = new Chat(appImManager, managers, false, {sharedMedia: true});
    chat.isPreview = true;
    chat.isStandalone = true;
    chat.onPreviewClose = () => handle.hide();
    chat.setType(ChatType.Chat);
    // `recomputePaddings` runs in the Chat constructor with the default (main-chat)
    // padding budget. Now that `isPreview` is set, redo the math so `bubbles-padding-top`
    // collapses from 4.5rem to 3.5rem (only the basic topbar, no pinned/floating plates).
    chat.recomputePaddings();
    chat.container.classList.add('chat-preview', 'active');
    chatRef = chat;

    // Resolve the peer's wallpaper + theme reactively, mirroring `Chat._handleBackgrounds`.
    // `<ChatBackground peerId>` only consults the *cached* full-user — for a peer not yet
    // fetched (or a chat/channel with a `theme_emoticon`) it returns {} and we'd render
    // the global wallpaper forever. `useFullPeer` triggers a fetch on first read and
    // re-fires the createMemo when the full peer lands, so the popup picks up the proper
    // wallpaper as soon as it's loaded.
    const fullPeer = useFullPeer(options.peerId);
    const resolvedBg = createMemo(() => {
      const _fullPeer = fullPeer();
      let wallPaper: WallPaper | undefined;
      let theme: ChatBackgroundTheme | undefined;

      if(_fullPeer) {
        wallPaper = unwrap((_fullPeer as ChatFull.channelFull).wallpaper);
        const emoticon = (_fullPeer as ChatFull.channelFull).theme_emoticon ||
          ((_fullPeer as UserFull.userFull).theme as ChatTheme.chatTheme)?.emoticon ||
          (wallPaper && wallPaper.settings?.emoticon);
        const found = emoticon && appState.accountThemes?.themes?.find((t) => t.emoticon === emoticon);
        theme = found ? unwrap(found) : undefined;
        // A theme picked by emoticon brings its own wallpaper; the per-peer override
        // shouldn't compete with it.
        if(emoticon && theme) wallPaper = undefined;
      }

      return {theme, wallPaper};
    });

    onMount(() => {
      positionFromAnchor(options.anchor);

      // setPeer triggers Chat.init() synchronously on the first call, which builds the
      // ChatInput tree (including the chat-input-control plate). After this returns the
      // plate exists; injecting now wires up our button into the centre slot before any
      // visible paint. The finish-peer-change pass later runs `finishPeerChange` which can
      // un-hide built-in buttons (botStart, joinBtn, …) — `keepOnlyOurButton` re-hides them
      // every time the plate's child list mutates so ours stays the only visible one.
      chat.setPeer({
        peerId: options.peerId,
        threadId: options.threadId,
        monoforumThreadId: options.monoforumThreadId,
        lastMsgId: options.lastMsgId
      });

      injectMarkUnreadButton();

      // Viewport resize moves the anchored dialog row underneath us — the popup was
      // positioned for the old layout and would float over the wrong target. Close instead
      // of trying to re-anchor; the user can Shift+Click again in the new layout.
      listenerSetter.add(window)('resize', () => handle.hide());
    });

    onCleanup(() => {
      listenerSetter.removeAll();
      chat.destroy();
      chatRef = undefined;
    });

    function positionFromAnchor(anchor: ChatPreviewAnchor) {
      if(!anchor) return;
      let ax: number, ay: number, rectLeft: number;
      if(anchor instanceof HTMLElement) {
        const r = anchor.getBoundingClientRect();
        ax = r.right;
        ay = r.top + r.height / 2;
        rectLeft = r.left;
      } else if('left' in anchor) {
        ax = anchor.right;
        ay = anchor.y;
        rectLeft = anchor.left;
      } else {
        ax = anchor.x;
        ay = anchor.y;
        rectLeft = anchor.x;
      }

      let left = ax + MARGIN;
      let top = ay - PREVIEW_H / 2;

      // Headless/zero-size measurements should fall through to the natural anchor offset
      // instead of collapsing the popup to a negative coordinate. Clamp only when the
      // viewport is large enough to actually contain the popup.
      const vw = window.innerWidth || document.documentElement.clientWidth;
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const maxLeft = vw > PREVIEW_W + MARGIN * 2 ? vw - PREVIEW_W - MARGIN : Infinity;
      const maxTop = vh > PREVIEW_H + MARGIN * 2 ? vh - PREVIEW_H - MARGIN : Infinity;
      if(left > maxLeft) {
        const fromLeft = rectLeft - PREVIEW_W - MARGIN;
        left = Math.max(MARGIN, fromLeft);
      }
      if(top < MARGIN) top = MARGIN;
      if(top > maxTop) top = maxTop;

      containerEl.style.setProperty('--preview-left', left + 'px');
      containerEl.style.setProperty('--preview-top', top + 'px');
    }

    /**
     * Append a Mark-as-Read / Mark-as-Unread button to the chat-input-control plate. Reuses
     * the same `.chat-input-plate-button` look the existing control buttons (Join, Unblock,
     * Bot Start, …) get. The built-in buttons get hidden — for some preview peers (bots,
     * blocked users, unjoined channels) `finishPeerChange` would otherwise un-hide one of
     * them and we'd end up with two visible buttons in the plate.
     */
    function injectMarkUnreadButton() {
      const plateCenter = chat.container.querySelector('.chat-input-control .chat-input-plate-center');
      if(!plateCenter) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.classList.add('btn-primary', 'btn-transparent', 'text-bold', 'chat-input-control-button', 'chat-input-plate-button');
      plateCenter.append(btn);

      // ChatInput's `finishPeerChange` toggles built-in buttons (botStart, join, unblock, …)
      // every time the peer changes — and it runs *after* this synchronous inject. Re-hide
      // those siblings every time the plate's class list mutates so our button stays the
      // only visible one.
      const keepOnlyOurButton = () => {
        plateCenter.querySelectorAll<HTMLElement>(':scope > button').forEach((b) => {
          if(b !== btn && !b.classList.contains('hide')) b.classList.add('hide');
        });
      };
      keepOnlyOurButton();
      const observer = new MutationObserver(keepOnlyOurButton);
      observer.observe(plateCenter, {attributes: true, attributeFilter: ['class'], subtree: true, childList: true});
      middleware.onDestroy(() => observer.disconnect());

      const setLabel = (key: LangPackKey) => replaceContent(btn, i18n(key));
      setLabel('MarkAsRead'); // placeholder until we resolve the actual state

      const refresh = async() => {
        const dialog = await getDialog();
        if(!dialog || !middleware()) return;
        const unread = await managers.appMessagesManager.isDialogUnread(dialog);
        if(!middleware()) return;
        setLabel(unread ? 'MarkAsRead' : 'MarkAsUnread');
      };
      refresh();

      // Keep the label in sync with state mutations performed elsewhere (other client, this
      // very button, etc.). `subscribeOn` cleans up automatically when the popup disposes.
      subscribeOn(rootScope)('dialog_unread', (payload: {peerId: PeerId}) => {
        if(payload.peerId === options.peerId) refresh();
      });
      subscribeOn(rootScope)('dialogs_multiupdate', refresh);

      attachClickEvent(btn, async() => {
        const dialog = await getDialog();
        if(!dialog) return;
        const isUnread = await managers.appMessagesManager.isDialogUnread(dialog);
        // Same branching as `DialogsContextMenu.onUnreadClick` — keeps mono-forum, thread and
        // regular dialogs behaving consistently with the rest of the app.
        if(options.monoforumThreadId) {
          managers.appMessagesManager.markDialogUnread({
            peerId: options.peerId,
            monoforumThreadId: options.monoforumThreadId,
            read: isUnread
          });
        } else if(isUnread) {
          if(!options.threadId) {
            managers.appMessagesManager.markDialogUnread({peerId: options.peerId, read: true});
          } else {
            const topMessage = (dialog as any).top_message;
            if(topMessage) {
              managers.appMessagesManager.readHistory({peerId: options.peerId, maxId: topMessage, threadId: options.threadId});
            }
          }
        } else if(!options.threadId) {
          managers.appMessagesManager.markDialogUnread({peerId: options.peerId});
        }
      }, {listenerSetter});
    }

    function getDialog() {
      return managers.dialogsStorage.getAnyDialog(
        options.peerId,
        (options.threadId || options.monoforumThreadId) ?? undefined
      );
    }

    return (
      <div class="chat-preview-wrapper">
        <div class="chat-preview-bg">
          <ChatBackground
            theme={resolvedBg().theme}
            wallPaper={resolvedBg().wallPaper}
            // `auto` => first render with the cached global theme is instant (no flicker on
            // open), and the second render — once `useFullPeer` delivers the peer's custom
            // wallpaper — fades in over 200ms instead of snapping in a single frame.
            transition="auto"
            width={PREVIEW_W}
            height={PREVIEW_H}
            onHighlightColor={(hsla) => {
              if(chat?.container) {
                themeController.applyHighlightingColor({hsla, element: chat.container});
              }
            }}
          />
        </div>
        {chat.container}
      </div>
    );
  }

  createPopup(() => (
    <PopupElement
      class="popup-chat-preview"
      withoutOverlay
      show={show()}
      kind={CHAT_PREVIEW_POPUP_KIND}
      containerProps={{ref: (el: HTMLDivElement) => containerEl = el}}
      onClose={() => chatRef?.beforeDestroy()}
    >
      <Inner />
    </PopupElement>
  ));
}
