import {createComputed, createMemo, createResource, createSelector, createSignal, For, Show} from 'solid-js';
import {createStore} from 'solid-js/store';
import {Transition} from 'solid-transition-group';
import {createSetSignal} from '../../../../../helpers/solid/createSetSignal';
import {I18nTsx} from '../../../../../helpers/solid/i18n';
import useElementSize from '../../../../../hooks/useElementSize';
import {useHotReloadGuard} from '../../../../../lib/solidjs/hotReloadGuard';
import Button from '../../../../buttonTsx';
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

  const [selectedFlagsStore, setSelectedFlagsStore] = createStore(getInitialFlagsStore());
  const [selectedAdminIds, setSelectedAdminIds] = createSetSignal<PeerId>();

  const [cardElement, setCardElement] = createSignal<HTMLDivElement | null>(null);
  const [contentElement, setContentElement] = createSignal<HTMLDivElement | null>(null);

  const cardSize = useElementSize(cardElement);
  const contentSize = useElementSize(contentElement);

  const adminIds = createMemo(() =>
    // [...Array.from({length: 20}).flatMap(() => [...adminsResource()?.participants || []])]
    adminsResource()?.participants
    ?.filter(item => 'user_id' in item)
    .map(item => item.user_id) || []
  );

  const notShowingAdmins = createMemo(() => {
    if(!adminsResource()) return null;

    const length = adminIds().length;
    const count = adminsResource().count || length;
    return count - length > 0 ? count - length : null;
  });

  const allAdminPeerIds = createMemo(() =>
    adminIds().map(id => id.toPeerId())
  );

  const isOverflowing = createMemo(() => {
    if(!cardElement() || !contentElement()) return false;
    return cardSize.height < contentSize.height;
  });

  const isAdminIdSelected = createSelector(
    selectedAdminIds,
    (id: PeerId, ids) => ids.has(id.toPeerId()));

  createComputed(() => {
    setSelectedAdminIds(new Set(allAdminPeerIds()));
  });

  const flagGroupCheckCount = (group: FilterGroupConfigItem) => {
    return group.items.filter(item => selectedFlagsStore[item.pFlag]).length;
  };

  const onFlagGroupClick = (group: FilterGroupConfigItem) => {
    const areAllChecked = group.items.every(item => selectedFlagsStore[item.pFlag]);

    setSelectedFlagsStore(group.items.map(item => item.pFlag), !areAllChecked);
  };

  const onAllAdminsClick = () => {
    setSelectedAdminIds(new Set(allAdminPeerIds()));
  };

  const onAdminClick = (id: PeerId) => {
    const newIds = new Set(selectedAdminIds());
    if(newIds.has(id.toPeerId())) {
      newIds.delete(id.toPeerId());
    } else {
      newIds.add(id.toPeerId());
    }
    setSelectedAdminIds(newIds);
  };

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
                        checkedCount={flagGroupCheckCount(group)}
                        onMainCheckboxClick={() => onFlagGroupClick(group)}
                        items={group.items.map(item => ({
                          checked: () => selectedFlagsStore[item.pFlag],
                          label: <I18nTsx key={item.i18nKey} />,
                          onClick: () => setSelectedFlagsStore(item.pFlag, (prev) => !prev)
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
                  <Space amount='1rem' />
                  <Button primary large>
                    <I18nTsx key='AdminRecentActionsFilters.ApplyFilters' />
                  </Button>
                </div>
              </Scrollable>
            </div>
          </div>
        </Show>
      </Transition>
    </>
  );
};

const getInitialFlagsStore = () => {
  const keys = filterGroupsConfig.flatMap(group => group.items.map(item => item.pFlag));

  return Object.fromEntries(keys.map(key => [key, true]));
};
