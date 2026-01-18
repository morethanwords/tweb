import {JSX, Show} from 'solid-js';
import {I18nTsx} from '@helpers/solid/i18n';
import {ExportedChatInvite} from '@layer';
import {i18n} from '@lib/langPack';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {limitPeerTitleSymbols} from '@components/sidebarRight/tabs/adminRecentActions/constants';
import styles from '@components/sidebarRight/tabs/adminRecentActions/keyValuePair.module.scss';
import {useParticipantClickHandler} from '@components/sidebarRight/tabs/adminRecentActions/utils';


export const KeyValuePair = (props: {
  label: JSX.Element;
  value: JSX.Element;

  interactable?: boolean;
  onClick?: () => void;
}) => {
  return (
    <div
      class={styles.Container}
      classList={{
        'interactable': props.interactable || !!props.onClick,
        [styles.hoverable]: !!props.onClick
      }}
      onClick={props.onClick}
    >
      <div class={styles.Border} />
      <div>{props.label}:</div>
      <div class={styles.Value}>{props.value}</div>
    </div>
  );
};

export const BooleanKeyValue = (props: {
  label?: JSX.Element
  value: boolean;
}) => (
  <KeyValuePair
    label={props.label || i18n('AdminRecentActions.ChangedTo')}
    value={props.value ?
      i18n('AdminRecentActions.Enabled') :
      i18n('AdminRecentActions.Disabled')
    }
  />
);

export const InviteKeyValue = (props: { invite: ExportedChatInvite }) => {
  return (
    <Show when={props.invite._ === 'chatInviteExported'}>
      <KeyValuePair
        label={<I18nTsx key='InviteLink' />}
        value={props.invite._ === 'chatInviteExported' ? props.invite.link : ''}
      />
    </Show>
  );
};

export const ParticipantKeyValue = (props: {
  label?: JSX.Element;
  peerId: PeerId;
}) => {
  const {PeerTitleTsx} = useHotReloadGuard();

  return (
    <Show when={props.peerId}>
      <KeyValuePair
        label={props.label || <I18nTsx key='AdminRecentActions.Participant' />}
        value={<PeerTitleTsx peerId={props.peerId} limitSymbols={limitPeerTitleSymbols} />}
        onClick={useParticipantClickHandler(props.peerId)}
      />
    </Show>
  )
};
