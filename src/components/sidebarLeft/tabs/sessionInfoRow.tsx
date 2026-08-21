import {JSX} from 'solid-js';
import Row from '@components/rowTsx';
import classNames from '@helpers/string/classNames';
import styles from '@components/sidebarLeft/tabs/sessionDetails.module.scss';

const EMPTY_VALUE = '—';

/**
 * One "label → value" line of a session's info section, shared by the device
 * session and the connected bot session views.
 */
export default function SessionInfoRow(props: {
  label: JSX.Element,
  value: JSX.Element,
  /** Overrides how wide the value may get before it elides. */
  valueClass?: string
}) {
  return (
    <Row>
      <Row.Title
        titleRight={props.value || EMPTY_VALUE}
        titleRightClass={classNames('text-overflow-no-wrap', props.valueClass || styles.value)}
        titleRightSecondary
      >
        {props.label}
      </Row.Title>
    </Row>
  );
}
