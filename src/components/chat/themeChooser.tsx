import {createEffect, createMemo, createRoot, createSignal, onCleanup} from 'solid-js';
import {render} from 'solid-js/web';
import {unwrap} from 'solid-js/store';
import {ChatTheme, StarGift, UserFull} from '@layer';
import type Chat from '@components/chat/chat';
import ChatThemesPicker, {ChatThemesPickerItem} from '@components/chatThemesPicker';
import {ButtonIconTsx} from '@components/buttonIconTsx';
import Button from '@components/buttonTsx';
import ChatInputPlate, {CHAT_INPUT_PLATE_SINGLE_CLASS} from '@components/chat/controlPlate';
import classNames from '@helpers/string/classNames';
import confirmationPopup from '@components/confirmationPopup';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import {toastNew} from '@components/toast';
import appNavigationController, {NavigationItem} from '@components/appNavigationController';
import {getChatThemeKey, getThemeFromChatTheme} from '@components/chat/chatTheme';
import type {MyDocument} from '@appManagers/appDocsManager';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import getUniqueGiftAttributes from '@appManagers/utils/gifts/getUniqueGiftAttributes';
import focusInput from '@helpers/dom/focusInput';
import liteMode from '@helpers/liteMode';
import {CROSS_FADE_KEYFRAMES} from '@helpers/dom/crossfadeContent';
import {EASING_Y} from '@components/chat/bubbleShape';
import {KEYBOARD_DURATION, KEYBOARD_FADE_IN} from '@components/chat/replyKeyboard';
import {appState} from '@stores/appState';
import I18n, {i18n} from '@lib/langPack';
import Modes from '@config/modes';
import noop from '@helpers/noop';
import styles from '@components/chat/themeChooser.module.scss';

// * how long the preview may stand in for an applied theme the chat has not received yet
const APPLY_SYNC_TIMEOUT = 3000;
// * how long the panel may wait for its strip to be drawn before it comes without it
const SHOW_TIMEOUT = 400;

type Tile = ChatThemesPickerItem & {chatTheme?: ChatTheme};

// * a picker that applied a theme and still stands in for it, by chat — a new one takes over from it
const appliedPreviews: WeakMap<Chat, () => void> = new WeakMap();
// * a picker on its way down, by chat — gone at once when a new one comes
const leavingPanels: WeakMap<Chat, () => void> = new WeakMap();

function ThemeChooser(props: {
  chat: Chat,
  onApplied: (key: string) => void,
  onClose: () => void,
  // * its strip is drawn
  onReady: (strip: HTMLElement) => void
}) {
  const {chat} = props;
  // * the chat's own, tied to its account
  const {peerId, managers} = chat;
  const currentChatTheme = () => (chat.fullPeer() as UserFull.userFull)?.theme;
  const currentKey = createMemo(() => getChatThemeKey(currentChatTheme()));
  // * the chat's own theme stays picked until another one is — the full peer may still be on its way
  const [pickedKey, setPickedKey] = createSignal<string>();
  const chosenKey = () => pickedKey() ?? currentKey();

  const [giftThemes, setGiftThemes] = createSignal<ChatTheme.chatThemeUniqueGift[]>();
  const [hasMoreGifts, setHasMoreGifts] = createSignal(false);
  let loadingGifts = false;
  const loadGiftThemes = (more?: boolean) => {
    if(loadingGifts) return;
    loadingGifts = true;
    managers.appThemesManager.getUniqueGiftChatThemes(more).then(({themes, hasMore}) => {
      setGiftThemes(themes);
      setHasMoreGifts(hasMore);
    }, () => {
      setGiftThemes((themes) => themes || []);
      setHasMoreGifts(false);
    }).finally(() => {
      loadingGifts = false;
    });
  };
  loadGiftThemes();

  const tiles = createMemo<Tile[]>(() => {
    const gifts = giftThemes();
    if(!gifts) {
      return;
    }

    const result: Tile[] = [{id: '', label: 'ChatNoTheme', emoticon: '❌'}];
    const add = (chatTheme: ChatTheme) => {
      const id = getChatThemeKey(chatTheme);
      const theme = getThemeFromChatTheme(chatTheme);
      if(!theme || result.some((tile) => tile.id === id)) {
        return;
      }

      const tile: Tile = {id, theme, chatTheme};
      if(chatTheme._ === 'chatThemeUniqueGift') {
        // * the list knows best which chat the gift is in use in; the chat's own theme has the rest
        const gift = (gifts.find((giftTheme) => getChatThemeKey(giftTheme) === id) ?? unwrap(chatTheme)).gift as StarGift.starGiftUnique;
        tile.sticker = getUniqueGiftAttributes(gift).model?.document as MyDocument;
        tile.takenBy = getPeerId(gift.theme_peer) || undefined;
      }

      result.push(tile);
    };

    // * the theme in use keeps its place at the front
    const currentTheme = currentChatTheme();
    if(currentTheme) {
      add(currentTheme);
    }

    gifts.forEach(add);
    appState.accountThemes.themes?.forEach((theme) => {
      if(theme.emoticon) {
        add({_: 'chatTheme', emoticon: theme.emoticon});
      }
    });

    return result;
  });

  const lastGiftId = () => {
    const gifts = giftThemes();
    return hasMoreGifts() && gifts?.length ? getChatThemeKey(gifts[gifts.length - 1]) : undefined;
  };

  const select = (tile: Tile) => {
    setPickedKey(tile.id);
    // * the chat shows the theme it is pointed at, and its own once pointed back
    chat.themeOverride[1](tile.id === currentKey() ? undefined : {theme: tile.theme});
  };

  const apply = async() => {
    const key = chosenKey();
    const tile = tiles()?.find((tile) => tile.id === key);
    if(!tile || key === currentKey()) {
      return;
    }

    const takenBy = tile.takenBy;
    if(takenBy && takenBy !== peerId) {
      try {
        await confirmationPopup({
          descriptionLangKey: 'GiftThemesSetInReuseInfo',
          descriptionLangArgs: [await wrapPeerTitle({peerId: takenBy, onlyFirstName: true})],
          button: {langKey: 'Yes'}
        });
      } catch(err) {
        return;
      }

      // * the chat was left while it asked
      if(disposed) {
        return;
      }
    }

    managers.appThemesManager.setChatTheme(peerId, tile.chatTheme).catch(() => {
      toastNew({langPackKey: 'Error.AnError'});
    });
    props.onApplied(key);
  };

  let disposed = false;
  onCleanup(() => disposed = true);

  // * pointed at the theme the chat has: the button picks a wallpaper for it instead, as in tdesktop
  const isThemeInUse = () => chosenKey() === currentKey();
  const changeWallPaper = async() => {
    // * only while this panel is up: it may close, or the chat move on, while the picker gets ready
    const chooser = chat.themeChooser;
    const isUp = () => !disposed && !!chooser && chat.themeChooser === chooser;
    const {default: showChatWallPaperPopup} = await import('@components/popups/chatWallPaper');
    if(!isUp()) return;
    showChatWallPaperPopup({peerId, managers, onApplied: props.onClose, middleware: isUp});
  };

  let strip: HTMLElement;
  // * keyboard users land on the strip, on the theme in use
  const focusStrip = () => {
    if(!Modes.a11y) return;
    // * a frame later: the picker grid makes the tiles focusable once they are in the DOM
    requestAnimationFrame(() => {
      const tile = strip.querySelector<HTMLElement>('.theme-container.active') ?? strip.querySelector<HTMLElement>('.theme-container');
      tile?.focus({preventScroll: true});
    });
  };

  const titleId = 'chat-theme-chooser-title-' + peerId;
  return (
    <div class={styles.plate} role="region" aria-labelledby={titleId}>
      <div class={styles.sheet}>
        <div class={styles.header}>
          <div id={titleId} class={styles.title}>{i18n('SelectTheme')}</div>
          <ButtonIconTsx
            class={styles.close}
            icon="close"
            aria-label={I18n.format('Close', true)}
            onClick={props.onClose}
          />
        </div>
        <ChatThemesPicker
          ref={(el) => strip = el}
          class={styles.strip}
          items={tiles}
          selectedId={chosenKey}
          blendTinted={false}
          loadMoreAfter={lastGiftId}
          onLoadMore={() => loadGiftThemes(true)}
          onSelect={(theme, tile) => select(tile)}
          shownWhenReady
          onReady={() => {
            props.onReady(strip);
            focusStrip();
          }}
        />
        {/* * the button the composer has when it has one alone (`ChatInput.makeControlButton`) */}
        <ChatInputPlate
          class={classNames(CHAT_INPUT_PLATE_SINGLE_CLASS, styles.apply)}
          center={
            <Button
              class="btn-primary btn-transparent text-bold chat-input-plate-button"
              onClick={() => isThemeInUse() ? changeWallPaper() : apply()}
            >
              {isThemeInUse() ? i18n('ChatChangeWallpaper') : i18n('ChatApplyTheme')}
            </Button>
          }
        />
      </div>
    </div>
  );
}

// * what goes fades out quicker than what comes fades in
const CONTENT_FADE_OUT = 120;

/**
 * The composer turns into the picker, or the picker back into it (`opening` false), as one plate: with full
 * animations (`motion`) the picker's sheet comes up out of the composer's bar, or goes back down into it, in the
 * keyboard's time and curve, its edge going with the history (`Chat.setBottomPanelHeight`), cut by the picker's box
 * below and showing what is on it where it stands; the composer fades out over it, or in. Only the compositor moves
 * it (a `clip-path` would be moved by the main thread, which the tiles' stickers and patterns keep busy as they come).
 * At the reduced level the two fade into each other where they stand. The composer stays where it stood meanwhile,
 * over the picker.
 */
function swapWithComposer(chat: Chat, container: HTMLElement, opening: boolean, motion: boolean) {
  const {chatInput, inputContainer: composer, rowsWrapper} = chat.input;
  const plate = container.firstElementChild as HTMLElement;
  const wasInert = composer.inert;
  // * it would have lost it as it went at once
  const {activeElement} = composer.ownerDocument;
  if(opening && composer.contains(activeElement)) (activeElement as HTMLElement).blur();
  chatInput.classList.add('is-swapping-theme-chooser');
  if(Modes.a11y) composer.inert = true;

  const animations: Animation[] = [];
  // * going, the composer is gone before the edge is far from it; coming, it is whole by the time the sheet is in;
  // * where nothing moves, what fades as a whole stays so until the one coming is nearly in
  const fade = (element: Element, coming: boolean) => animations.push(element.animate(
    coming ? CROSS_FADE_KEYFRAMES : [{opacity: 1}, {opacity: 0}],
    coming ?
      {duration: KEYBOARD_FADE_IN, delay: motion ? KEYBOARD_DURATION - KEYBOARD_FADE_IN : 0, fill: 'both'} :
      {duration: CONTENT_FADE_OUT, delay: motion ? 0 : KEYBOARD_FADE_IN - CONTENT_FADE_OUT, easing: 'ease-out', fill: 'both'}
  ));
  fade(composer, !opening);

  if(motion) {
    const sheet = plate.firstElementChild as HTMLElement;
    const rise = rowsWrapper.getBoundingClientRect().top - plate.getBoundingClientRect().top;
    const move = (element: Element, distance: number) => animations.push(element.animate(
      opening ? [{translate: `0 ${distance}px`}, {translate: '0 0'}] : [{translate: '0 0'}, {translate: `0 ${distance}px`}],
      {duration: KEYBOARD_DURATION, easing: EASING_Y, fill: 'both'}
    ));
    container.classList.add(styles.swapping);
    move(sheet, rise);
    for(const child of sheet.children) move(child, -rise);
  } else {
    fade(container, opening);
  }

  let ended = false;
  return {
    finished: Promise.all(animations.map((animation) => animation.finished)).then(noop, noop),
    end: () => {
      if(ended) return;
      ended = true;
      animations.forEach((animation) => animation.cancel());
      container.classList.remove(styles.swapping);
      chatInput.classList.remove('is-swapping-theme-chooser');
      if(Modes.a11y) composer.inert = wasInert;
    }
  };
}

/**
 * The panel a private chat picks its theme on, in place of the composer, as in tdesktop: the
 * chat previews the theme pointed at, and keeps it only once applied.
 */
export function openChatThemeChooser(chat: Chat) {
  appliedPreviews.get(chat)?.();
  leavingPanels.get(chat)?.();

  const {chatInput} = chat.input;
  // * grows out of the composer and goes back into it (`swapWithComposer`), the history with it in the bot keyboard's
  // * time and curve (`Chat.setBottomPanelHeight`); the two fade into each other at the reduced level
  const canAnimate = (level: 'motion' | 'animations') => liteMode.isAvailable(level) &&
    chatInput.isConnected &&
    chatInput.ownerDocument.visibilityState !== 'hidden';

  // * built out of sight, and shown once its strip is drawn, to come with what is on it (`show`)
  const container = document.createElement('div');
  container.classList.add(styles.container, styles.pending);
  chatInput.append(container);

  // * lives until the chat stops previewing — through a peer change at the latest
  const middlewareHelper = chat.middlewareHelper.get().create();
  const middleware = middlewareHelper.get();
  const handle = {close: () => close()};
  const navigationItem: NavigationItem = {
    type: 'theme-chooser',
    onPop: () => {
      close();
    },
    // * focus goes back to the composer instead
    noBlurOnPop: true,
    // * the chat's own entry, pushed once it is shown, goes under it (`AppImManager.selectTab`)
    context: chat
  };
  let disposeSync: () => void;
  let shown = false, hidden = false;
  // * not kept waiting for its strip long: it comes with what it has by then
  const showTimeout = window.setTimeout(() => show(), SHOW_TIMEOUT);
  // * the composer turning into it or back
  let swap: ReturnType<typeof swapWithComposer>;

  let panelHeight: number;
  const resizeObserver = new ResizeObserver(() => {
    const height = container.offsetHeight;
    if(hidden || height === panelHeight) return;
    panelHeight = height;
    chat.setBottomPanelHeight(height);
  });

  // * a peer change takes it away at once; its own close button, Escape or an applied theme lets it go down
  const hide = (animate?: boolean) => {
    if(hidden) return;
    hidden = true;
    clearTimeout(showTimeout);
    const hadFocus = container.contains(container.ownerDocument.activeElement);
    resizeObserver.disconnect();
    appNavigationController.removeItem(navigationItem);
    if(chat.themeChooser === handle) chat.themeChooser = undefined;
    // * still coming: it goes from where it would have come to
    swap?.end();

    const motion = animate && canAnimate('motion');
    chat.setBottomPanelHeight(undefined, motion ? KEYBOARD_DURATION : undefined);
    const remove = () => {
      if(leavingPanels.get(chat) === remove) leavingPanels.delete(chat);
      swap?.end();
      disposeRender();
      container.remove();
      // * another picker may be up by now
      if(!chat.themeChooser) {
        chatInput.classList.remove('is-choosing-theme');
        // * closed, the bot's keyboard is back - but not on the way to another peer, whose keyboard it is not
        if(animate && shown) chat.input.onThemeChooserChange(false);
      }
      if(Modes.a11y && hadFocus) focusInput(chat.input.messageInput);
    };

    if(!animate || !shown || !canAnimate('animations')) {
      remove();
      return;
    }

    container.style.pointerEvents = 'none';
    if(Modes.a11y) container.inert = true;
    leavingPanels.set(chat, remove);
    swap = swapWithComposer(chat, container, false, motion);
    swap.finished.then(() => {
      if(leavingPanels.get(chat) === remove) remove();
    });
  };

  const finish = () => middlewareHelper.destroy();
  middleware.onClean(() => {
    hide();
    disposeSync?.();
    if(appliedPreviews.get(chat) === finish) appliedPreviews.delete(chat);
    chat.themeOverride[1](undefined);
  });

  const close = (appliedKey?: string) => {
    hide(true);
    if(appliedKey === undefined || !middleware()) {
      finish();
      return;
    }

    // * an applied theme reaches the chat a moment later — the preview stands in for it until then
    appliedPreviews.set(chat, finish);
    createRoot((dispose) => {
      disposeSync = dispose;
      const release = () => queueMicrotask(finish);
      const timeout = window.setTimeout(release, APPLY_SYNC_TIMEOUT);
      onCleanup(() => clearTimeout(timeout));
      createEffect(() => {
        if(getChatThemeKey((chat.fullPeer() as UserFull.userFull)?.theme) === appliedKey) {
          release();
        }
      });
    });
  };

  const show = () => {
    if(shown || hidden) return;
    shown = true;
    clearTimeout(showTimeout);
    container.classList.remove(styles.pending);
    chatInput.classList.add('is-choosing-theme');
    const keyboardWasOpen = chat.input.onThemeChooserChange(true);
    // * the composer stays on screen to turn into it: hidden for the measure below, it would come back with its
    // * button's icons playing their way in from the start
    const swapping = !keyboardWasOpen && canAnimate('animations');
    if(swapping) chatInput.classList.add('is-swapping-theme-chooser');

    // * measured once as it opens, the composer's room handed over in one go; in place of the composer and a bot's
    // * keyboard both it fades in where it stands, about as tall as they were
    panelHeight = container.offsetHeight;
    const motion = swapping && canAnimate('motion');
    chat.setBottomPanelHeight(panelHeight, motion ? KEYBOARD_DURATION : undefined);
    if(swapping) {
      const opening = swap = swapWithComposer(chat, container, true, motion);
      opening.finished.then(() => {
        if(swap === opening) opening.end();
      });
    } else if(keyboardWasOpen && canAnimate('animations')) {
      container.animate(CROSS_FADE_KEYFRAMES, {duration: KEYBOARD_FADE_IN});
    }

    resizeObserver.observe(container);
  };

  const disposeRender = render(() => (
    <ThemeChooser
      chat={chat}
      onApplied={close}
      onClose={() => close()}
      onReady={(strip) => {
        if(!shown) show();
        // * drawn after the panel came without it: its tiles fade in on it
        else if(canAnimate('animations')) strip.animate(CROSS_FADE_KEYFRAMES, {duration: KEYBOARD_FADE_IN});
      }}
    />
  ), container);

  appNavigationController.pushItem(navigationItem);

  return chat.themeChooser = handle;
}
