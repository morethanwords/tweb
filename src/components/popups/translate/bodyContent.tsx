import {AutoHeight} from '@components/autoHeight';
import Button from '@components/buttonTsx';
import {PopupContext} from '@components/popups/indexTsx';
import {Divider, Original, previewStyles} from '@components/popups/previewCard';
import ripple from '@components/ripple';
import Scrollable, {ScrollableContextValue} from '@components/scrollable2';
import Space from '@components/space';
import toastCopyRestricted from '@components/chat/toastCopyRestricted';
import cancelEvent from '@helpers/dom/cancelEvent';
import {getCodeBlockClickTarget} from '@helpers/dom/codeBlockClick';
import {bindActiveWindowListener} from '@helpers/appWindow';
import {keepMe} from '@helpers/keepMe';
import debounce from '@helpers/schedulers/debounce';
import {I18nTsx} from '@helpers/solid/i18n';
import {requestRAF} from '@helpers/solid/requestRAF';
import {useObserveResize} from '@hooks/useObserveResize';
import {TextWithEntities} from '@layer';
import {flattenRichMessageContent} from '@lib/richMessage';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {createSignal, onCleanup, useContext} from 'solid-js';
import {TransitionGroup} from 'solid-transition-group';
import styles from './bodyContent.module.scss';
import type {TranslatePopupOptions} from './index';
import {Result} from './parts';


keepMe(ripple);

export function TranslatePopupBodyContent(props: {
  options: TranslatePopupOptions;
  /** Drained by the popup shell after the close animation */
  deferredCloseCallbacks: (() => void)[];
}) {
  const options = props.options;
  const deferredCloseCallbacks = props.deferredCloseCallbacks;

  const {usePeerTranslation, pickLanguage, onMediaCaptionClick} = useHotReloadGuard();

  const context = useContext(PopupContext);

  const peerTranslation = usePeerTranslation(options.peerId);

  const [isAppearing, setIsAppearing] = createSignal(true);

  let originalTextWithEntities: TextWithEntities = options.textWithEntities;
  if(options.message) {
    // A rich message keeps its content out of `message`, so reading that field alone would
    // preview an empty original. This card is a compact side-by-side, not an Instant View
    // surface, so the blocks are flattened the same way the translation source is.
    originalTextWithEntities = options.message.rich_message ?
      flattenRichMessageContent(options.message.rich_message) :
      {
        _: 'textWithEntities',
        text: options.message.message,
        entities: options.message.totalEntities
      };
  }

  // Closes the popup when a media-caption part (e.g. a spoiler-wrapped media link)
  // is clicked, deferring the actual navigation until after the close animation.
  const wireCaptionClick = (div: HTMLElement) => {
    const onClick = (e: MouseEvent) => {
      const callback = onMediaCaptionClick(div, e);
      if(!callback) {
        return;
      }

      div.removeEventListener('click', onClick, {capture: true});
      deferredCloseCallbacks.push(callback);
      context.hide();
    };

    div.addEventListener('click', onClick, {capture: true});
    onCleanup(() => div.removeEventListener('click', onClick, {capture: true}));
  };

  // A chat or a message that forbids copying: the texts are shown, never copied - neither a selection
  // that takes them in (the guard of the chat's bubbles does not reach a popup), Select All's whole page
  // included, whose copy the document gets, nor a code by its copy button or a press, as in the chat
  const keepFromCopying = (div: HTMLDivElement) => {
    if(!options.noForwards) return;
    const refuse = (e: Event) => {
      cancelEvent(e);
      toastCopyRestricted(options.peerId);
    };
    // * the document the app is in (a Document PiP window's included), as the bubbles' guard does - not
    // * the element's own yet, which is a template's until it is put in
    const onCopy = (e: ClipboardEvent) => {
      const selection = div.ownerDocument.getSelection();
      for(let i = 0; i < (selection?.rangeCount ?? 0); ++i) {
        if(selection.getRangeAt(i).intersectsNode(div)) {
          refuse(e);
          return;
        }
      }
    };
    const onCodeCopy = (e: MouseEvent) => {
      const codeTarget = getCodeBlockClickTarget(e.target);
      if(codeTarget && !codeTarget.isWrapToggle) refuse(e);
    };

    const unbind = [
      bindActiveWindowListener((w) => w.document, 'copy', onCopy, {capture: true}),
      bindActiveWindowListener((w) => w.document, 'cut', onCopy, {capture: true})
    ];
    div.addEventListener('click', onCodeCopy, {capture: true});
    onCleanup(() => {
      unbind.forEach((callback) => callback());
      div.removeEventListener('click', onCodeCopy, {capture: true});
    });
  };

  const onLanguageClick = () => {
    pickLanguage(false).then((language) => {
      peerTranslation.setLanguage(language);
    });
  };

  const [scrollableEl, setScrollableEl] = createSignal<HTMLDivElement>();
  const [scrollableContentEl, setScrollableContentEl] = createSignal<HTMLDivElement>();
  let scrollableContextRef!: ScrollableContextValue;

  const updateScrollable = debounce(() => {
    scrollableContextRef?.onSizeChange();
  }, 100, false, true);

  useObserveResize(scrollableContentEl, updateScrollable);
  useObserveResize(scrollableEl, updateScrollable);

  return (
    <div class={styles.bodyContent} ref={keepFromCopying}>
      <Scrollable
        tabIndex={0}
        ref={setScrollableEl}
        class={styles.scrollable}
        relative
        withBorders='both'
        contextRef={(value) => void (scrollableContextRef = value)}
      >
        <div class={styles.scrollableContent}>
          <AutoHeight ref={setScrollableContentEl} outerClass={styles.card} overflowHidden>
            <TransitionGroup
              name='fade-2'
              moveClass='t-move-std'
              onBeforeExit={el => {
                el.classList.add(styles.exit);
              }}
            >
              <Original
                title={
                  <I18nTsx
                    key='AiEditor.TranslateFrom'
                    args={[<I18nTsx key={`Language.${options.detectedLanguage}`} />]}
                  />
                }
                text={originalTextWithEntities}
                interactive
                wireContent={wireCaptionClick}
                isAppearing={isAppearing()}
                onMeasured={() => requestRAF(() => setIsAppearing(false))}
              />
              <Divider />
              <Result
                message={options.message}
                textWithEntities={options.textWithEntities}
                language={peerTranslation.language()}
                wireCaptionClick={wireCaptionClick}
                noCopy={options.noForwards}
                title={
                  <I18nTsx
                    class={previewStyles.resultTitle}
                    key='AiEditor.TranslateTo'
                    args={[
                      <span class={previewStyles.resultLanguage} use:ripple onClick={onLanguageClick}>
                        <I18nTsx key={`Language.${peerTranslation.language()}`} />
                      </span>
                    ]}
                  />
                }
              />
            </TransitionGroup>
          </AutoHeight>
        </div>
      </Scrollable>
      <Space amount='0.5rem' />
      <div class={styles.footerButtons}>
        <Button
          class={styles.okButton}
          primaryFilled
          onClick={() => context.hide()}
        >
          <I18nTsx key='OK' />
        </Button>
      </div>
    </div>
  );
}
