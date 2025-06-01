import {JSX, onMount} from 'solid-js';
import {ChatBackground} from './chatBackground';
import rootScope from '../../../lib/rootScope';
import themeController from '../../../helpers/themeController';

import classNames from '../../../helpers/string/classNames';
import styles from './fakeBubbles.module.scss';
import {subscribeOn} from '../../../helpers/solid/subscribeOn';

export function FakeBubbles(props: {
  children: JSX.Element
  class?: string
  contentClass?: string
  peerId?: PeerId
}) {
  let container!: HTMLDivElement;

  onMount(() => {
    themeController.applyTheme(themeController.getTheme(), container);
    subscribeOn(rootScope)('theme_changed', () => {
      themeController.applyTheme(themeController.getTheme(), container);
    })
  })

  return (
    <div ref={container} class={classNames(styles.root, props.class)}>
      <ChatBackground
        managers={rootScope.managers}
        themeController={themeController}
        peerId={props.peerId}
        onHighlightColor={hsla => themeController.applyHighlightingColor({hsla, element: container})}
      />
      <div class={classNames(styles.content, props.contentClass)}>
        {props.children}
      </div>
    </div>
  )
}
