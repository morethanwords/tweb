import {For, Show} from 'solid-js';
import {I18nTsx} from '../../../../../helpers/solid/i18n';
import {useHotReloadGuard} from '../../../../../lib/solidjs/hotReloadGuard';
import Button from '../../../../buttonTsx';
import Scrollable from '../../../../scrollable2';
import SimpleFormField from '../../../../simpleFormField';
import Space from '../../../../space';
import {limitPeerTitleSymbols} from '../constants';
import {filterGroupsConfig} from './config';
import {ExpandableFilterGroup} from './expandableFilterGroup';
import styles from './flagFilters.module.scss';
import {CommittedFilters} from './types';
import {useFlagFilters} from './useFlagFilters';


export const FlagFilters = (props: {
  hasSearch?: boolean;

  inputRef?: (input: HTMLInputElement) => void;

  onCommit: (committedFilters: CommittedFilters) => void;
  onReset: () => void;

  filtersControls: ReturnType<typeof useFlagFilters>;
}) => {
  const {PeerTitleTsx} = useHotReloadGuard();

  const filtersControls = () => props.filtersControls;

  const onCommit = () => {
    props.onCommit(filtersControls().getCommittedReady());
  };

  const onSubmit = (e: Event) => {
    e.preventDefault();
    onCommit();
  };

  return <>
    <Show when={props.hasSearch}>
      <Space amount='2px' />

      <form class={styles.Search} onSubmit={onSubmit}>
        <SimpleFormField value={filtersControls().search()} onChange={filtersControls().onSearchChange}>
          <SimpleFormField.Label><I18nTsx key='Search' /></SimpleFormField.Label>
          <SimpleFormField.Input ref={/* @once */props.inputRef} />
        </SimpleFormField>
      </form>

      <Space amount='1rem' />
    </Show>

    <Scrollable class={styles.Scrollable} withBorders='both' relative>
      <div class={styles.SectionTitle}>
        <I18nTsx key='AdminRecentActionsFilters.ByType' />
      </div>
      <For each={filterGroupsConfig}>
        {group => (
          <ExpandableFilterGroup
            mainLabel={<I18nTsx key={group.i18nKey} />}
            checkedCount={filtersControls().flagGroupCheckCount(group)}
            onMainCheckboxClick={() => filtersControls().onFlagGroupClick(group)}
            items={group.items.map(item => ({
              checked: () => filtersControls().isFlagSelected(item.pFlag),
              label: <I18nTsx key={item.i18nKey} />,
              onClick: () => filtersControls().onFlagClick(item.pFlag)
            }))}
          />
        )}
      </For>
      <Space amount='1rem' />
      <div class={styles.SectionTitle}>
        <I18nTsx key='AdminRecentActionsFilters.ByAdmin' />
      </div>
      <Show when={filtersControls().adminIds().length}>
        <ExpandableFilterGroup
          mainLabel={<I18nTsx key='AdminRecentActionsFilters.ShowAllAdminActions' />}
          checkedCount={filtersControls().selectedAdminIds().size}
          onMainCheckboxClick={filtersControls().onAllAdminsClick}
          items={filtersControls().adminIds().map(userId => ({
            checked: () => filtersControls().isAdminIdSelected(userId.toPeerId()),
            label: <PeerTitleTsx peerId={userId.toPeerId()} limitSymbols={limitPeerTitleSymbols} />,
            onClick: () => filtersControls().onAdminClick(userId.toPeerId())
          }))}
        />
      </Show>
      <Show when={filtersControls().notShowingAdmins()}>
        <div class={styles.SectionTitle}>
          <I18nTsx key='AdminRecentActionsFilters.NotShowingAdmins' args={[filtersControls().notShowingAdmins() + '']} />
        </div>
      </Show>

    </Scrollable>

    <Space amount='1rem' />

    <div class={styles.Footer}>
      <Button class={styles.Button} primary onClick={props.onReset}>
        <I18nTsx key='AdminRecentActionsFilters.ResetFilters' />
      </Button>
      <Button class={styles.Button} primaryFilled onClick={onCommit}>
        <I18nTsx key='AdminRecentActionsFilters.ApplyFilters' />
      </Button>
    </div>
  </>
};
