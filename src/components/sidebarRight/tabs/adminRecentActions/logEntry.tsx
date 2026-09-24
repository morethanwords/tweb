import {IconTsx} from '@components/iconTsx';
import styles from '@components/sidebarRight/tabs/adminRecentActions/logEntry.module.scss';
import {formatDate} from '@helpers/date';
import I18n from '@lib/langPack';
import {Dynamic} from 'solid-js/web';
import {HeightTransition} from '@helpers/solid/heightTransition';
import {createSignal, JSX, Show} from 'solid-js';


type LogEntryProps = {
  date: Date;
  peerTitle: JSX.Element;
  message: JSX.Element;
  icon: Icon;

  offsetTitle?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  expandableContent?: JSX.Element;

  onPeerTitleClick?: () => void;
};

export const LogEntry = (props: LogEntryProps) => {
  const [hasRunningAnimations, setHasRunningAnimations] = createSignal(false);

  return (
    <div
      class={styles.Container}
      onClick={(e) => {
        if(e.target.closest('.interactable')) return;
        !hasRunningAnimations() && props.onExpandedChange?.(!props.expanded);
      }}
    >
      <div class={styles.Header}>
        <Dynamic
          component={props.onExpandedChange ? 'button' : 'div'}
          type={props.onExpandedChange ? 'button' : undefined}
          class={styles.Icon}
          aria-label={props.onExpandedChange ? I18n.format('AccDescr.LogEntryDetails', true) : undefined}
          aria-expanded={props.onExpandedChange ? !!props.expanded : undefined}
        ><IconTsx icon={props.icon} /></Dynamic>
        <div class={styles.Group}>
          <div class={styles.PeerTitle}>
            <Dynamic
              component={props.onPeerTitleClick ? 'button' : 'div'}
              type={props.onPeerTitleClick ? 'button' : undefined}
              class={`${styles.PeerTitleText} interactable`}
              onClick={props.onPeerTitleClick}
            >
              <div class={styles.PeerTitleTextClickArea} />
              {props.peerTitle}
            </Dynamic>
          </div>
          <HeightTransition onRunningAnimations={value => setHasRunningAnimations(!!value)}>
            <Show when={!props.expanded}>
              <div>
                <div class={styles.Message}>{props.message}</div>
              </div>
            </Show>
          </HeightTransition>
        </div>
        <div class={styles.Date}>
          {formatDate(props.date, {withTime: true, shortMonth: true})}
        </div>
      </div>
      <HeightTransition scale>
        <Show when={props.expanded}>
          <div class={styles.ExpandableContentWrapper}>
            <div class={styles.ExpandableContent}>
              <div class={styles.ExpandableContentTitle}>
                {props.message}
              </div>
              <Show when={props.expandableContent}>
                <div class={styles.ExpandableContentSpace} />
                {props.expandableContent}
              </Show>
            </div>
          </div>
        </Show>
      </HeightTransition>
    </div>
  );
};
