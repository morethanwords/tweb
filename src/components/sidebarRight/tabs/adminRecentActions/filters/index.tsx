import {batch, createComputed, createMemo, createResource, createSelector, createSignal, For, Show} from 'solid-js';
import {createStore} from 'solid-js/store';
import {Transition} from 'solid-transition-group';
import {IS_MOBILE} from '../../../../../environment/userAgent';
import {createSetSignal} from '../../../../../helpers/solid/createSetSignal';
import {I18nTsx} from '../../../../../helpers/solid/i18n';
import track from '../../../../../helpers/solid/track';
import useElementSize from '../../../../../hooks/useElementSize';
import {AdminLogFilterFlags} from '../../../../../lib/appManagers/appChatsManager';
import {useHotReloadGuard} from '../../../../../lib/solidjs/hotReloadGuard';
import Button from '../../../../buttonTsx';
import Scrollable from '../../../../scrollable2';
import SimpleFormField from '../../../../simpleFormField';
import Space from '../../../../space';
import {FilterGroupConfigItem, filterGroupsConfig} from './config';
import {ExpandableFilterGroup} from './expandableFilterGroup';
import styles from './styles.module.scss';


export type CommittedFilters = {
  search?: string;
  flags?: AdminLogFilterFlags;
  admins?: PeerId[];
};

type FiltersProps = {
  channelId: ChatId;
  open: boolean;
  onClose?: () => void;

  committedFilters?: CommittedFilters | null;
  onCommit?: (filters: CommittedFilters | null) => void;
};

const adminsFetchLimit = 40; // Have more admins? I'm really sorry :)
const limitPeerTitleSymbols = 24;
const focusDelay = 100;

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

  const [search, setSearch] = createSignal('');
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
    (id: PeerId, ids) => ids.has(id.toPeerId())
  );

  createComputed(() => {
    track(() => props.open);

    setSearch(props.committedFilters?.search || '');
    setSelectedFlagsStore(props.committedFilters?.flags || getInitialFlagsStore());
    setSelectedAdminIds(new Set(props.committedFilters?.admins || allAdminPeerIds()));
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

  const onReset = () => {
    props.onCommit(null);
    props.onClose?.();
  };

  const onCommit = () => {
    const activeFlagEntries = Object.entries(selectedFlagsStore).filter(([, value]) => value);

    const flags = activeFlagEntries.length && activeFlagEntries.length < getAllFlagKeys().length ?
      Object.fromEntries(activeFlagEntries) :
      undefined;

    const admins = selectedAdminIds().size < allAdminPeerIds().length && selectedAdminIds().size ?
      Array.from(selectedAdminIds()) :
      undefined;

    batch(() => {
      props.onCommit(search() || flags || admins ? {
        search: search() || undefined,
        flags,
        admins
      } : null);

      props.onClose?.();
    });
  };

  const onSubmit = (e: Event) => {
    e.preventDefault();
    onCommit();
  };

  const onInputRef = (el: HTMLInputElement) => {
    if(IS_MOBILE) return;
    setTimeout(() => el.focus(), focusDelay)
  };

  return (
    <>
      <Transition name='fade'>
        <Show when={props.open}>
          <div class={styles.Overlay} onClick={props.onClose} />
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
                  <Space amount='2px' />

                  <form class={styles.Search} onSubmit={onSubmit}>
                    <SimpleFormField value={search()} onChange={setSearch}>
                      <SimpleFormField.Label><I18nTsx key='Search' /></SimpleFormField.Label>
                      <SimpleFormField.Input ref={onInputRef} />
                    </SimpleFormField>
                  </form>

                  <Space amount='1rem' />

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
                        label: <PeerTitleTsx peerId={userId.toPeerId()} limitSymbols={limitPeerTitleSymbols} />,
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

                  <div class={styles.Footer}>
                    <Button class={styles.Button} primary onClick={onReset}>
                      <I18nTsx key='AdminRecentActionsFilters.ResetFilters' />
                    </Button>
                    <Button class={styles.Button} primaryFilled onClick={onCommit}>
                      <I18nTsx key='AdminRecentActionsFilters.ApplyFilters' />
                    </Button>
                  </div>
                </div>
              </Scrollable>
            </div>
          </div>
        </Show>
      </Transition>
    </>
  );
};

const getAllFlagKeys = () => filterGroupsConfig.flatMap(group => group.items.map(item => item.pFlag));

const getInitialFlagsStore = () => {
  const keys = getAllFlagKeys();

  return Object.fromEntries(keys.map(key => [key, true]));
};
