import {createSignal, onCleanup, Show} from 'solid-js';
import {unwrap} from 'solid-js/store';
import {UserFull, WallPaper} from '@layer';
import PopupElement, {createPopup, usePopupContext} from '@components/popups/indexTsx';
import showChatWallPaperPreviewPopup, {discardPickedWallPaper} from '@components/popups/chatWallPaperPreview';
import {AppBackgroundTab, buildFromWallPapers, createWallPaperGrid, getWallPaperKey} from '@components/sidebarLeft/tabs/background';
import {getChatBackgroundFromFullPeer, isSameWallPaper} from '@components/chat/chatTheme';
import confirmationPopup from '@components/confirmationPopup';
import Section from '@components/section';
import Button from '@components/buttonTsx';
import {toastNew} from '@components/toast';
import ChatBackgroundStore from '@lib/chatBackgroundStore';
import {DEFAULT_BACKGROUND_SLUG} from '@config/app';
import themeController from '@helpers/themeController';
import ListenerSetter from '@helpers/listenerSetter';
import I18n from '@lib/langPack';
import rootScope from '@lib/rootScope';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import {getManagersSession, isSessionLeaving} from '@lib/accounts/getCurrentAccount';
import type {AppManagers} from '@lib/managers';
import styles from '@components/popups/chatWallPaper.module.scss';

/**
 * Drops the chat's wallpaper once confirmed — or with `revert`, the one the other side set for both,
 * putting this side's own back. False when it was not confirmed.
 */
export async function resetChatWallPaper(peerId: PeerId, managers: AppManagers, options: {revert?: boolean} = {}) {
  try {
    await confirmationPopup({
      descriptionLangKey: 'RemoveWallpaperMessage',
      button: {langKey: 'Reset', isDanger: true}
    });
  } catch(err) {
    return false;
  }

  managers.appThemesManager.setChatWallPaper(peerId, options).catch(() => {
    toastNew({langPackKey: 'Error.AnError'});
  });
  return true;
}

function Picker(props: {peerId: PeerId, fullPeer: UserFull.userFull, managers: AppManagers, onApplied?: () => void}) {
  const context = usePopupContext();
  const {peerId, managers} = props;
  const listenerSetter = new ListenerSetter();
  const finish = () => {
    context.hide();
    props.onApplied?.();
  };

  // * what the chat had when the picker opened decides the first tiles
  const own = props.fullPeer?.wallpaper;
  const {theme} = getChatBackgroundFromFullPeer(props.fullPeer);
  // * dropping the chat's wallpaper leaves what the chat is drawn on under its theme, or the app's — tdesktop's
  // * reset tile
  const resetPaper = unwrap(themeController.getThemeWallpaper(theme ?? themeController.getTheme()));

  // * the chat's own is the reset one set up another way (other colours, blur, dimming): a tile of its own, which
  // * Reset drops — tdesktop tells them apart by id alone, and its Reset then does nothing
  const ownVariesReset = !!own && !!resetPaper &&
    getWallPaperKey(own) === getWallPaperKey(resetPaper) &&
    !isSameWallPaper(own, resetPaper);

  let resetTile: HTMLElement;
  const onReset = async() => {
    // * nothing of its own to drop: as tdesktop, just closes
    if(!own || (resetPaper && isSameWallPaper(own, resetPaper))) {
      context.hide();
      return;
    }

    if(await resetChatWallPaper(peerId, managers)) {
      finish();
    }
  };

  const preview = (wallPaper: WallPaper, upload?: boolean) => {
    showChatWallPaperPreviewPopup({peerId, wallPaper, upload, managers, onApplied: finish});
  };

  const wallPaperGrid = createWallPaperGrid({
    listenerSetter,
    onClick: (wallPaper, tile) => tile === resetTile ? onReset() : preview(wallPaper)
  });

  const [loaded, setLoaded] = createSignal(false);
  buildFromWallPapers((wallPapers) => {
    const keys = new Set<string>();
    const add = (wallPaper: WallPaper, label?: string) => {
      const key = wallPaper && getWallPaperKey(wallPaper);
      if(!wallPaper || keys.has(key)) return;
      keys.add(key);
      return wallPaperGrid.add(wallPaper, true, label);
    };

    resetTile = resetPaper && add(resetPaper, I18n.format('Reset', true))?.container;
    // * the tile added last holds the id's place in the grid, the one marked below
    if(ownVariesReset) keys.delete(getWallPaperKey(own));
    if(own) add(own);
    wallPapers.forEach((wallPaper) => {
      if((wallPaper as WallPaper.wallPaper).slug !== DEFAULT_BACKGROUND_SLUG) add(wallPaper);
    });

    const active = own ?? resetPaper;
    if(active) wallPaperGrid.setActive(getWallPaperKey(active));
    setLoaded(true);
  });

  let disposed = false;
  const onUploadClick = () => {
    AppBackgroundTab.pickWallPaperFile(managers).then((picked) => {
      if(!picked) return;
      // * the picker gone meanwhile (closed, the tab on another account): the image is for nothing now
      if(disposed) discardPickedWallPaper(picked.wallPaper, managers);
      else preview(picked.wallPaper, true);
    });
  };

  onCleanup(() => {
    disposed = true;
    listenerSetter.removeAll();
    wallPaperGrid.destroy();
  });

  return (
    <>
      <Section noShadow>
        <Button
          class="btn-primary btn-transparent"
          icon="cameraadd"
          text="ChatBackground.UploadWallpaper"
          onClick={onUploadClick}
        />
      </Section>
      <Show when={loaded()}>
        <div class={`${styles.grid} background-container`}>
          {wallPaperGrid.grid}
        </div>
      </Show>
    </>
  );
}

/**
 * The wallpapers a private chat can take, tdesktop's BackgroundBox for one chat: its reset tile
 * first, the one in use marked, a picked image or a tile previewed before it is applied.
 */
export default async function showChatWallPaperPopup(options: {
  peerId: PeerId,
  managers?: AppManagers,
  onApplied?: () => void,
  // * whether what asked for it still wants it once the list is there: a panel may have closed, a chat moved on
  middleware?: () => boolean
}) {
  // * the account it is asked on, or the opener's: it does not open once the tab is on another
  const managers = bindManagersToSession(options.managers || rootScope.managers);
  // * a chat's managers are its account's for good: whose screen it is, is the session it was asked on
  const session = getManagersSession(managers);
  // * the list and the chat's full peer first: with them at hand the grid is built with the popup, which opens as tall
  // * as it stays, with the chat's own wallpaper and its theme's
  const wallPapersPromise = ChatBackgroundStore.getCachedWallPapers() ?
    undefined :
    managers.appThemesManager.getWallPapers().catch((): WallPaper[] => undefined);
  const fullPeer = await managers.appProfileManager.getProfileByPeerId(options.peerId).catch((): UserFull => undefined);
  const wallPapers = await wallPapersPromise;
  // * the list is cached as the account shown now's: not once the tab is on another
  if(isSessionLeaving(session)) {
    return;
  }

  if(wallPapers) ChatBackgroundStore.setCachedWallPapers(wallPapers);
  if(options.middleware && !options.middleware()) {
    return;
  }

  createPopup(() => (
    <PopupElement class={styles.popup} managers={managers} closable>
      <PopupElement.Header>
        <PopupElement.CloseButton />
        <PopupElement.Title title="ChatBackground" />
      </PopupElement.Header>
      <PopupElement.Body>
        <PopupElement.Scrollable>
          <Picker {...options} fullPeer={fullPeer as UserFull.userFull} managers={managers} />
        </PopupElement.Scrollable>
      </PopupElement.Body>
    </PopupElement>
  ));
}
