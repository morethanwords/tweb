import PopupElement, {createPopup, PopupContext} from '@components/popups/indexTsx';
import {ChannelsSponsoredMessageReportResult, MessageReportOption, ReportResult, SponsoredMessageReportOption} from '@layer';
import {Accessor, createSignal, For, Setter, createResource, createEffect, onCleanup, createMemo, untrack, useContext} from 'solid-js';
import Section from '@components/section';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import {TransitionGroup} from '@helpers/solid/transitionGroup';
import TransitionSlider from '@components/transition';
import {i18n, LangPackKey} from '@lib/langPack';
import {toastNew} from '@components/toast';
import Icon from '@components/icon';
import rootScope from '@lib/rootScope';
import preloadAnimatedEmojiSticker from '@helpers/preloadAnimatedEmojiSticker';
import wrapStickerEmoji from '@components/wrappers/stickerEmoji';
import InputField from '@components/inputField';
import createMiddleware from '@helpers/solid/createMiddleware';
import Button from '@components/buttonTsx';
import classNames from '@helpers/string/classNames';
import Row from '@components/rowTsx';
import Scrollable from '@components/scrollable2';

const STICKER_EMOJI = '👮‍♀️';

type ReportAdResult = ChannelsSponsoredMessageReportResult | ReportResult;
type ReportFn = (option: Uint8Array, text?: string) => Promise<ReportAdResult>;

type ChooseOrComment =
  ChannelsSponsoredMessageReportResult.channelsSponsoredMessageReportResultChooseOption |
  ReportResult.reportResultChooseOption |
  ReportResult.reportResultAddComment;

type RenderedSection = {
  container: HTMLDivElement,
  transition: Accessor<boolean>,
  maxHeight: Accessor<number>,
  prevText: string,
  readyPromise: Promise<any>,
  isComment: boolean
};

export default function showReportAdPopup(
  type: 'ad' | 'message' | 'story',
  report: ReportFn,
  onAdHide?: () => void
) {
  preloadAnimatedEmojiSticker(STICKER_EMOJI);

  function Inner(props: {reportResult: ReportAdResult}) {
    const context = useContext(PopupContext);

    const transitions = new WeakMap<HTMLElement, Accessor<boolean>>();
    const [sections, setSections] = createSignal<RenderedSection[]>([]);
    const [activeSection, setActiveSection] = createSignal<RenderedSection>();

    function renderSection(result: ChooseOrComment, prevText?: string): RenderedSection {
      const [option, setOption] = createSignal<SponsoredMessageReportOption | MessageReportOption>(undefined, {equals: false});
      const [data] = createResource(() => option()?.option, (option) => report(option));

      const onReport = (hasReported: boolean) => {
        context.hide();
        onAdHide?.();
        toastNew({langPackKey: type === 'ad' ? (hasReported ? 'Ads.Reported' : 'AdHidden') : 'Reported2'});
      };

      createEffect(() => {
        const _data = data();
        if(!_data) {
          return;
        }

        const hasReported = _data._ === 'channels.sponsoredMessageReportResultReported' || _data._ === 'reportResultReported';
        const hasHidden = _data._ === 'channels.sponsoredMessageReportResultAdsHidden';
        if(hasReported || hasHidden) {
          onReport(hasReported);
          return;
        }

        const rendered = renderSection(_data as typeof result, untrack(option).text);
        const middleware = createMiddleware().get();
        rendered.readyPromise.then(() => {
          if(!middleware()) return;
          setSections((sections) => [
            ...sections,
            rendered
          ]);
        });
        setOption(); // reset for another click
      });

      const [transition, setTransition] = createSignal(false);

      let timeout: number;
      const onTransition = (e: TransitionEvent) => {
        if(e.target !== container) {
          return;
        }

        const isStart = e.type === 'transitionstart';
        setTransition(isStart);
        clearTimeout(timeout);
        if(isStart) { // * fix
          timeout = window.setTimeout(() => {
            setTransition(false);
          }, 300);
        }
      };

      let maxHeight: Accessor<number>, setMaxHeight: Setter<number>;
      let stickerDiv: HTMLDivElement, inputField: InputField, sendButton: HTMLButtonElement;
      let readyPromise: Promise<any> = Promise.resolve();
      const isComment = result._ === 'reportResultAddComment';
      if(isComment) {
        stickerDiv = document.createElement('div');
        const size = 130;
        readyPromise = wrapStickerEmoji({
          div: stickerDiv,
          emoji: STICKER_EMOJI,
          width: size,
          height: size,
          middleware: createMiddleware().get()
        }).then(({render}) => render);
        inputField = new InputField({
          label: 'ReportHint',
          maxLength: 512,
          placeholder: result.pFlags.optional ? 'Report2CommentOptional' : 'Report2Comment',
          required: !result.pFlags.optional
        });

        [maxHeight, setMaxHeight] = createSignal<number>();
      } else {
        maxHeight = () => 48 * result.options.length;
      }

      let container: HTMLDivElement, caption: HTMLDivElement;
      const activeHeight = createMemo(() => {
        const section = activeSection();
        const height = section?.maxHeight();
        return height && section.isComment && !isComment ? height - 64 : height;
      });

      const inner = isComment ? (
        <>
          {stickerDiv}
          {inputField.container}
        </>
      ) : (
        <For each={result.options}>
          {(option) => {
            return (
              <Row clickable={() => setOption(option)}>
                <Row.Title>{wrapEmojiText(option.text)}</Row.Title>
                <Row.RightContent>{Icon('next', 'popup-report-ad-option-arrow-icon')}</Row.RightContent>
              </Row>
            );
          }}
        </For>
      );

      (
        <Section
          ref={container}
          name={'title' in result ? wrapEmojiText(result.title) : undefined}
          caption={type === 'ad' ? 'ReportAdLearnMore' : (isComment ? 'ReportInfo' : undefined)}
          captionRef={(ref) => caption = ref}
          class="popup-report-ad-tab tabs-tab"
          noShadow
          noDelimiter
          onTransitionStart={onTransition}
          onTransitionEnd={onTransition}
        >
          <div class={classNames('popup-report-ad-tab-options')} style={{height: (activeHeight() || maxHeight()) + 'px'}}>
            {inner}
          </div>
        </Section>
      );

      transitions.set(container, transition);
      onCleanup(() => transitions.delete(container));

      if(isComment) {
        const [disabled, setDisabled] = createSignal(false);
        (
          <Button
            ref={sendButton}
            disabled={disabled()}
            class="btn-primary btn-color-primary popup-report-ad-send-button"
            text="Report2Send"
            onClick={async() => {
              setDisabled(true);
              inputField.input.contentEditable = 'false';
              try {
                await report(result.option, inputField.value);
                onReport(true);
              } catch(err) {
                console.error(err);
                setDisabled(false);
                inputField.input.contentEditable = 'true';
              }
            }}
          />
        );

        const onChange = () => {
          setDisabled(!inputField.isValid());
          setMaxHeight((inputField.value ? inputField.container.offsetHeight : 54) + 142 + 147);
        };

        inputField.input.addEventListener('input', onChange);
        onChange();

        caption.classList.add('popup-report-ad-comment-caption')
        caption.after(sendButton);
      }

      return {container, transition, maxHeight, prevText, readyPromise, isComment};
    }

    setSections([
      renderSection(props.reportResult as ChooseOrComment)
    ]);

    createEffect(() => {
      const _sections = sections();
      transition(_sections.length - 1);
      headerTransition(_sections.length === 1 ? 0 : 1);
      if(!untrack(activeSection)) {
        setActiveSection(_sections[_sections.length - 1]);
      }
    });

    let container: HTMLDivElement;
    const body = (
      <div ref={container} class="popup-report-ad-tabs tabs-container">
        <TransitionGroup transitions={transitions}>
          {sections().map(({container}) => container)}
        </TransitionGroup>
      </div>
    );

    const transition = TransitionSlider({
      content: container,
      type: 'tabs',
      transitionTime: 150,
      animateFirst: false,
      onTransitionStartAfter: () => {
        setActiveSection(sections()[sections().length - 1]);
      }
    });

    const prevText = createMemo<string>((prev) => activeSection()?.prevText ?? prev);

    const titleKey: LangPackKey = type === 'ad' ? 'ReportAd' : 'ReportChat';
    let titleRef: HTMLDivElement;
    const title = (
      <div ref={titleRef} class="transition slide-fade">
        <div class="transition-item">{i18n(titleKey)}</div>
        <div class="transition-item">
          <div class="popup-report-ad-header-rows">
            <div class="popup-report-ad-header-title">{i18n(titleKey)}</div>
            <div class="popup-report-ad-header-subtitle">{wrapEmojiText(prevText())}</div>
          </div>
        </div>
      </div>
    );

    const headerTransition = TransitionSlider({
      content: titleRef,
      type: 'slide-fade',
      transitionTime: 400,
      isHeavy: false
    });

    return (
      <>
        <PopupElement.Header>
          <PopupElement.CloseButton
            canGoBack={sections().length > 1}
            onBackClick={() => {
              setSections((sections) => sections.slice(0, -1));
            }}
          />
          <PopupElement.Title>{title}</PopupElement.Title>
        </PopupElement.Header>
        <PopupElement.Body>
          <Scrollable>
            {body}
          </Scrollable>
        </PopupElement.Body>
      </>
    );
  }

  report(new Uint8Array).then((reportResult) => {
    createPopup(() => (
      <PopupElement
        class="popup-report-ad"
        closable
        old
      >
        <Inner reportResult={reportResult} />
      </PopupElement>
    ));
  });
}

export function showAdReport(
  sponsoredMessage: {random_id: Uint8Array},
  onAdHide?: () => void
) {
  showReportAdPopup(
    'ad',
    (option) => rootScope.managers.appMessagesManager.reportSponsoredMessage(sponsoredMessage.random_id, option),
    onAdHide
  );
}

export function showMessageReport(peerId: PeerId, mids: number[]) {
  showReportAdPopup(
    'message',
    (option, text) => rootScope.managers.appMessagesManager.reportMessages(peerId, mids, option, text)
  );
}

export function showStoryReport(peerId: PeerId, ids: number[], onFinish?: () => void) {
  showReportAdPopup(
    'story',
    (option, text) => rootScope.managers.appStoriesManager.report(peerId, ids, option, text),
    onFinish
  );
}
