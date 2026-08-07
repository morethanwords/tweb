import {createMemo, Show} from 'solid-js';
import getLinkedCommunityId from '@appManagers/utils/communities/getLinkedCommunityId';
import {IconTsx} from '@components/iconTsx';
import {i18n} from '@lib/langPack';
import {usePeer} from '@stores/peers';
import styles from '@components/communities/communityDialog.module.scss';

export default function CommunityChildBadge(props: {
  peerId: PeerId
}) {
  const peer = usePeer(() => props.peerId);
  const communityId = createMemo(() => getLinkedCommunityId(peer()));
  const openCommunity = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const id = communityId();
    if(id) {
      void import('@lib/appDialogsManager').then(({default: manager}) => {
        if(manager.forumTab?.peerId === props.peerId) {
          return manager.toggleForumTab();
        }

        return manager.toggleForumTabByPeerId(
          id.toPeerId(true),
          true,
          false
        );
      });
    }
  };

  return (
    <Show when={communityId()}>
      <button
        type="button"
        class={styles.ChildBadge}
        data-dialog-list-action="true"
        aria-label={i18n('Community.Chats').textContent}
        on:mousedown={(event) => event.stopPropagation()}
        on:keydown={(event) => event.stopPropagation()}
        on:click={openCommunity}
      >
        <span class={styles.ChildBadgeHitArea} aria-hidden="true" />
        <IconTsx icon="down" />
      </button>
    </Show>
  );
}
