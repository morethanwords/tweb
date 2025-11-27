import {createComputed, createMemo, createResource, createSelector, createSignal, For, Show} from 'solid-js';
import {createStore} from 'solid-js/store';
import {Transition} from 'solid-transition-group';
import {I18nTsx} from '../../../../../helpers/solid/i18n';
import useElementSize from '../../../../../hooks/useElementSize';
import {useHotReloadGuard} from '../../../../../lib/solidjs/hotReloadGuard';
import Scrollable from '../../../../scrollable2';
import Space from '../../../../space';
import {FilterGroupConfigItem, filterGroupsConfig} from './config';
import {ExpandableFilterGroup} from './expandableFilterGroup';
import styles from './styles.module.scss';


type FiltersProps = {
  channelId: ChatId;
  open: boolean;
};

const adminsFetchLimit = 40; // Have more admins? I'm really sorry :)

export const Filters = (props: FiltersProps) => {
  const {rootScope, PeerTitleTsx} = useHotReloadGuard();

  const [adminsResource] = createResource(() => props.channelId, (id) =>
    rootScope.managers.appProfileManager.getChannelParticipants({
      id,
      filter: {_: 'channelParticipantsAdmins'},
      offset: 0,
      limit: adminsFetchLimit
    })
  );

  const adminIds = () =>
    // [...Array.from({length: 20}).flatMap(() => [...adminsResource()?.participants || []])]
    adminsResource()?.participants
    ?.filter(item => 'user_id' in item)
    .map(item => item.user_id) || [];

  // createEffect(() => {
  //   if(!adminsResource()) return;
  //   console.log('my-debug', {admins: adminsResource()});
  // });

  const notShowingAdmins = createMemo(() => {
    if(!adminsResource()) return null;

    const length = adminIds().length;
    const count = adminsResource().count || length;
    return count - length > 0 ? count - length : null;
  });

  const [cardElement, setCardElement] = createSignal<HTMLDivElement | null>(null);
  const [contentElement, setContentElement] = createSignal<HTMLDivElement | null>(null);

  const cardSize = useElementSize(cardElement);
  const contentSize = useElementSize(contentElement);

  const isOverflowing = createMemo(() => {
    if(!cardElement() || !contentElement()) return false;
    return cardSize.height < contentSize.height;
  });

  const getInitialFlagsStore = () => {
    const keys = filterGroupsConfig.flatMap(group => group.items.map(item => item.pFlag));

    return Object.fromEntries(keys.map(key => [key, true]));
  };

  const [flagsStore, setFlagsStore] = createStore(getInitialFlagsStore());

  const getGroupCheckCount = (group: FilterGroupConfigItem) => {
    return group.items.filter(item => flagsStore[item.pFlag]).length;
  };

  const onGroupClick = (group: FilterGroupConfigItem) => {
    const areAllChecked = group.items.every(item => flagsStore[item.pFlag]);

    setFlagsStore(group.items.map(item => item.pFlag), !areAllChecked);
  };

  const [selectedAdminIds, setSelectedAdminIds] = createSignal(new Set<PeerId>(), {
    equals: (prev, next) => prev.size === next.size && [...prev].every(id => next.has(id))
  });

  const getAllAdminPeerIds = () => {
    return adminIds().map(id => id.toPeerId());
  };

  createComputed(() => {
    setSelectedAdminIds(new Set(getAllAdminPeerIds()));
  });

  const onAllAdminsClick = () => {
    setSelectedAdminIds(new Set(getAllAdminPeerIds()));
  };

  const isAdminIdSelected = createSelector(
    selectedAdminIds,
    (id: PeerId, ids) => ids.has(id.toPeerId()));

  const onAdminClick = (id: PeerId) => {
    const newIds = new Set(selectedAdminIds());
    if(newIds.has(id.toPeerId())) {
      newIds.delete(id.toPeerId());
    } else {
      newIds.add(id.toPeerId());
    }
    setSelectedAdminIds(newIds);
  };

  // createEffect(() => {
  //   console.log('my-debug', {
  //     isOverflowing: isOverflowing(),
  //     cardSize: cardSize.height,
  //     contentSize: contentSize.height
  //   })
  // })

  return (
    <>
      <Transition name='fade'>
        <Show when={props.open}>
          <div class={styles.Overlay} />
        </Show>
      </Transition>

      <Transition
        enterActiveClass={styles.ContainerEnterActive}
        exitActiveClass={styles.ContainerExitActive}
        enterClass={styles.ContainerEnter}
        exitToClass={styles.ContainerExitTo}
      >
        <Show when={props.open}>
          <div class={styles.Container}>
            <div class={styles.ContainerBackdrop}>
              <div class={styles.ContainerBackdropFill} />
              <div class={styles.ContainerBackdropExtension} />
            </div>
            <div class={styles.Card} ref={setCardElement}>
              <Scrollable classList={{[styles.hideThumb]: !isOverflowing()}} relative>
                <div class={styles.Content} ref={setContentElement}>
                  <div class={styles.SectionTitle}>
                    <I18nTsx key='AdminRecentActionsFilters.ByType' />
                  </div>
                  <For each={filterGroupsConfig}>
                    {group => (
                      <ExpandableFilterGroup
                        mainLabel={<I18nTsx key={group.i18nKey} />}
                        checkedCount={getGroupCheckCount(group)}
                        onMainCheckboxClick={() => onGroupClick(group)}
                        items={group.items.map(item => ({
                          checked: () => flagsStore[item.pFlag],
                          label: <I18nTsx key={item.i18nKey} />,
                          onClick: () => setFlagsStore(item.pFlag, (prev) => !prev)
                        }))}
                      />
                    )}
                  </For>
                  <Space amount='1rem' />
                  <div class={styles.SectionTitle}>
                    <I18nTsx key='AdminRecentActionsFilters.ByAdmin' />
                  </div>
                  <Show when={adminIds().length}>
                    <ExpandableFilterGroup
                      mainLabel={<I18nTsx key='AdminRecentActionsFilters.ShowAllAdminActions' />}
                      checkedCount={selectedAdminIds().size}
                      onMainCheckboxClick={onAllAdminsClick}
                      items={adminIds().map(userId => ({
                        checked: () => isAdminIdSelected(userId.toPeerId()),
                        label: <PeerTitleTsx peerId={userId.toPeerId()} />,
                        onClick: () => onAdminClick(userId.toPeerId())
                      }))}
                    />
                  </Show>
                  <Show when={notShowingAdmins()}>
                    <div class={styles.SectionTitle}>
                      <I18nTsx key='AdminRecentActionsFilters.NotShowingAdmins' args={[notShowingAdmins() + '']} />
                    </div>
                  </Show>
                </div>
              </Scrollable>
            </div>
          </div>
        </Show>
      </Transition>
    </>
  );
};


/*
pFlags: Partial<{
  join?: true,
  leave?: true,
  invite?: true,
  ban?: true,
  unban?: true,
  kick?: true,
  unkick?: true,
  promote?: true,
  demote?: true,
  info?: true,
  settings?: true,
  pinned?: true,
  edit?: true,
  delete?: true,
  group_call?: true,
  invites?: true,
  send?: true,
  forums?: true,
  sub_extend?: true,
}>

join: 'AdminRecentActionsFilters.NewMembers'
leave: 'AdminRecentActionsFilters.MembersLeftGroup'

promote: 'AdminRecentActionsFilters.NewAdminRights'

info: 'AdminRecentActionsFilters.GroupInfo'
invites: 'AdminRecentActionsFilters.InviteLinks'
group_call: 'AdminRecentActionsFilters.VideoChats'

delete: 'AdminRecentActionsFilters.DeletedMessages'
edit: 'AdminRecentActionsFilters.EditedMessages'
pinned: 'AdminRecentActionsFilters.PinnedMessages'

*/
