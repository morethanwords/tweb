import {IconTsx} from '@components/iconTsx';
import {observeResize} from '@components/resizeObserver';
import ripple from '@components/ripple';
import Scrollable from '@components/scrollable2';
import {StaticCheckbox} from '@components/staticCheckbox';
import {keepMe} from '@helpers/keepMe';
import createMiddleware from '@helpers/solid/createMiddleware';
import {I18nTsx} from '@helpers/solid/i18n';
import {requestRAF} from '@helpers/solid/requestRAF';
import classNames from '@helpers/string/classNames';
import {useIsCleaned} from '@hooks/useIsCleaned';
import {MessageEntity, TextWithEntities} from '@layer';
import type {WrapRichTextOptions} from '@lib/richTextProcessor/wrapRichText';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {batch, createComputed, createEffect, createMemo, createSignal, JSX, onCleanup, onMount, Show, Switch, Match} from 'solid-js';
import {Transition} from 'solid-transition-group';
import styles from './previewCard.module.scss';


keepMe(ripple);

export {styles as previewStyles};

/** Make quotes uncollapsible for previewing */
export const processEntities = (entities: MessageEntity[] = []) => {
  return entities.map((entity) => entity._ === 'messageEntityBlockquote' ? ({
    ...entity,
    pFlags: {...entity.pFlags, collapsed: undefined as undefined}
  }) : entity);
};

const shouldBeCollapsibleFrom = 60;

export const Original = (props: {
  text: TextWithEntities.textWithEntities;
  /** Defaults to the "Original" label */
  title?: JSX.Element;
  richTextOptions?: Partial<WrapRichTextOptions>;
  /** When true the rendered text stays interactive (links/spoilers clickable) */
  interactive?: boolean;
  isAppearing?: boolean;
  onEmojify?: () => void;
  onMeasured?: () => void;
  /** Receives the rich-text content element (e.g. to wire media-caption clicks) */
  wireContent?: (div: HTMLElement) => void;
}) => {
  const {wrapRichText} = useHotReloadGuard();

  const [isCollapsed, setIsCollapsed] = createSignal(false);
  const [originalContentHeight, setOriginalContentHeight] = createSignal<number>();
  const [hasOnEmojifyRaffed, setHasOnEmojifyRaffed] = createSignal(!!props.onEmojify);

  const isCollapsible = createMemo(() => originalContentHeight() > shouldBeCollapsibleFrom);
  const isActuallyCollapsible = createMemo(() => isCollapsible() && !hasOnEmojifyRaffed());

  const isActuallyCollapsed = createMemo(() => isCollapsed() && !props.onEmojify);

  let originalContentRef: HTMLDivElement;
  let originalScrollableRef: HTMLDivElement;

  onMount(() => {
    if(!originalContentRef) return;

    // Note that we might be in a <Transition mode='outin'>, which means the content is rendered, and then after some time is added into the DOM
    // So we need to wait for a resize event to get the proper scrollHeight
    const unobserve = observeResize(originalContentRef, () => {
      batch(() => {
        setOriginalContentHeight(originalContentRef.scrollHeight);
        setIsCollapsed(isCollapsible());
        props.onMeasured?.();
      });

      unobserve();
    });

    onCleanup(() => unobserve());
  });

  createComputed(() => {
    if(!props.onEmojify) {
      setHasOnEmojifyRaffed(false);
      return;
    }

    const isCleaned = useIsCleaned();

    requestRAF(() => {
      if(isCleaned()) return;
      setHasOnEmojifyRaffed(true);
    });
  });

  createEffect(() => {
    if(!originalScrollableRef) return;
    if(!isActuallyCollapsed()) return;
    originalScrollableRef.scrollTo({top: 0});
  });

  return (
    <>
      <div
        class={styles.originalHeader}
        classList={{
          [styles.clickable]: isActuallyCollapsible()
        }}
        use:ripple={isActuallyCollapsible()}
        // #click1
        onClick={() => isActuallyCollapsible() && setIsCollapsed((p) => !p)}
      >
        <Show when={props.title} fallback={<I18nTsx key='AiEditor.Original' />}>
          {props.title}
        </Show>
        <Transition name='fade-2'>
          <Switch>
            <Match when={props.onEmojify}>
              <EmojifyCheckbox
                class={styles.originalCheckbox}
                checked={false}
                onClick={() => {
                  // we want this to trigger after the outer click handler #click1
                  requestRAF(() => {
                    props.onEmojify?.();
                  });
                }}
              />
            </Match>
            <Match when={isActuallyCollapsible()}>
              <div class={styles.originalArrow} classList={{[styles.toggled]: isActuallyCollapsed()}}>
                <IconTsx icon='arrowhead' class={styles.originalArrowIcon} />
              </div>
            </Match>
          </Switch>
        </Transition>
      </div>
      <div
        class={styles.originalContent}
        classList={{
          [styles.collapsible]: isCollapsible(),
          [styles.collapsed]: isActuallyCollapsed()
        }}
        style={{'--original-content-height': originalContentHeight() + 'px'}}
      >
        <div ref={originalContentRef}>
          <Scrollable
            ref={originalScrollableRef}
            class={styles.richTextScrollable}
            relative
            withBorders='manual'
            hideThumb={isActuallyCollapsed()}
          >
            <div
              class={classNames(
                styles.richTextScrollableContent,
                !props.interactive && styles.nonInteractive,
                props.interactive && 'spoilers-container'
              )}
              dir='auto'
              ref={(el) => props.wireContent?.(el)}
            >
              {wrapRichText(props.text.text, {
                ...props.richTextOptions,
                entities: processEntities(props.text.entities),
                middleware: props.richTextOptions?.middleware ?? createMiddleware().get()
              })}
            </div>
          </Scrollable>
        </div>
        <div
          class={styles.originalOverlay}
          classList={{
            [styles.hasTransition]: !props.isAppearing
          }}
        />
      </div>
      <Show when={isCollapsible() && !isActuallyCollapsed()}>
        <div
          class={styles.originalFakeHeight}
          style={{'--original-content-height': originalContentHeight() + 'px'}}
        />
      </Show>
    </>
  );
};

export const Divider = () => {
  return <div class={styles.divider} />;
};

export const EmojifyCheckbox = (props: {
  class?: string;
  checked: boolean;
  onClick: () => void;
}) => {
  return (
    <div class={classNames(styles.emojifyCheckbox, props.class)} onClick={props.onClick} use:ripple>
      <StaticCheckbox round checked={props.checked} />
      <I18nTsx key='AiEditor.Emojify' />
    </div>
  );
};
