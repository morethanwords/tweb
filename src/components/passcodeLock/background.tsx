import {Component, Show} from 'solid-js';

import {useLockScreenHotReloadGuard} from '../../lib/solidjs/hotReloadGuard';
import {ScreenSize, useMediaSizes} from '../../helpers/mediaSizes';

import ChatBackgroundGradientRenderer from '../chat/gradientRenderer';

import {ChatBackground} from '../chat/bubbles/chatBackground';


const Background: Component<{
  gradientRendererRef: (value: ChatBackgroundGradientRenderer | undefined) => void
}> = (props) => {
  const {themeController, rootScope} = useLockScreenHotReloadGuard();

  const mediaSizes = useMediaSizes();

  return (
    <Show when={mediaSizes.activeScreen !== ScreenSize.mobile}>
      <ChatBackground
        themeController={themeController}
        managers={rootScope.managers}
        gradientRendererRef={props.gradientRendererRef}
      />
    </Show>
  );
};

export default Background;
