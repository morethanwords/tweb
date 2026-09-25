import {ButtonIconTsx} from '@components/buttonIconTsx';
import {openInstantViewInAppBrowser} from '@components/browser';
import {InstantViewBlocks} from '@components/instantView';
import {instantViewStyles} from '@components/instantViewFormatting';
import {previewStyles} from '@components/popups/previewCard';
import Scrollable, {ScrollableContextValue} from '@components/scrollable2';
import {Skeleton} from '@components/skeleton';
import {toastNew} from '@components/toast';
import {copyTextToClipboard} from '@helpers/clipboard';
import prepareTextWithEntitiesForCopying from '@helpers/prepareTextWithEntitiesForCopying';
import createMiddleware from '@helpers/solid/createMiddleware';
import {I18nTsx} from '@helpers/solid/i18n';
import {requestRAF} from '@helpers/solid/requestRAF';
import classNames from '@helpers/string/classNames';
import {Message, RichMessage, TextWithEntities} from '@layer';
import {flattenRichMessageContent, richMessageToPage} from '@lib/richMessage';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import {createEffect, createResource, createSignal, JSX, Match, Switch} from 'solid-js';
import {Transition} from 'solid-transition-group';

type TranslationResult =
  {type: 'text', value: TextWithEntities} |
  {type: 'rich', value: RichMessage};

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
  language: TranslatableLanguageISO;
  message?: Message.message;
  textWithEntities?: TextWithEntities;
  wireCaptionClick?: (div: HTMLElement) => void;
}) => {
  const {rootScope, wrapRichText} = useHotReloadGuard();

  const [translation] = createResource<TranslationResult, TranslatableLanguageISO>(
    () => props.language,
    async(lang) => {
      if(props.message?.rich_message) {
        return {
          type: 'rich',
          value: await rootScope.managers.appTranslationsManager.translateRichMessage({
            peerId: props.message.peerId,
            mid: props.message.mid,
            lang
          })
        };
      }

      return {
        type: 'text',
        value: await rootScope.managers.appTranslationsManager.translateText({
          ...(props.message ? {peerId: props.message.peerId, mid: props.message.mid} : {text: props.textWithEntities}),
          lang
        })
      };
    }
  );

  let scrollableRef: HTMLDivElement, scrollableContextRef: ScrollableContextValue;
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
    const translated = translation();
    if(!translated?.value) return;
    const textWithEntities = translated.type === 'rich' ?
      flattenRichMessageContent(translated.value) :
      translated.value;
    const {text, html} = prepareTextWithEntitiesForCopying(textWithEntities);
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
        <Transition
          name='fade-2'
          mode='outin'
          onAfterEnter={(el) => {
            if(el === scrollableRef) requestRAF(() => {
              scrollableContextRef?.onSizeChange?.();
            });
          }}>
          <Switch>
            <Match when={translation.state === 'ready' && translation()} keyed>
              {(translated) => (
                <Scrollable
                  tabIndex={0}
                  ref={scrollableRef}
                  contextRef={(value) => void (scrollableContextRef = value)}
                  relative
                  class={previewStyles.richTextScrollable}
                  withBorders='manual'
                >
                  <div
                    class={classNames(previewStyles.richTextScrollableContent, 'spoilers-container')}
                    dir='auto'
                    ref={(el) => props.wireCaptionClick?.(el)}
                  >
                    {translated.type === 'rich' ? (
                      <InstantViewBlocks
                        webPageId={props.message.mid}
                        page={richMessageToPage(translated.value)}
                        openNewPage={(page) => {
                          openInstantViewInAppBrowser({
                            cachedPage: page,
                            HotReloadGuardProvider: SolidJSHotReloadGuardProvider
                          });
                        }}
                        collapse={() => {}}
                        class={instantViewStyles.RichMessage}
                        paddings={0}
                      />
                    ) : wrapRichText(translated.value.text, {
                      textColor: 'primary-text-color',
                      middleware: createMiddleware().get(),
                      entities: translated.value.entities
                    })}
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
