import {createSignal, JSX, Show} from 'solid-js';
import {formatTime} from '../../../../helpers/date';
import {IconTsx} from '../../../iconTsx';
import {HeightTransition} from './heightTransition';
import styles from './logEntry.module.scss';


type LogEntryProps = {
  date: Date;
  peerTitle: JSX.Element;
  message: JSX.Element;
  icon: Icon;

  offsetTitle?: boolean;
  expanded?: boolean;
  expandableContent?: JSX.Element;
};

export const LogEntry = (props: LogEntryProps) => {
  const [expanded, setExpanded] = createSignal(true);

  return (
    <div class={styles.Container} onClick={() => setExpanded(!expanded())}>
      <div class={styles.Header}>
        <div class={styles.Icon}><IconTsx icon={props.icon} /></div>
        <div class={styles.Group}>
          {/* <div class={styles.NameRow}>*/}
          <div class={styles.PeerTitle}>{props.peerTitle}</div>
          {/* </div>*/}
          <HeightTransition>
            <Show when={!expanded()}>
              <div>
                <div class={styles.Message}>{props.message}</div>
              </div>
            </Show>
          </HeightTransition>
        </div>
        <div class={styles.Date}>
          {/* {formatDate(props.date, undefined, true)}*/}
          {formatTime(props.date)}
        </div>
      </div>
      <HeightTransition>
        <Show when={expanded()}>
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
