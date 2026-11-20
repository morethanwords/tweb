import {createSignal, For, Show} from 'solid-js';
import A11yButton from '@components/a11yButton';
import {useMediaEditorContext} from '@components/mediaEditor/context';
import useNestedNavigation from '@components/mediaEditor/native/useNestedNavigation';
import {nativeVideoSelectionKey} from '@components/mediaEditor/native/nativeVideoSession';
import type {NativeVideoQualityChoiceV1} from '@components/mediaEditor/native/videoQualityPolicy';
import Modes from '@config/modes';
import I18n, {i18n, type LangPackKey} from '@lib/langPack';
import styles from '@components/mediaEditor/native/nativeVideoQualityControl.module.scss';

export function nativeVideoReasonKey(reason: string): LangPackKey {
  if(reason === 'checking') return 'MediaEditor.VideoQuality.Checking';
  if(reason === 'unsupportednativecalibration') return 'MediaEditor.VideoQuality.AndroidUnavailable';
  if(reason === 'source-color') return 'MediaEditor.VideoQuality.ColorUnavailable';
  if(reason?.startsWith('audio-')) return 'MediaEditor.VideoQuality.AudioUnavailable';
  if(reason === 'source-fps' || reason === 'source-bitrate' || reason?.startsWith('source-')) return 'MediaEditor.VideoQuality.MetadataUnavailable';
  if(reason === 'video-encode-capability') return 'MediaEditor.VideoQuality.CodecUnavailable';
  return 'MediaEditor.VideoQuality.EditsUnavailable';
}

function label(choice: NativeVideoQualityChoiceV1) {
  return choice.label.kind === 'original' ? i18n('MediaEditor.Original') :
    choice.label.kind === 'desktop' ? choice.label.text : `${choice.label.badge} ${choice.label.size}`;
}

/** Non-modal disclosure: native disabled buttons + visible localized reasons.
 * No new key routing or focus behavior outside the opt-in accessibility layer.
 */
export default function NativeVideoQualityControl() {
  const context = useMediaEditorContext();
  const session = context.nativeVideo;
  if(!session) return;
  const [open, setOpen] = createSignal(false);
  let opener: HTMLElement;
  const close = () => { setOpen(false); if(Modes.a11y) opener?.focus(); };
  useNestedNavigation(open, close);
  const selectedChoice = () => session.options().find(option =>
    nativeVideoSelectionKey(option.choice.selection) === nativeVideoSelectionKey(context.mediaState.nativeVideoQuality));
  const reason = () => {
    const decision = session.selected();
    return decision && decision.status !== 'ready' ? nativeVideoReasonKey(decision.reason) : undefined;
  };
  return <div class={styles.wrap} data-native-video-quality={session.style}>
    <A11yButton ref={opener} class={styles.toggle} aria-label={I18n.format('Quality', true)} aria-expanded={open()} onClick={() => setOpen(!open())}>
      {selectedChoice() ? label(selectedChoice().choice) : i18n('Quality')}
    </A11yButton>
    <Show when={open()}>
      <div class={styles.options} role="group" aria-label={I18n.format('Quality', true)}>
        <Show when={session.options().length} fallback={<p>{i18n(session.source() ? 'MediaEditor.VideoQuality.MetadataUnavailable' : 'MediaEditor.VideoQuality.Checking')}</p>}>
          <For each={session.options()}>{option => <div class={styles.row}>
            <A11yButton class={styles.option} disabled={option.decision.status !== 'ready'}
              aria-pressed={nativeVideoSelectionKey(option.choice.selection) === nativeVideoSelectionKey(context.mediaState.nativeVideoQuality)}
              onClick={() => { if(session.select(option.choice.selection)) close(); }}>
              {label(option.choice)}
            </A11yButton>
            <Show when={option.decision.status !== 'ready'}>
              <span class={styles.reason}>{i18n(nativeVideoReasonKey(option.decision.status === 'ready' ? 'checking' : option.decision.reason))}</span>
            </Show>
          </div>}</For>
        </Show>
        <A11yButton class={styles.option} onClick={close}>{i18n('Close')}</A11yButton>
      </div>
    </Show>
    <div class={styles.status} role="status" aria-live="polite"><Show when={reason()} keyed>{key => i18n(key)}</Show></div>
  </div>;
}
