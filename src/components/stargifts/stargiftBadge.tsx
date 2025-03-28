import {JSX} from 'solid-js';
import classNames from '../../helpers/string/classNames';
import styles from './stargiftBadge.module.scss';

export function StarGiftBadge(props: {
  class?: string
  textClass?: string
  children: JSX.Element
}) {
  return (
    <div class={classNames(styles.badge, props.class)}>
      <div class={classNames(styles.text, props.textClass)}>
        {props.children}
      </div>
    </div>
  )
}
