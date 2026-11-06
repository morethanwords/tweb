import {createEffect, JSX, on, onMount} from 'solid-js';
import {WallPaper} from '@layer';
import {ChatBackground, ChatBackgroundTheme} from '@components/chat/bubbles/chatBackground';
import rootScope from '@lib/rootScope';
import themeController from '@helpers/themeController';

import classNames from '@helpers/string/classNames';
import styles from '@components/chat/bubbles/fakeBubbles.module.scss';
import {subscribeOn} from '@helpers/solid/subscribeOn';

export function FakeBubbles(props: {
  children: JSX.Element
  class?: string
  contentClass?: string
  peerId?: PeerId
  // * shown instead of the peer's or the app's own: the colours from the theme, the background
  // * from the wallpaper (or the theme's own)
  theme?: ChatBackgroundTheme
  wallPaper?: WallPaper
}) {
  let container!: HTMLDivElement;

  const applyTheme = () => themeController.applyTheme(props.theme ?? themeController.getTheme(), container);
  onMount(() => {
    subscribeOn(rootScope)('theme_changed', applyTheme);
    createEffect(on(() => props.theme, applyTheme));
  });

  return (
    <div ref={container} class={classNames(styles.root, props.class)}>
      <ChatBackground
        managers={rootScope.managers}
        themeController={themeController}
        peerId={props.peerId}
        theme={props.theme}
        wallPaper={props.wallPaper}
        onHighlightColor={hsla => themeController.applyHighlightingColor({hsla, element: container})}
      />
      <div class={classNames(styles.content, props.contentClass)}>
        {props.children}
      </div>
    </div>
  )
}
