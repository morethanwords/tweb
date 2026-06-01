import PopupElement, {createPopup, PopupContext} from '@components/popups/indexTsx';
import {createEffect, createSignal, JSX, onCleanup, Show, untrack, useContext} from 'solid-js';
import documentFragmentToNodes from '@helpers/dom/documentFragmentToNodes';
import classNames from '@helpers/string/classNames';
import usePeerTranslation from '@hooks/usePeerTranslation';
import {Message, TextWithEntities} from '@layer';
import {i18n} from '@lib/langPack';
import wrapRichText, {WrapRichTextOptions} from '@lib/richTextProcessor/wrapRichText';
import {onMediaCaptionClick} from '@components/appMediaViewer';
import {pickLanguage} from '@components/chat/translation';
import {putPreloader} from '@components/putPreloader';
import Section from '@components/section';
import {TranslatableMessageTsx} from '@components/translatableMessage';
import Scrollable, {ScrollableContextValue} from '@components/scrollable2';

export default function showTranslatePopup(options: {
  peerId: PeerId,
  message?: Message.message,
  textWithEntities?: TextWithEntities,
  detectedLanguage: TranslatableLanguageISO
}): void {
  // Collected from media-caption clicks (the old `hideWithCallback`); drained
  // after the close animation via `onCloseAfterTimeout`.
  const deferredCloseCallbacks: (() => void)[] = [];

  function Inner() {
    const context = useContext(PopupContext);
    const middleware = untrack(() => context.middlewareHelper).get();

    let scrollableContext: ScrollableContextValue;

    const peerTranslation = usePeerTranslation(options.peerId);

    let originalTextWithEntities: TextWithEntities = options.textWithEntities;
    if(options.message) {
      originalTextWithEntities = {
        _: 'textWithEntities',
        text: options.message.message,
        entities: options.message.totalEntities
      };
    }

    const richTextOptions: WrapRichTextOptions = {
      middleware,
      textColor: 'primary-text-color'
    };

    const WrappedMessage = (props: {children: JSX.Element, limited?: boolean}) => {
      let div: HTMLDivElement;
      const ret = (
        <div
          ref={div}
          class={classNames('popup-translate-text', 'spoilers-container', props.limited && 'is-limited')}
          dir="auto"
        >
          {props.children}
        </div>
      );

      const onClick = (e: MouseEvent) => {
        const callback = div && onMediaCaptionClick(div, e);
        if(!callback) {
          return;
        }

        div.removeEventListener('click', onClick, {capture: true});
        deferredCloseCallbacks.push(callback);
        context.hide();
      };

      div.addEventListener('click', onClick, {capture: true});
      onCleanup(() => div.removeEventListener('click', onClick, {capture: true}));
      return ret;
    };

    const wrap = (textWithEntities: TextWithEntities, limit?: number) => {
      const [limiting, setLimiting] = createSignal(!!limit && textWithEntities.text.length > limit);
      const [text, setText] = createSignal<JSX.Element>();

      createEffect(() => {
        // const _text = limiting() ? textWithEntities.text.slice(0, limit).replace(/\n/g, ' ')/*  + '...' */ : textWithEntities.text;
        const text = wrapRichText(textWithEntities.text, {
          ...richTextOptions,
          entities: textWithEntities.entities,
          noTextFormat: limiting()
          // noLinebreaks: limiting()
        });

        setText(documentFragmentToNodes(text));
      });

      return (
        <WrappedMessage limited={limiting()}>
          <Show when={limiting()} fallback={text()}>
            <span class="popup-translate-text-text">
              {text()}
            </span>
            <span
              class="popup-translate-text-more primary"
              onClick={() => {
                setLimiting(false);
                setTimeout(() => {
                  scrollableContext?.onSizeChange();
                }, 0);
              }}
            >
              {i18n('Show')}
            </span>
          </Show>
        </WrappedMessage>
      );
    };

    const preloader = putPreloader(undefined, true);

    const [loading, setLoading] = createSignal(true);
    const loadPromises: Promise<void>[] = [];
    const translatable = (
      <TranslatableMessageTsx
        peerId={options.peerId}
        message={options.message}
        textWithEntities={options.textWithEntities}
        richTextOptions={{...richTextOptions, loadPromises}}
        enabled
      />
    );

    Promise.all(loadPromises).then(() => {
      if(!middleware()) {
        return;
      }

      setLoading(false);
      setTimeout(() => {
        scrollableContext?.onSizeChange();
      }, 0);
    });

    return (
      <>
        <PopupElement.Header>
          <PopupElement.CloseButton />
          <PopupElement.Title>{i18n('Translation')}</PopupElement.Title>
        </PopupElement.Header>
        <PopupElement.Body>
          <Scrollable
            withBorders="both"
            contextRef={(ctx) => scrollableContext = ctx}
          >
            <Section noShadow name={`Language.${options.detectedLanguage}`}>
              {wrap(originalTextWithEntities, 120)}
            </Section>
            <Section noShadow name={`Language.${peerTranslation.language()}`}>
              <Show
                when={!loading()}
                fallback={(
                  <div class="popup-translate-preloader">
                    {preloader}
                  </div>
                )}
              >
                <WrappedMessage>{translatable}</WrappedMessage>
              </Show>
            </Section>
          </Scrollable>
        </PopupElement.Body>
        <PopupElement.Buttons>
          <PopupElement.Button langKey="OK" />
          <PopupElement.Button
            langKey="Telegram.LanguageViewController"
            confirm
            callback={() => {
              pickLanguage(false).then((language) => {
                peerTranslation.setLanguage(language);
              });
              return false;
            }}
          />
        </PopupElement.Buttons>
      </>
    );
  }

  createPopup(() => (
    <PopupElement
      class="popup-translate"
      closable
      onCloseAfterTimeout={() => {
        deferredCloseCallbacks.splice(0).forEach((cb) => cb());
      }}
    >
      <Inner />
    </PopupElement>
  ));
}
