import {SEND_WHEN_ONLINE_TIMESTAMP} from '@appManagers/constants';
import {AutoHeight} from '@components/autoHeight';
import Button from '@components/buttonTsx';
import SelectedEffect from '@components/chat/selectedEffect';
import SendContextMenu from '@components/chat/sendContextMenu';
import {IconTsx} from '@components/iconTsx';
import showScheduleSendingPopup from '@components/popups/scheduleSendingPopup';
import {usePopupContext} from '@components/popups/indexTsx';
import Scrollable, {ScrollableContextValue} from '@components/scrollable2';
import Space from '@components/space';
import debounce from '@helpers/schedulers/debounce';
import {fastRaf} from '@helpers/schedulers';
import classNames from '@helpers/string/classNames';
import createMiddleware from '@helpers/solid/createMiddleware';
import {I18nTsx} from '@helpers/solid/i18n';
import {useObserveResize} from '@hooks/useObserveResize';
import rootScope from '@lib/rootScope';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {LocalTextWithEntities} from '@types';
import {createComputed, createEffect, createMemo, createSignal, JSX, Match, on, onMount, Show, Switch} from 'solid-js';
import {AiSendStyle, getAiSendStyleOfRequest, isSameAiSendStyle} from '@components/chat/aiSendStyles';
import getAiComposeToneKey from '@appManagers/utils/aiTones/getAiComposeToneKey';
import Row from '@components/rowTsx';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import type {LangPackKey} from '@lib/langPack';
import Section from '@components/section';
import {Transition} from 'solid-transition-group';
import {AiEditorSendOptions} from './aiEditorPopup';
import styles from './bodyContent.module.scss';
import {useAiEditorPopupContext} from './context';
import {FixTab} from './fixTab';
import {CopyResultButton, Tabs, useIsAppearing} from './parts';
import createRowLinesTransition from './rowLinesTransition';
import {StyleTab} from './styleTab';
import {TranslateTab} from './translateTab';


enum TabKey {
  Translate,
  Style,
  Fix
};

// * what a message sent in the chat goes through with the editor as it is, in a line: "→ Formal + emoji", "→ Fix
// * grammar". A style's title and a prompt are the user's own text, of a direction of their own
const SendStyleSummary = (props: {style: AiSendStyle}) => {
  const asked = (): JSX.Element => {
    const {style} = props;
    if(style.proofRead) return <I18nTsx key='AiEditor.AlwaysUse.Summary.Fix' />;
    let asked: JSX.Element;
    if(style.translateTo) {
      asked = <I18nTsx key={`Language.${style.translateTo}` as LangPackKey} />;
    } else if(style.customPrompt) {
      asked = <I18nTsx key='AiEditor.AlwaysUse.Summary.Prompt' args={[<span dir='auto'>{style.customPrompt}</span>]} />;
    } else if(style.toneNameOrId) {
      asked = <span dir='auto'>{style.toneTitle || style.toneNameOrId}</span>;
    }

    if(!style.emojify) return asked;
    return asked ?
      <I18nTsx key='AiEditor.AlwaysUse.Summary.WithEmoji' args={[asked]} /> :
      <I18nTsx key='Emoji' />;
  };

  return <I18nTsx key='AiEditor.AlwaysUse.Summary' args={[asked()]} />;
};

export const AiEditorPopupBodyContent = () => {
  const context = useAiEditorPopupContext();
  const {
    peerId,
    isScheduled,
    onApply,
    onApplyRichMessage,
    onSend,
    onSendRichMessage,
    canSendWhenOnline,
    savedSendStyle,
    onSaveSendStyle,
    actionPending,
    primaryActionSignal: [primaryAction],
    resultTextSignal: [resultText],
    resultRichMessageSignal: [resultRichMessage],
    requestSignal: [request]
  } = context;
  const popup = usePopupContext();
  const middleware = popup.middlewareHelper.get();
  const isActive = () => !popup.destroyed && middleware();
  const {toastNew, I18n} = useHotReloadGuard();

  const [effect, setEffect] = createSignal<DocId>();
  const [schedulePending, setSchedulePending] = createSignal(false);
  const hasResult = () => !!(resultRichMessage() || resultText());
  const canSendResult = () => hasResult() && !actionPending() && !schedulePending();

  const prepareSendResult = () => {
    if(!isActive() || !canSendResult()) return;
    const richMessage = resultRichMessage();
    const text = resultText() as LocalTextWithEntities;
    const selectedEffect = effect();
    if(!richMessage && (!text || !onSend)) return;
    return (options?: AiEditorSendOptions) => {
      if(!isActive()) return;
      if(richMessage && onSendRichMessage) {
        return onSendRichMessage(richMessage, {...options, effect: selectedEffect});
      }
      if(text && onSend) return onSend(text, {...options, effect: selectedEffect});
    };
  };
  const sendResult = (options?: AiEditorSendOptions) => prepareSendResult()?.(options);

  const openScheduleAndSend = async() => {
    const send = prepareSendResult();
    if(!send) return;
    setSchedulePending(true);
    try {
      const online = await canSendWhenOnline?.();
      if(!isActive()) return;
      showScheduleSendingPopup({
        canSendWhenOnline: online,
        onPick: (timestamp, repeatPeriod, silent) => send({
          scheduleDate: timestamp,
          scheduleRepeatPeriod: repeatPeriod,
          silent
        })
      });
    } catch{
      if(isActive()) toastNew({langPackKey: 'Error.AnError'});
    } finally {
      setSchedulePending(false);
    }
  };

  const handleSendClick = () => {
    if(!canSendResult()) return;
    // In a scheduled-messages chat, sending must always go through the schedule popup
    if(isScheduled) {
      openScheduleAndSend();
      return;
    }
    sendResult();
  };

  // * what the editor asks for now, as a chat keeps it: a tone named as the style tab lists it (`initialTones` holds
  // * the list it shows)
  const sendStyle = createMemo(() => {
    const args = request();
    const tone = args?.toneNameOrId &&
      context.initialTones?.find((tone) => getAiComposeToneKey(tone) === args.toneNameOrId);
    return getAiSendStyleOfRequest(args, tone?.title);
  }, undefined, {equals: (a, b) => isSameAiSendStyle(a, b) && a?.toneTitle === b?.toneTitle});

  // * "Always use in this chat", after Telegram for iOS: on while the chat keeps a request of the editor, which then
  // * follows the editor, another tab, language, style or emoji kept at once, its result come or not. Nothing asked
  // * for keeps nothing: the chat's messages go as written
  const [alwaysUse, setAlwaysUse] = createSignal(!!savedSendStyle);
  let keptSendStyle = savedSendStyle;
  const keepSendStyle = (style: AiSendStyle) => {
    if(!isActive() || !onSaveSendStyle(style)) return false;
    keptSendStyle = style;
    return true;
  };
  const onAlwaysUseChange = (on: boolean) => {
    // * a chat the field has left keeps what it had: the switch goes back
    if(!keepSendStyle(on ? sendStyle() : undefined)) setAlwaysUse(!on);
  };
  // * what the popup opens on is no change: a request kept that it cannot show (a style gone since) stays kept
  createEffect(on(sendStyle, (style) => {
    if(alwaysUse() && !isSameAiSendStyle(style, keptSendStyle)) keepSendStyle(style);
  }, {defer: true}));

  // * its summary coming, going or changing: the row's lines part or close up instead of jumping. Noted before the row
  // * changes - a computation runs before Solid puts the change into the DOM. What the popup opens with is no change:
  // * the tab it opens on says what it asks for as it is made, before the popup is first drawn (and while it comes in)
  let alwaysUseRow: HTMLElement, drawn = false;
  onMount(() => fastRaf(() => drawn = true));
  const alwaysUseLines = createRowLinesTransition(() => alwaysUseRow);
  createComputed(on(sendStyle, () => {
    if(drawn) alwaysUseLines.prepare();
  }, {defer: true}));

  // * opened with a request saved for the chat, it shows that request made on the message
  const [activeTab, setActiveTab] = createSignal<TabKey>(
    savedSendStyle?.translateTo ? TabKey.Translate : savedSendStyle?.proofRead ? TabKey.Fix : TabKey.Style
  );
  // * the tab the popup opens on is there from the start, with nothing to wait for: only one switched to appears
  let switchedTab = false;
  const onTabChange = (key: TabKey) => {
    switchedTab = true;
    setActiveTab(key);
  };
  const [hasTransition, setHasTransition] = createSignal(false);

  const [scrollableEl, setScrollableEl] = createSignal<HTMLDivElement>();
  const [scrollableContentEl, setScrollableContentEl] = createSignal<HTMLDivElement>();
  let scrollableContextRef!: ScrollableContextValue;

  const updateScrollable = debounce(() => {
    scrollableContextRef?.onSizeChange();
  }, 100, false, true);

  useObserveResize(scrollableContentEl, updateScrollable);
  useObserveResize(scrollableEl, updateScrollable);

  return (
    <div class={styles.bodyContent}>
      <Tabs
        items={[
          {label: 'Translate', icon: 'premium_translate', key: TabKey.Translate},
          {label: 'AiEditor.Style', icon: 'edit_stars', key: TabKey.Style},
          {label: 'AiEditor.Fix', icon: 'search_check', key: TabKey.Fix}
        ]}
        activeKey={activeTab()}
        onTabChange={onTabChange}
      />
      <Space amount='0.5rem' />
      <Scrollable
        tabIndex={0}
        ref={setScrollableEl}
        class={styles.scrollable}
        relative
        withBorders='both'
        contextRef={(value) => void (scrollableContextRef = value)}
      >
        <div class={styles.scrollableContent}> {/* Need a separate wrapper for padding */}
          <AutoHeight
            ref={setScrollableContentEl}
            outerClass={styles.autoHeight}
            hasTransition={hasTransition()}
            overflowHidden
          >
            <Transition
              name='fade-2'
              onBeforeExit={(el) => {
                el.classList.add(styles.exit);
                setHasTransition(true);
              }}
              onAfterExit={() => setHasTransition(false)}
              onBeforeEnter={() => setHasTransition(true)}
              onAfterEnter={() => setHasTransition(false)}
            >
              <Switch>
                <Match when={activeTab() === TabKey.Translate}>
                  {(_) => {
                    const isAppearing = switchedTab ? useIsAppearing(hasTransition) : () => false;
                    return <div><TranslateTab isAppearing={isAppearing()} /></div>
                  }}
                </Match>
                <Match when={activeTab() === TabKey.Style}>
                  <div><StyleTab /></div>
                </Match>
                <Match when={activeTab() === TabKey.Fix}>
                  {(_) => {
                    const isAppearing = switchedTab ? useIsAppearing(hasTransition) : () => false;
                    return <div><FixTab isAppearing={isAppearing()} /></div>
                  }}
                </Match>
              </Switch>
            </Transition>
          </AutoHeight>
          <Show when={onSaveSendStyle}>
            <Section class={styles.alwaysUse} caption='AiEditor.AlwaysUse.Footer' noShadow>
              <Row ref={alwaysUseRow} disabled={actionPending() || schedulePending()}>
                <Row.CheckboxFieldToggle>
                  <CheckboxFieldTsx
                    toggle
                    signal={[alwaysUse, setAlwaysUse]}
                    disabled={actionPending() || schedulePending()}
                    onChange={onAlwaysUseChange}
                  />
                </Row.CheckboxFieldToggle>
                <Row.Title><I18nTsx key='AiEditor.AlwaysUse' /></Row.Title>
                <Show when={sendStyle()} keyed>
                  {(style) => <Row.Subtitle><SendStyleSummary style={style} /></Row.Subtitle>}
                </Show>
              </Row>
            </Section>
          </Show>
        </div>
      </Scrollable>
      <Space amount='0.5rem' />
      <div class={styles.footerButtons}>
        <CopyResultButton />
        <Button
          class={styles.applyButton}
          primaryFilled
          disabled={actionPending() || schedulePending() || (primaryAction()?.disabled() ?? !hasResult())}
          onClick={() => {
            const action = primaryAction();
            if(action) {
              action.onClick();
              return;
            }
            const richMessage = resultRichMessage();
            if(richMessage && onApplyRichMessage) {
              onApplyRichMessage(richMessage);
            } else if(resultText()) {
              onApply(resultText());
            }
          }}
        >
          <I18nTsx key={primaryAction()?.langKey || 'Apply'} />
        </Button>
        <Show when={onSend || onSendRichMessage} keyed>
          {(_send) => {
            let sendButton!: HTMLElement;

            const withEffects = () => peerId.isUser() && peerId !== rootScope.myId;

            // The send context menu is not available in a scheduled-messages chat
            if(!isScheduled) {
              onMount(() => {
                const sendMenu = new SendContextMenu({
                  onSilentClick: () => sendResult({silent: true}),
                  onScheduleClick: openScheduleAndSend,
                  onSendWhenOnlineClick: () => sendResult({scheduleDate: SEND_WHEN_ONLINE_TIMESTAMP}),
                  onOpen: canSendResult,
                  openSide: 'top-left',
                  onContextElement: sendButton,
                  middleware: createMiddleware().get(),
                  canSendWhenOnline,
                  withEffects,
                  effect,
                  onEffect: setEffect
                });

                sendMenu.setPeerParams({peerId, isPaid: false});
              });
            }

            return (
              // The selected effect badge overflows the button, which clips its
              // own content, so it lives in this wrapper alongside the button
              <div class={styles.sendButtonWrapper}>
                <Button
                  ref={sendButton}
                  class={styles.roundButton}
                  primaryFilled
                  disabled={!canSendResult()}
                  aria-label={I18n.format('Send', true)}
                  onClick={handleSendClick}
                >
                  <IconTsx class={classNames(styles.roundButtonIcon, 'icon-mirror')} icon='logo' />
                </Button>
                <Show when={!isScheduled}>
                  <SelectedEffect effect={effect} />
                </Show>
              </div>
            );
          }}
        </Show>
      </div>
    </div>
  );
};
