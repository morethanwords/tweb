import {Component, Show} from 'solid-js';

import {useLockScreenHotReloadGuard} from '../../lib/solidjs/hotReloadGuard';
import {ScreenSize} from '../../helpers/mediaSizes';

import ChatBackgroundGradientRenderer from '../chat/gradientRenderer';

import useScreenSize from '../../hooks/useScreenSize';
import {ChatBackground} from '../chat/bubbles/chatBackground';


const Background: Component<{
  gradientRendererRef: (value: ChatBackgroundGradientRenderer | undefined) => void
}> = (props) => {
  const {themeController, rootScope} = useLockScreenHotReloadGuard();

  const screenSize = useScreenSize();

  return (
    <Show when={screenSize() !== ScreenSize.mobile}>
      <ChatBackground
        themeController={themeController}
        managers={rootScope.managers}
        gradientRendererRef={props.gradientRendererRef}
      />
    </Show>
  );
};

export default Background;
