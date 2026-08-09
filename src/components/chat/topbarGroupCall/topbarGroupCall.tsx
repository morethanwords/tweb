import {JSX} from 'solid-js';
import classNames from '@helpers/string/classNames';
import Button from '@components/buttonTsx';
import {StackedAvatarsTsx} from '@components/stackedAvatars';
import {i18n} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import {cnTopbarGroupCall} from '@components/chat/topbarGroupCall/topbarGroupCall.cn';

import '@components/chat/topbarGroupCall/topbarGroupCall.scss';

const AVATAR_SIZE = 36;

/**
 * Layout follows the group-call bar of the other clients: icon + title on one
 * side, the join button on the other, and a preview of who is already in the
 * call sitting on the plate's horizontal centre.
 *
 * The two sides are equal-width columns rather than plain flex items, so the
 * stack lands on the real centre of the plate (like tdesktop, which paints it
 * at `width / 2`) instead of wherever the text happens to end.
 */
export const TopbarGroupCall = (props: {
  title?: string,
  participantsCount: number,
  participantPeerIds: PeerId[],
  actionButton: JSX.Element
}) => {
  return (
    <>
      <div class={cnTopbarGroupCall('-side')}>
        <Button.Icon icon="videochat" class="primary disable-hover" />
        <div class={cnTopbarGroupCall('-content')}>
          <div class={classNames(cnTopbarGroupCall('-title'), 'primary', 'text-bold', 'text-overflow-no-wrap')}>
            {props.title ? wrapEmojiText(props.title) : i18n('PeerInfo.Action.VoiceChat')}
          </div>
          <div class={classNames(cnTopbarGroupCall('-subtitle'), 'secondary', 'text-overflow-no-wrap')}>
            {i18n('VoiceChat.Status.Members', [props.participantsCount])}
          </div>
        </div>
      </div>
      <StackedAvatarsTsx peerIds={props.participantPeerIds} avatarSize={AVATAR_SIZE} />
      <div class={classNames(cnTopbarGroupCall('-side'), 'is-end')}>
        {props.actionButton}
      </div>
    </>
  );
};
