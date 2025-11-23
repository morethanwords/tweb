import {JSX} from 'solid-js';
import {formatTime} from '../../../../helpers/date';
import {IconTsx} from '../../../iconTsx';
import styles from './logEntry.module.scss';

type LogEntryProps = {
  date: Date;
  peerTitle: JSX.Element;
  message: JSX.Element;
  icon: Icon;

  expanded?: boolean;
  expandableContent?: JSX.Element;
};

export const LogEntry = (props: LogEntryProps) => {
  const isExpandable = () => props.expandableContent !== undefined;

  return (
    <div class={styles.Container}>
      <div class={styles.Header}>
        <div class={styles.Icon}><IconTsx icon={props.icon} /></div>
        <div class={styles.Group}>
          <div class={styles.PeerTitle}>{props.peerTitle}</div>
          <div class={styles.Message}>{props.message} adsf asdf asd sdf</div>
        </div>
        <div class={styles.Date}>{formatTime(props.date)}</div>
      </div>
      {/* {isExpandable() && (
      )}*/}
      <div class={styles.ExpandableContent}>
        <div class={styles.ExpandableContentTitle}>
          {props.message}
        </div>
        {props.expandableContent}
      </div>
    </div>
  );
};
