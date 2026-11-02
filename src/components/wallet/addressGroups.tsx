/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {For} from 'solid-js';
import classNames from '@helpers/string/classNames';
import {groupAddress} from '@components/wallet/format';
import styles from '@components/wallet/wallet.module.scss';

/**
 * An address in groups of four, `perLine` to a line (four by default), every other group grey like a checkerboard,
 * in the monospace font (iOS): an address is read and compared group by group
 */
export default function WalletAddressGroups(props: {
  address: string,
  perLine?: number,
  class?: string,
  /** the grey groups' class, for a surface the default grey does not suit */
  mutedClass?: string
}) {
  const lines = () => groupAddress(props.address, props.perLine ?? 4).map((line) => line.split(' '));
  // * a line reads left to right in either direction, and stands where the text around it would: by the inline start
  return (
    <span class={classNames(styles.addressGroups, props.class)}>
      <For each={lines()}>{(groups, row) => (
        <span class={styles.addressGroupLine}>
          <span dir="ltr">
            <For each={groups}>{(group, column) => (
              <>{column() ? ' ' : ''}<span class={(row() + column()) % 2 ? props.mutedClass ?? styles.addressGroupMuted : undefined}>{group}</span></>
            )}</For>
          </span>
        </span>
      )}</For>
    </span>
  );
}
