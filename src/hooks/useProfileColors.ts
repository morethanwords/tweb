import {Accessor, Signal, createEffect, createMemo, createSignal} from 'solid-js';
import {HelpPeerColorOption, HelpPeerColorSet, User} from '@layer';
import {usePeer} from '@stores/peers';
import useIsNightTheme from '@hooks/useIsNightTheme';

let signal: Signal<HelpPeerColorOption[]>;
export default function useProfileColors() {
  return signal ??= createSignal<HelpPeerColorOption[]>();
}

export function usePeerProfileAppearance(peerId: PeerId): Accessor<{
  bgColors?: number[]
  backgroundEmojiId?: Long
  // * the colours spread from the avatar out, the first in its middle, rather than top to bottom
  radial?: boolean
}> {
  const [colorOptions] = useProfileColors();
  const isNightTheme = useIsNightTheme();
  const peer = usePeer(() => peerId);

  return createMemo(() => {
    const _peer = peer();

    const emojiStatus = (_peer as User.user)?.emoji_status
    if(emojiStatus?._ === 'emojiStatusCollectible') {
      return {
        bgColors: [emojiStatus.center_color, emojiStatus.edge_color],
        backgroundEmojiId: emojiStatus.pattern_document_id,
        radial: true
      }
    }

    const profileColor = (_peer as User.user)?.profile_color;
    if(profileColor?._ !== 'peerColor') {
      return {};
    }

    const colorOption = colorOptions()?.find((colorOption) => colorOption.color_id === profileColor.color);
    const colorSet = (isNightTheme() && colorOption?.dark_colors ? colorOption.dark_colors : colorOption?.colors) as HelpPeerColorSet.helpPeerColorProfileSet
    return {
      bgColors: colorSet?.bg_colors,
      backgroundEmojiId: profileColor.background_emoji_id
    }
  });
}
