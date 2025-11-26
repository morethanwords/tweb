import {For, Show} from 'solid-js';
import {Transition} from 'solid-transition-group';
import {I18nTsx} from '../../../../../helpers/solid/i18n';
import {filterGroupsConfig} from './config';
import {ExpandableFilterGroup} from './expandableFilterGroup';
import styles from './styles.module.scss';


type FiltersProps = {
  open: boolean;
};

export const Filters = (props: FiltersProps) => {
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
            <div class={styles.Card}>
              <For each={filterGroupsConfig}>
                {group => (
                  <ExpandableFilterGroup
                    mainLabel={<I18nTsx key={group.i18nKey} />}
                    checkedCount={group.items.length}
                    onMainCheckboxClick={() => {}}
                    items={group.items.map(item => ({
                      checked: () => false,
                      label: <I18nTsx key={item.i18nKey} />,
                      onClick: () => {}
                    }))}
                  />
                )}
              </For>
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
