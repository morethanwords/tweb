import {Signal, createEffect, createSignal} from 'solid-js';
import {HelpPeerColorOption, HelpPeerColorSet, User} from '../layer';
import {usePeer} from '../stores/peers';
import useIsNightTheme from './useIsNightTheme';

let signal: Signal<HelpPeerColorOption[]>;
export default function useProfileColors() {
  return signal ??= createSignal<HelpPeerColorOption[]>();
}

export function usePeerProfileAppearance(peerId: PeerId) {
  const [colorSet, setColorSet] = createSignal<HelpPeerColorSet.helpPeerColorProfileSet>();
  const [backgroundEmojiId, setBackgroundEmojiId] = createSignal<DocId>();
  const [colorOptions] = useProfileColors();
  const isNightTheme = useIsNightTheme();
  const peer = usePeer(() => peerId);

  createEffect(() => {
    const _peer = peer();
    const profileColor = (_peer as User.user)?.profile_color;
    if(!profileColor) {
      setColorSet();
      setBackgroundEmojiId();
      return;
    }

    const colorOption = colorOptions()?.find((colorOption) => colorOption.color_id === profileColor.color);
    setColorSet((isNightTheme() && colorOption?.dark_colors ? colorOption.dark_colors : colorOption?.colors) as HelpPeerColorSet.helpPeerColorProfileSet);
    setBackgroundEmojiId(profileColor.background_emoji_id);
  });

  return {colorSet, backgroundEmojiId};
}
