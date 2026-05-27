/*
 * Conference-call emoji fingerprint badge — small reactive component that
 * renders the 4-emoji verification sequence from a live emoji_hash byte
 * stream. Drop-in for any container that wants the user-visible "this is
 * the same call on every device" indicator.
 *
 * Pure presentation; the parent owns the hash signal + lifecycle.
 */

import {Component, For, Show} from 'solid-js';
import classNames from '@helpers/string/classNames';
import {emojiFingerprint} from '@lib/calls/e2e/emojiFingerprint';

export interface FingerprintBadgeProps {
  // 32-byte (or any multiple-of-8) emoji_hash. Pass `undefined` while the
  // verification chain is still in `commit` / `reveal` phase — the badge
  // renders a placeholder slot instead.
  emojiHash?: Uint8Array;
  // Optional click handler — typically wired to a popup explaining the
  // verification flow.
  onClick?: () => void;
  // Extra class names for the wrapping span.
  class?: string;
}

const FingerprintBadge: Component<FingerprintBadgeProps> = (props) => {
  // No memoization needed — re-deriving 4 emojis from 32 bytes is well under
  // a microsecond, far cheaper than a Solid memo cell.
  const emojis = () => props.emojiHash ? emojiFingerprint(props.emojiHash) : undefined;

  return (
    <span
      class={classNames('conference-fingerprint-badge', props.class)}
      onClick={props.onClick}
    >
      <Show
        when={emojis()}
        fallback={
          <span class="conference-fingerprint-badge__pending" />
        }
      >
        {(list) => (
          <For each={list()}>
            {(emoji) => <span class="conference-fingerprint-badge__emoji">{emoji}</span>}
          </For>
        )}
      </Show>
    </span>
  );
};

export default FingerprintBadge;
