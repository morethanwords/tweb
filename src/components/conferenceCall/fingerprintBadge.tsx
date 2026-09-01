import {Component, For, Show} from 'solid-js';
import classNames from '@helpers/string/classNames';
import {emojiFingerprint} from '@lib/calls/e2e/emojiFingerprint';
import I18n from '@lib/langPack';

export interface FingerprintBadgeProps {
  emojiHash?: Uint8Array;
  class?: string;
}

const FingerprintBadge: Component<FingerprintBadgeProps> = (props) => {
  const emojis = () => props.emojiHash ? emojiFingerprint(props.emojiHash) : undefined;

  const labelText = () => I18n.format(
    emojis() ? 'ConferenceCall.Fingerprint.Verified' : 'ConferenceCall.Fingerprint.Pending',
    true
  );
  const accessibleLabelText = () => {
    const list = emojis();
    return list ? `${labelText()}: ${list.join(' ')}` : labelText();
  };

  const visual = () => (
    <span class="conference-fingerprint-badge__visual" aria-hidden="true">
      <Show
        when={emojis()}
        fallback={<span class="conference-fingerprint-badge__pending" />}
      >
        {(list) => (
          <For each={list()}>
            {(emoji) => <span class="conference-fingerprint-badge__emoji">{emoji}</span>}
          </For>
        )}
      </Show>
    </span>
  );

  return (
    <span
      class={classNames('conference-fingerprint', props.class)}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={accessibleLabelText()}
    >
      <span class="conference-fingerprint-badge">
        {visual()}
      </span>
    </span>
  );
};

export default FingerprintBadge;
