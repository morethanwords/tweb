import {JSX} from 'solid-js';
import {ChatBackground} from './chatBackground';
import rootScope from '../../../lib/rootScope';
import themeController from '../../../helpers/themeController';

import classNames from '../../../helpers/string/classNames';
import styles from './fakeBubbles.module.scss';

export function FakeBubbles(props: {
  children: JSX.Element
  class?: string
  peerId?: PeerId
}) {
  let container!: HTMLDivElement;

  return (
    <div ref={container} class={classNames(styles.root, props.class)}>
      <ChatBackground
        managers={rootScope.managers}
        themeController={themeController}
        peerId={props.peerId}
        onHighlightColor={hsla => themeController.applyHighlightingColor({hsla, element: container})}
      />
      <div class={/* @once */ styles.content}>
        {props.children}
      </div>
    </div>
  )
}
