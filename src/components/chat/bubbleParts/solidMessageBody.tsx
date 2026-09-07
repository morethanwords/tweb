import {RichMessageBubble} from '@components/chat/bubbles/richMessage';
import {
  createMessageTextRevealCoordinator,
  MessageTextLayoutEvent,
  MessageTextPhase,
  MessageTextRevealEvent,
  SolidMessageTextBody
} from '@components/chat/bubbleParts/solidMessageText';
import {Middleware} from '@helpers/middleware';
import {modifyAckedPromise} from '@helpers/modifyAckedResult';
import usePeerTranslation from '@hooks/usePeerTranslation';
import {Message, RichMessage, TextWithEntities} from '@layer';
import {flattenRichMessageContent, richMessageToPage} from '@lib/richMessage';
import {WrapRichTextOptions} from '@lib/richTextProcessor/wrapRichText';
import wrapTextWithEntities from '@lib/richTextProcessor/wrapTextWithEntities';
import rootScope from '@lib/rootScope';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import {getMessageTranslationSourceToken, processMessageForTranslation} from '@stores/peerLanguage';
import {Accessor, createEffect, createMemo, createSignal, JSX, onCleanup, Show, untrack} from 'solid-js';
import {render} from 'solid-js/web';
import styles from './solidMessageBody.module.scss';

export type SolidMessageBodySnapshot = {
  sourceRevision: number,
  phase: MessageTextPhase,
  message: Message.message,
  text: TextWithEntities,
  richMessage?: RichMessage
};

export type SolidMessageBodyTranslationOptions = {
  enabled: boolean,
  summarizing?: Accessor<boolean>,
  createSummaryHeader?: (message: Message.message) => HTMLElement,
  onCommit?: (commit: () => void) => void,
  onError?: (error: ApiError) => void
};

export type CreateSolidMessageBodyOptions = {
  middleware?: Middleware,
  richTextOptions?: WrapRichTextOptions,
  translation?: SolidMessageBodyTranslationOptions,
  reducedMotion?: Accessor<boolean>,
  scrollToElement?: (element: HTMLElement) => void,
  onLayout?: (event: MessageTextLayoutEvent) => void,
  onReveal?: (event: MessageTextRevealEvent) => void,
  onFinalized?: (event: MessageTextRevealEvent) => void
};

export type SolidMessageBodyController = {
  element: HTMLElement,
  update: (snapshot: SolidMessageBodySnapshot) => boolean,
  finalize: (message: Message.message, sourceRevision?: number) => boolean,
  setPolicy: (richTextOptions?: WrapRichTextOptions) => void,
  getSnapshot: () => SolidMessageBodySnapshot,
  dispose: () => void
};

type TextTranslationDisplay = {
  kind: 'text',
  sourceRevision: number,
  value: TextWithEntities,
  summary: boolean
};

type RichTranslationDisplay = {
  kind: 'rich',
  sourceRevision: number,
  value: RichMessage,
  summary: false
};

type TranslationDisplay = TextTranslationDisplay | RichTranslationDisplay;

type PendingTranslation = {
  generation: number,
  requestKey: string,
  sourceRevision: number,
  display?: TranslationDisplay,
  error?: ApiError
};

const EMPTY_TEXT_WITH_ENTITIES: TextWithEntities = {
  _: 'textWithEntities',
  text: '',
  entities: []
};

function copyTextWithEntities(value: TextWithEntities): TextWithEntities {
  return {
    _: 'textWithEntities',
    text: value?.text || '',
    entities: value?.entities?.map((entity) => ({...entity})) || []
  };
}

export function getSolidMessageBodyText(message: Message.message): TextWithEntities {
  return copyTextWithEntities({
    _: 'textWithEntities',
    text: message.message || '',
    entities: message.totalEntities || message.entities || []
  });
}

export function makeSolidMessageBodySnapshot(
  message: Message.message,
  sourceRevision: number,
  phase: MessageTextPhase = message.pFlags.currentlyTyping ? 'streaming' : 'final'
): SolidMessageBodySnapshot {
  return {
    sourceRevision,
    phase,
    message,
    text: getSolidMessageBodyText(message),
    richMessage: message.rich_message
  };
}

function SolidMessageBody(props: {
  snapshot: Accessor<SolidMessageBodySnapshot>,
  richTextOptions: Accessor<WrapRichTextOptions | undefined>,
  translation?: SolidMessageBodyTranslationOptions,
  reducedMotion?: Accessor<boolean>,
  scrollToElement?: (element: HTMLElement) => void,
  onLayout?: (event: MessageTextLayoutEvent) => void,
  onReveal?: (event: MessageTextRevealEvent) => void,
  onTextFinalized?: (event: MessageTextRevealEvent) => void
}): JSX.Element {
  const translation = props.translation?.enabled ? usePeerTranslation(props.snapshot().message.peerId) : undefined;
  const [display, setDisplay] = createSignal<TranslationDisplay>();
  const [pendingTranslation, setPendingTranslation] = createSignal<PendingTranslation>();
  const [loading, setLoading] = createSignal(false);
  let requestGeneration = 0;
  let activeRequestKey: string;
  let activeDetectionKey: string;

  const sourceText = createMemo(() => {
    const snapshot = props.snapshot();
    return snapshot.richMessage ?
      copyTextWithEntities(flattenRichMessageContent(snapshot.richMessage)) :
      snapshot.text;
  });

  const commit = (generation: number, callback: () => void) => {
    const guarded = () => {
      if(generation !== requestGeneration) return;
      callback();
    };
    if(props.translation?.onCommit) props.translation.onCommit(guarded);
    else guarded();
  };

  const clearTranslation = () => {
    activeRequestKey = undefined;
    const generation = ++requestGeneration;
    setPendingTranslation(undefined);
    // Returning to the source changes bubble height too. Keep it in the same
    // scroll-preserving batch as translated results, without tracking display.
    if(untrack(display)) commit(generation, () => setDisplay(undefined));
    setLoading(false);
  };

  createEffect(() => {
    const snapshot = props.snapshot();
    const summarizing = !!props.translation?.summarizing?.();
    const canDetect = !!translation &&
      snapshot.phase !== 'streaming' &&
      Number.isInteger(snapshot.message.mid);
    const detectionKey = canDetect ? [
      snapshot.message.peerId,
      snapshot.message.mid,
      snapshot.sourceRevision
    ].join(':') : undefined;
    // This value also gates the request, so pass the same flattened source to
    // language detection instead of walking a rich block tree twice.
    const source = canDetect ? sourceText() : undefined;
    if(detectionKey && activeDetectionKey !== detectionKey) {
      activeDetectionKey = detectionKey;
      processMessageForTranslation(snapshot.message.peerId, snapshot.message.mid, {
        sourceText: source.text,
        sourceToken: getMessageTranslationSourceToken(snapshot.message, source.text)
      }).catch(() => {});
    }

    // Rich flattening is proportional to the whole block tree. Keep it behind
    // the phase/mid gate so streaming revisions never pay that cost.
    const canRequest = canDetect && !!source?.text;
    const language = canRequest ? translation.language() : undefined;
    const enabled = canRequest && (summarizing || translation.enabled());
    if(!enabled) return clearTranslation();

    const requestKey = [
      snapshot.message.peerId,
      snapshot.message.mid,
      snapshot.sourceRevision,
      summarizing ? 'summary' : snapshot.richMessage ? 'rich-translation' : 'translation',
      language || ''
    ].join(':');
    if(activeRequestKey === requestKey) return;

    clearTranslation();
    activeRequestKey = requestKey;
    const generation = requestGeneration;

    void (async() => {
      try {
        const translateRich = !!snapshot.richMessage && !summarizing;
        const acknowledged = await (summarizing ?
          modifyAckedPromise(rootScope.managers.acknowledged.appTranslationsManager.summarizeText({
            peerId: snapshot.message.peerId,
            mid: snapshot.message.mid,
            lang: translation.enabled() ? language : undefined
          })) :
          translateRich ?
            modifyAckedPromise(rootScope.managers.acknowledged.appTranslationsManager.translateRichMessage({
              peerId: snapshot.message.peerId,
              mid: snapshot.message.mid,
              lang: language as TranslatableLanguageISO
            })) :
            modifyAckedPromise(rootScope.managers.acknowledged.appTranslationsManager.translateText({
              peerId: snapshot.message.peerId,
              mid: snapshot.message.mid,
              lang: language as TranslatableLanguageISO
            })));
        if(generation !== requestGeneration) return;

        if(!acknowledged.cached) setLoading(true);
        const result = await acknowledged.result;
        if(generation !== requestGeneration) return;

        if(!result) {
          setPendingTranslation({
            generation,
            requestKey,
            sourceRevision: snapshot.sourceRevision
          });
          return;
        }

        const display: TranslationDisplay = translateRich ? {
          kind: 'rich',
          sourceRevision: snapshot.sourceRevision,
          value: result as RichMessage,
          summary: false
        } : {
          kind: 'text',
          sourceRevision: snapshot.sourceRevision,
          value: wrapTextWithEntities(result as TextWithEntities),
          summary: summarizing
        };
        setPendingTranslation({
          generation,
          requestKey,
          sourceRevision: snapshot.sourceRevision,
          display
        });
        setLoading(false);
      } catch(error) {
        if(generation !== requestGeneration) return;
        setPendingTranslation({
          generation,
          requestKey,
          sourceRevision: snapshot.sourceRevision,
          error: error as ApiError
        });
        setLoading(false);
      }
    })();
  });

  createEffect(() => {
    const snapshot = props.snapshot();
    const pending = pendingTranslation();
    if(
      snapshot.phase !== 'final' ||
      !pending ||
      pending.sourceRevision !== snapshot.sourceRevision ||
      pending.requestKey !== activeRequestKey
    ) return;

    commit(pending.generation, () => {
      setDisplay(pending.display);
      setPendingTranslation(undefined);
      setLoading(false);
      if(pending.error) props.translation?.onError?.(pending.error);
    });
  });

  onCleanup(() => ++requestGeneration);

  const activeDisplay = createMemo(() => {
    const snapshot = props.snapshot();
    const translated = display();
    return snapshot.phase === 'final' && translated?.sourceRevision === snapshot.sourceRevision ?
      translated :
      undefined;
  });
  const activeTextDisplay = createMemo(() => {
    const translated = activeDisplay();
    return translated?.kind === 'text' ? translated : undefined;
  });
  const activeRichDisplay = createMemo(() => {
    const translated = activeDisplay();
    return translated?.kind === 'rich' ? translated : undefined;
  });

  const textSnapshot = createMemo(() => {
    const snapshot = props.snapshot();
    const translated = activeTextDisplay();
    return {
      sourceRevision: snapshot.sourceRevision,
      source: snapshot.richMessage ? EMPTY_TEXT_WITH_ENTITIES : sourceText(),
      phase: snapshot.richMessage ? 'final' as const : snapshot.phase,
      display: translated
    };
  });
  let cachedPageRevision: number;
  let cachedRichMessage: RichMessage;
  let cachedPage: ReturnType<typeof richMessageToPage>;
  const displayedRichMessage = createMemo(() => activeRichDisplay()?.value || props.snapshot().richMessage);
  const page = createMemo(() => {
    const snapshot = props.snapshot();
    const richMessage = displayedRichMessage();
    if(!richMessage) return;
    if(cachedPageRevision !== snapshot.sourceRevision || cachedRichMessage !== richMessage) {
      cachedPageRevision = snapshot.sourceRevision;
      cachedRichMessage = richMessage;
      cachedPage = richMessageToPage(richMessage);
    }
    return cachedPage;
  });
  const richRevealCoordinator = createMessageTextRevealCoordinator({
    sourceRevision: () => props.snapshot().sourceRevision,
    phase: () => props.snapshot().phase,
    active: () => !!props.snapshot().richMessage,
    reducedMotion: props.reducedMotion,
    onReveal: props.onReveal,
    onFinalized: props.onTextFinalized
  });
  const showingTranslatedText = () => !!page() && !!activeTextDisplay();
  const summaryHeader = createMemo(() => {
    const translated = activeTextDisplay();
    if(!translated?.summary) return;
    return props.translation?.createSummaryHeader?.(props.snapshot().message);
  });

  return (
    <>
      <Show when={summaryHeader()}>{(header) => <div class={styles.SummaryHeader}>{header()}</div>}</Show>
      <span
        classList={{'text-loading': loading()}}
        style={{display: page() && !showingTranslatedText() ? 'none' : undefined}}
      >
        <SolidMessageTextBody
          snapshot={textSnapshot}
          richTextOptions={props.richTextOptions}
          reducedMotion={props.reducedMotion}
          inline
          onLayout={props.onLayout}
          onReveal={(event) => {
            if(!page()) props.onReveal?.(event);
          }}
          onFinalized={(event) => {
            if(!page()) props.onTextFinalized?.(event);
          }}
        />
      </span>
      <Show when={!showingTranslatedText() && page()}>{(currentPage) => (
        <div style={{display: 'contents'}}>
          <RichMessageBubble
            message={() => props.snapshot().message}
            richMessage={() => displayedRichMessage()!}
            page={currentPage}
            sourceRevision={() => props.snapshot().sourceRevision}
            phase={() => props.snapshot().phase}
            richTextOptions={props.richTextOptions}
            revealCoordinator={richRevealCoordinator}
            onTextLayout={props.onLayout}
            scrollToElement={props.scrollToElement}
          />
        </div>
      )}</Show>
    </>
  );
}

/** Stable Solid owner for the complete mutable message body inside a legacy bubble shell. */
export function createSolidMessageBody(
  element: HTMLElement,
  initialSnapshot: SolidMessageBodySnapshot,
  options: CreateSolidMessageBodyOptions = {}
): SolidMessageBodyController {
  const [snapshot, setSnapshot] = createSignal(initialSnapshot, {equals: false});
  const [richTextOptions, setRichTextOptions] = createSignal(options.richTextOptions, {equals: false});
  let currentSnapshot = initialSnapshot;
  let disposed = false;

  element.classList.add(styles.Host);

  const disposeRender = render(() => (
    <SolidJSHotReloadGuardProvider>
      <SolidMessageBody
        snapshot={snapshot}
        richTextOptions={richTextOptions}
        translation={options.translation}
        reducedMotion={options.reducedMotion}
        scrollToElement={options.scrollToElement}
        onLayout={options.onLayout}
        onReveal={options.onReveal}
        onTextFinalized={(event) => {
          if(currentSnapshot.phase !== 'finalizing' || currentSnapshot.sourceRevision !== event.sourceRevision) return;
          currentSnapshot = {...currentSnapshot, phase: 'final'};
          setSnapshot(currentSnapshot);
          options.onFinalized?.(event);
        }}
      />
    </SolidJSHotReloadGuardProvider>
  ), element);

  const dispose = () => {
    if(disposed) return;
    disposed = true;
    disposeRender();
    element.classList.remove(styles.Host);
  };
  if(options.middleware) options.middleware.onDestroy(dispose);

  const update = (next: SolidMessageBodySnapshot) => {
    if(disposed || next.sourceRevision < currentSnapshot.sourceRevision) return false;
    currentSnapshot = next;
    setSnapshot(next);
    return true;
  };

  return {
    element,
    update,
    finalize: (message, sourceRevision = currentSnapshot.sourceRevision + 1) => update(
      makeSolidMessageBodySnapshot(message, sourceRevision, 'finalizing')
    ),
    setPolicy: (nextRichTextOptions) => {
      if(disposed) return;
      setRichTextOptions(nextRichTextOptions);
    },
    getSnapshot: () => currentSnapshot,
    dispose
  };
}
