import {ButtonIconTsx} from '@components/buttonIconTsx';
import {previewStyles} from '@components/popups/previewCard';
import Scrollable from '@components/scrollable2';
import {Skeleton} from '@components/skeleton';
import {toastNew} from '@components/toast';
import {copyTextToClipboard} from '@helpers/clipboard';
import prepareTextWithEntitiesForCopying from '@helpers/prepareTextWithEntitiesForCopying';
import {I18nTsx} from '@helpers/solid/i18n';
import classNames from '@helpers/string/classNames';
import {Message, TextWithEntities} from '@layer';
import {WrapRichTextOptions} from '@lib/richTextProcessor/wrapRichText';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {createEffect, createResource, createSignal, JSX, Match, Switch} from 'solid-js';
import {Transition} from 'solid-transition-group';


const ResultSkeleton = (props: {height?: number}) => {
  return (
    <Skeleton.Div
      class={previewStyles.resultSkeleton}
      secondary
      style={props.height ? {height: props.height + 'px'} : undefined}
    />
  );
};

export const Result = (props: {
  title: JSX.Element;
  /** Reactive target language; refetches the translation when it changes */
  language: () => TranslatableLanguageISO;
  message?: Message.message;
  textWithEntities?: TextWithEntities;
  richTextOptions?: Partial<WrapRichTextOptions>;
  wireCaptionClick?: (div: HTMLElement) => void;
}) => {
  const {rootScope, wrapRichText} = useHotReloadGuard();

  const [translation] = createResource(props.language, (lang) =>
    rootScope.managers.appTranslationsManager.translateText({
      ...(props.message ? {peerId: props.message.peerId, mid: props.message.mid} : {text: props.textWithEntities}),
      lang
    })
  );

  let scrollableRef: HTMLDivElement;
  const [skeletonHeight, setSkeletonHeight] = createSignal<number>();

  // Remember the rendered height so the skeleton keeps the size of the previous result
  // while re-translating (e.g. after switching the language)
  createEffect(() => {
    if(translation.state !== 'ready' && scrollableRef?.isConnected) {
      setSkeletonHeight(scrollableRef.clientHeight);
    }
  });

  const onCopyClick = async() => {
    if(translation.state !== 'ready') return;
    const {text, html} = prepareTextWithEntitiesForCopying(translation());
    try {
      await copyTextToClipboard(text, html, {rethrow: true});
      toastNew({langPackKey: 'TextCopied'});
    } catch{
      toastNew({langPackKey: 'TextCopyFailed'});
    }
  };

  return (
    <>
      <div class={previewStyles.resultHeader}>
        <div class={previewStyles.resultTitleWrapper}>
          {props.title}
          <ButtonIconTsx
            class={previewStyles.copyButton}
            classList={{
              [previewStyles.hidden]: translation.state !== 'ready'
            }}
            icon='copy'
            onClick={onCopyClick}
          />
        </div>
      </div>
      <div class={previewStyles.resultContent}>
        <Transition name='fade-2' mode='outin'>
          <Switch>
            <Match when={translation.state === 'ready' && translation()} keyed>
              {(text) => (
                <Scrollable ref={scrollableRef} relative class={previewStyles.richTextScrollable} withBorders='manual'>
                  <div
                    class={classNames(previewStyles.richTextScrollableContent, 'spoilers-container')}
                    dir='auto'
                    ref={(el) => props.wireCaptionClick?.(el)}
                  >
                    {wrapRichText(text.text, {...props.richTextOptions, entities: text.entities})}
                  </div>
                </Scrollable>
              )}
            </Match>
            <Match when={translation.state === 'pending' || translation.state === 'refreshing'}>
              <ResultSkeleton height={skeletonHeight()} />
            </Match>
            <Match when>
              <div class={previewStyles.error}>
                <I18nTsx key='Translate.Error' />
              </div>
            </Match>
          </Switch>
        </Transition>
      </div>
    </>
  );
};
