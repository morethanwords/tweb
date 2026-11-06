import {createEffect, JSX, on, onCleanup} from 'solid-js';
import {UserFull, WallPaper} from '@layer';
import {i18n} from '@lib/langPack';
import themeController from '@helpers/themeController';
import useBaseTheme from '@hooks/useBaseTheme';
import classNames from '@helpers/string/classNames';
import {useFullPeer} from '@stores/fullPeers';
import {PremiumGiftBubble} from '@components/chat/bubbles/premiumGift';
import {isSameWallPaper} from '@components/chat/chatTheme';
import styles from '@components/chat/bubbles/chatWallPaper.module.scss';

const THUMB_SIZE = 100;

/**
 * A wallpaper set for a chat: its round thumbnail with the service text under it, and in a private
 * chat, for one the other side set, a way to see it — or to take one's own back when it was set for
 * both — as tdesktop's ThemeDocumentBox shows it.
 */
export function ChatWallPaperBubble(props: {
  peerId: PeerId,
  wallPaper: WallPaper,
  forBoth: boolean,
  isOut: boolean,
  text: JSX.Element,
  actions?: {
    onView: () => void,
    onRemove: () => void,
    onOwnClick: () => void
  }
}) {
  const fullPeer = useFullPeer(props.peerId);
  // * the other side's wallpaper for both is still the chat's, and stands over this side's own
  const isRemovable = () => {
    const userFull = fullPeer() as UserFull.userFull;
    return props.forBoth &&
      !!userFull?.pFlags?.wallpaper_overridden &&
      !!userFull.wallpaper &&
      isSameWallPaper(userFull.wallpaper, props.wallPaper);
  };

  const {actions} = props;
  const onClick = actions && (() => props.isOut ? actions.onOwnClick() : isRemovable() ? actions.onRemove() : actions.onView());

  // * drawn for the app's theme, and again when it turns to another — as tdesktop does
  const baseTheme = useBaseTheme();

  type Thumbnail = ReturnType<typeof themeController.AppBackgroundTab.addWallPaper>;
  const drop = (thumbnail: Thumbnail) => {
    thumbnail.dispose();
    thumbnail.container.remove();
  };

  let thumb!: HTMLDivElement;
  let shown: Thumbnail;
  createEffect(on(baseTheme, (base) => {
    // * reached through the theme controller, which keeps the chat clear of the settings tab's imports
    const next = themeController.AppBackgroundTab.addWallPaper(props.wallPaper, undefined, base, {width: THUMB_SIZE, height: THUMB_SIZE});
    if(!next) return;

    // * the one drawn before stays until this one is drawn over it
    let dropped = false;
    next.container.classList.toggle(styles.drawing, !!shown);
    thumb.append(next.container);
    next.loadPromise.then(() => {
      if(dropped) return;
      next.container.classList.remove(styles.drawing);
      if(shown) drop(shown);
      shown = next;
    });

    // * turned again before it was drawn
    onCleanup(() => {
      if(next === shown) return;
      dropped = true;
      drop(next);
    });
  }));

  onCleanup(() => shown && drop(shown));

  return (
    <PremiumGiftBubble
      media={<div ref={thumb} class={classNames(styles.thumb, onClick && styles.clickable)} aria-hidden="true" onClick={onClick} />}
      subtitle={props.text}
      buttonText={props.isOut || !actions ? undefined : i18n(isRemovable() ? 'Remove' : 'ViewWallpaperAction')}
      buttonCallback={onClick}
    />
  );
}
