import {createSignal, JSX, Show} from 'solid-js';
import {formatDate} from '@helpers/date';
import {IconTsx} from '@components/iconTsx';
import {HeightTransition} from '@components/sidebarRight/tabs/adminRecentActions/heightTransition';
import styles from '@components/sidebarRight/tabs/adminRecentActions/logEntry.module.scss';


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
    <div class={styles.Container} onClick={(e) => {
      if(e.target.closest('.interactable')) return;
      !hasRunningAnimations() && props.onExpandedChange?.(!props.expanded);
    }}>
      <div class={styles.Header}>
        <div class={styles.Icon}><IconTsx icon={props.icon} /></div>
        <div class={styles.Group}>
          <div class={styles.PeerTitle}>
            <div class={`${styles.PeerTitleText} interactable`} onClick={props.onPeerTitleClick}>
              <div class={styles.PeerTitleTextClickArea} />
              {props.peerTitle}
            </div>
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
              <div class={styles.ExpandableContentTitle} classList={{
                [styles.offset]: props.offsetTitle
              }}>
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
