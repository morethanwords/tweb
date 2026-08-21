import {children, createEffect, createMemo, JSX, onCleanup, Show} from 'solid-js';
import {createStore} from 'solid-js/store';
import {Message} from '@layer';
import {i18n} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import ListenerSetter from '@helpers/listenerSetter';
import findUpClassName from '@helpers/dom/findUpClassName';
import noop from '@helpers/noop';
import {IconTsx} from '@components/iconTsx';
import {hideToast, toastNew} from '@components/toast';
import anchorCallback from '@helpers/dom/anchorCallback';
import PopupPremium from '@components/popups/premium';


/**
 * Where a voice row stands in the transcription flow. It starts `idle`; asking for a transcription
 * moves it to `loading`, and the first answer from the server — partial or final — moves it to
 * `transcribed` for good.
 */
export type TranscriptionStatus = 'idle' | 'loading' | 'transcribed';

export type TranscriptionState = {
  status: TranscriptionStatus,
  text: string,
  /** The server is still working on it: keep the dots and the button's outline running. */
  pending: boolean,
  /** The server gave up — the error message stands in for the text. */
  error: boolean,
  /** Only meaningful once `transcribed`: whether the text is showing. */
  expanded: boolean
};

/** All the transcription needs of the row it belongs to: a DOM anchor carrying a live message. */
type TranscribableRow = HTMLElement & {message: Message.message};

/**
 * Folds a `message_transcribed` update into the row's state. A transcription can arrive in pieces,
 * so this runs once per update rather than once per request.
 */
export function reduceTranscribed(
  prev: TranscriptionState,
  update: {text: string, pending?: boolean}
): Partial<TranscriptionState> {
  return {
    status: 'transcribed',
    text: update.text,
    pending: !!update.pending,
    // no text and nothing more coming is how a failure reads on the wire
    error: !update.text && !update.pending,
    // the first answer opens the transcription; after that the reader's own choice stands
    expanded: prev.status === 'transcribed' ? prev.expanded : true
  };
}

function TranscribedText(props: {state: TranscriptionState}) {
  return (
    <div
      class="audio-transcribed-text"
      classList={{
        'is-error': props.state.error,
        'hide': !props.state.expanded
      }}
    >
      <Show when={props.state.error} fallback={props.state.text}>
        {i18n('Chat.Voice.Transribe.Error')}
      </Show>
      <Show when={props.state.pending}>
        {/* three real dots rather than an animated `content`, which only pseudo-elements can do —
          each fades in on its own beat, and they hold the width even while hidden */}
        <span class="audio-transcribing-dots">
          {[1, 2, 3].map((i) => (
            <span class={`audio-transcribing-dots-dot audio-transcribing-dots-dot-${i}`}>.</span>
          ))}
        </span>
      </Show>
    </div>
  );
}

function TranscribeLoader(props: {active: boolean}) {
  return (
    <div class="loader" classList={{active: props.active}}>
      <svg class="audio-transcribe-outline" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 24">
        <rect
          class="audio-transcribe-outline-rect"
          fill="transparent"
          stroke-width="3"
          stroke-linejoin="round"
          rx="6"
          ry="6"
          stroke="var(--message-primary-color)"
          stroke-dashoffset="1"
          stroke-dasharray="32,68"
          width="32"
          height="24"
        />
      </svg>
    </div>
  );
}

function TranscribeButton(props: {
  state: TranscriptionState,
  row: () => TranscribableRow,
  onClick: () => void
}) {
  // The transcribed text cannot live inside the row — that box is a single fixed-height flex line —
  // so it is built under this owner (which keeps it reactive and disposes it with the row) and
  // mounted beside the row the first time there is anything to show. `children` is what turns the
  // component into a node to mount: a component on its own hands back a lazily-evaluated value.
  const hasText = createMemo(() => props.state.status === 'transcribed');
  const text = children(() => hasText() ? <TranscribedText state={props.state} /> : undefined);

  let mounted: HTMLElement;
  createEffect(() => {
    const element = text() as HTMLElement;
    if(!element || element === mounted) {
      return;
    }

    mounted = element;
    const row = props.row();
    // a bubble hangs the row off a `.document-wrapper`; a reply quote nests it inside `.quote-text`
    if(findUpClassName(row, 'document-wrapper')) row.after(element);
    else findUpClassName(row, 'quote-text')?.append(element);
  });

  onCleanup(() => mounted?.remove());

  return (
    <div class="audio-to-text-button" onClick={props.onClick}>
      <IconTsx icon={hasText() && props.state.expanded ? 'up' : 'transcribe'} />
      <TranscribeLoader active={props.state.status === 'loading' || props.state.pending} />
    </div>
  );
}

/**
 * Wires a voice row's transcribe button to `messages.transcribeAudio`. The row owns the state and
 * listens for its own `message_transcribed` updates, so a transcription started anywhere — this
 * button, another client, a cached result — lands on every rendering of that message.
 */
export default function createAudioTranscription(options: {
  listenerSetter: ListenerSetter,
  getRow: () => TranscribableRow
}) {
  const [state, setState] = createStore<TranscriptionState>({
    status: 'idle',
    text: '',
    pending: false,
    error: false,
    expanded: false
  });

  options.listenerSetter.add(rootScope)('message_transcribed', ({peerId, mid, text, pending}) => {
    const {message} = options.getRow();
    if(peerId !== message.peerId || mid !== message.mid) {
      return;
    }

    setState((prev) => reduceTranscribed(prev, {text, pending}));
  });

  const onClick = () => {
    if(state.status === 'transcribed') {
      setState('expanded', (expanded) => !expanded);
      return;
    }

    if(state.status === 'loading') { // already asked — the answer is on its way
      return;
    }

    const {message} = options.getRow();
    if(message.pFlags.is_outgoing) {
      return;
    }

    if(!rootScope.getPremium()) {
      toastNew({
        langPackKey: 'AudioAndVideoTranscription.PremiumAlert',
        langPackArguments: [anchorCallback(() => {
          hideToast();
          PopupPremium.show({feature: 'voice_to_text'});
        })]
      });
      return;
    }

    setState('status', 'loading');
    rootScope.managers.appMessagesManager.transcribeAudio(message).catch(noop);
  };

  return {
    state,
    /** Evaluated inside the row's `Row`, and owns the transcribed text mounted next to it. */
    button: (): JSX.Element => (
      <TranscribeButton state={state} row={options.getRow} onClick={onClick} />
    )
  };
}
