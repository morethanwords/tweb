import {ComponentProps, For, JSX, splitProps, untrack} from 'solid-js';
import {LangPackKey, i18n} from '../lib/langPack';
import {AvatarNew} from './avatarNew';
import {PeerTitleTsx} from './peerTitleTsx';
import classNames from '../helpers/string/classNames';

import styles from './table.module.scss';
import {NULL_PEER_ID} from '../lib/mtproto/mtproto_config';
import Button from './buttonTsx';
import showTooltip from './tooltip';

export type TableRow = [LangPackKey, JSX.Element];

const keyCellClass = classNames(styles.cell, styles.key);

export default function Table(props: {
  class?: string,
  content: TableRow[]
  boldKey?: boolean
  footer?: JSX.Element
  footerClass?: string
  cellClass?: string
}) {
  return (
    <table
      class={classNames(
        styles.table,
        props.boldKey && styles.boldKey,
        props.class
      )}
    >
      <For each={props.content}>
        {([key, value]) => (
          <tr class={/* @once */ styles.row}>
            <td class={classNames(keyCellClass, props.cellClass)}>{i18n(key)}</td>
            <td class={classNames(styles.cell, props.cellClass)}>
              <div class={/* @once */ styles.value}>
                {value}
              </div>
            </td>
          </tr>
        )}
      </For>
      {props.footer && (
        <tr class={/* @once */ styles.row}>
          <td class={props.footerClass ?? classNames(styles.cell, props.cellClass)} colspan={2}>
            {props.footer}
          </td>
        </tr>
      )}
    </table>
  );
}

export function TablePeer(props: {
  peerId: PeerId,
  onClick?: () => void
}) {
  const avatar = untrack(() => AvatarNew({peerId: props.peerId, size: 24}));
  return (
    <div
      class={/* @once */ styles.peer}
      onClick={props.onClick}
    >
      {props.peerId === NULL_PEER_ID ? (
        <>
          <div class="popup-star-gift-info-anonymous">
            <img src="assets/img/anon_paid_reaction.png" alt="Anonymous" />
          </div>
          {i18n('StarGiftHiddenUser')}
        </>
      ) : (
        <>
          {avatar.element}
          <PeerTitleTsx peerId={props.peerId} />
        </>
      )}
    </div>
  );
}

export function TableButton(props: ComponentProps<typeof Button>) {
  return (
    <Button
      {...props}
      class={/* @once */ styles.button}
    />
  )
}

export function TableButtonWithTooltip(props: ComponentProps<typeof Button> & {
  tooltipClass?: string
  tooltipTextElement: HTMLElement
}) {
  const [, rest] = splitProps(props, ['tooltipClass', 'tooltipTextElement']);
  return (
    <Button
      {...rest}
      class={/* @once */ styles.button}
      onClick={(evt) => {
        props.onClick?.(evt);
        showTooltip({
          element: evt.target as HTMLElement,
          vertical: 'top',
          container: document.body,
          class: props.tooltipClass,
          textElement: props.tooltipTextElement
        })
      }}
    />
  )
}
