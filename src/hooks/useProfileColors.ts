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
}> {
  const [colorOptions] = useProfileColors();
  const isNightTheme = useIsNightTheme();
  const peer = usePeer(() => peerId);

  return createMemo(() => {
    const _peer = peer();

    const emojiStatus = (_peer as User.user)?.emoji_status
    if(emojiStatus?._ === 'emojiStatusCollectible') {
      return {
        bgColors: [emojiStatus.edge_color, emojiStatus.center_color],
        backgroundEmojiId: emojiStatus.pattern_document_id
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
