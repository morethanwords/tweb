import {FakeBubbles} from '@components/chat/bubbles/fakeBubbles';
import {BubbleLayout} from '@components/chat/bubbles/bubbleLayout';
import {AvatarNewTsx} from '@components/avatarNew';
import {PeerTitleTsx} from '@components/peerTitleTsx';
import createBubbleNameRank from '@components/chat/bubbleParts/bubbleNameRank';
import {getPeerColorIndexByPeer} from '@appManagers/utils/peers/getPeerColorById';
import type {MemberTagRole} from '@appManagers/utils/chats/memberTag';
import apiManagerProxy from '@lib/apiManagerProxy';
import classNames from '@helpers/string/classNames';
import styles from '@components/memberTag/memberTagPreview.module.scss';

/**
 * A message of `peerId`'s on the group's background, its text drawn as lines, the tag at the end of
 * the name line — how the tag will look. An admin or the owner without a tag reads "admin" / "owner",
 * a member without one has none
 */
export default function MemberTagPreview(props: {
  chatPeerId: PeerId,
  peerId: PeerId,
  rank: string,
  role: MemberTagRole,
  class?: string,
  // * the end of a bubble only, faded where it is cut off: no avatar, no name, just the tag on its line
  cropped?: boolean
}) {
  const colorIndex = getPeerColorIndexByPeer(apiManagerProxy.getPeer(props.peerId));
  const tag = () => {
    const rank = props.rank || (props.role === 'owner' ? 1 : (props.role === 'admin' ? 2 : undefined));
    return rank !== undefined && createBubbleNameRank({rank, role: props.role});
  };

  return (
    <FakeBubbles peerId={props.chatPeerId} class={classNames(styles.preview, props.class)} contentClass={styles.content}>
      <div class={classNames(styles.row, props.cropped && styles.isCropped)}>
        {/* the size a group's avatars have in the chat (bubbleGroups) */}
        {!props.cropped && <AvatarNewTsx peerId={props.peerId} size={40} class={styles.avatar} />}
        <BubbleLayout
          class={styles.bubble}
          contentStyle={colorIndex !== -1 ? {'--peer-color-rgb': `var(--peer-${colorIndex}-color-rgb)`} : undefined}
          tail={!props.cropped}
          group="single"
          name={(
            <div class="title-flex">
              {props.cropped ? <span class="bubble-name-first" /> : <PeerTitleTsx peerId={props.peerId} class="bubble-name-first" />}
              {tag()}
            </div>
          )}
          content={(
            <div class={styles.lines} aria-hidden="true">
              <span class={styles.line} />
              <span class={styles.line} />
              <span class={styles.line} />
              <span class={styles.line} />
            </div>
          )}
        />
      </div>
    </FakeBubbles>
  );
}
