/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createUniqueId, Show} from 'solid-js';
import I18n from '@lib/langPack';
import classNames from '@helpers/string/classNames';
import shake from '@helpers/dom/shake';
import {InputFieldTsx} from '@components/inputFieldTsx';
import {IconTsx} from '@components/iconTsx';
import {COMMENT_WARN_BYTES, commentBytesLeft} from '@components/wallet/send';
import liteMode from '@helpers/liteMode';
import styles from '@components/wallet/commentField.module.scss';

export type WalletCommentFieldHandle = {
  /** a send refused for the comment (past its limit): the field shakes its head */
  refuse: () => void
};

/**
 * A transfer's comment: the app's text field, counting down the last bytes of its limit (tdesktop ApplyCommentLimit —
 * the limit is in UTF-8 bytes, so the count starts late and may go below zero, then the send refuses it), and on the
 * confirmation the lock that makes it private or public (Android's confirmation sheet, iOS's transfer preview).
 * Enter sends, Shift+Enter starts a new line.
 */
export default function WalletCommentField(props: {
  value: string,
  onInput: (value: string) => void,
  onEnter?: () => void,
  class?: string,
  disabled?: boolean,
  /** the lock, where a private comment can go: `encrypted` is how it goes now */
  lock?: {encrypted: boolean, onToggle: () => void},
  handleRef?: (handle: WalletCommentFieldHandle) => void
}) {
  const counterId = createUniqueId();
  const left = () => commentBytesLeft(props.value);
  const counting = () => left() <= COMMENT_WARN_BYTES;
  let container: HTMLDivElement;
  props.handleRef?.({
    refuse: () => {
      navigator.vibrate?.([12, 60, 10]);
      if(liteMode.isAvailable('motion')) shake(container);
    }
  });

  return (
    <div
      ref={container}
      class={classNames(styles.field, props.lock && styles.withLock, counting() && styles.counting, props.class)}
    >
      <InputFieldTsx
        class={styles.input}
        placeholder="Wallet.Comment"
        withLinebreaks
        value={props.value}
        onRawInput={props.onInput}
        disabled={props.disabled}
        errorDescriptionId={counting() ? counterId : undefined}
        instanceRef={(field) => {
          field.input.addEventListener('keydown', (e) => {
            // * the Enter that picks an IME candidate, or one held down, is no send
            if(e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229 && !e.repeat && props.onEnter) {
              e.preventDefault();
              props.onEnter();
            }
          });
        }}
      />
      <Show when={counting()}>
        <span id={counterId} class={classNames(styles.counter, left() < 0 && styles.over)}>
          {/* * a signed number reads left to right in any interface */}
          <span dir="ltr">{left() < 0 ? '−' + -left() : left()}</span>
        </span>
      </Show>
      {/* * one button for both states: a toggle keeps its focus */}
      <Show when={!!props.lock}>
        <button
          type="button"
          class={classNames('btn-icon', styles.lock, props.lock.encrypted && styles.locked)}
          aria-label={I18n.format('Wallet.CommentMakePublic', true)}
          aria-pressed={!props.lock.encrypted}
          disabled={props.disabled}
          onClick={() => props.lock.onToggle()}
        >
          <IconTsx icon={props.lock.encrypted ? 'lock' : 'lockoff'} />
        </button>
      </Show>
    </div>
  );
}
