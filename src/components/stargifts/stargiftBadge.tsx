import {JSX} from 'solid-js';
import classNames from '../../helpers/string/classNames';
import styles from './stargiftBadge.module.scss';
import {StarGiftAttribute} from '../../layer';
import {rgbIntToHex} from '../../helpers/color';

export function StarGiftBadge(props: {
  class?: string
  textClass?: string
  children: JSX.Element
  backdropAttr?: StarGiftAttribute.starGiftAttributeBackdrop
}) {
  return (
    <div
      class={classNames(styles.badge, props.class)}
      style={{
        background: props.backdropAttr ?
          `linear-gradient(180deg, ${rgbIntToHex(props.backdropAttr.center_color)} 0%, ${rgbIntToHex(props.backdropAttr.edge_color)} 100%)` :
          undefined
      }}
    >
      <div class={classNames(styles.text, props.textClass)}>
        {props.children}
      </div>
    </div>
  )
}
