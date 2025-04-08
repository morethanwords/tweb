/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from '.';
import {ChannelsSponsoredMessageReportResult, MessageReportOption, ReportResult, SponsoredMessage, SponsoredMessageReportOption} from '../../layer';
import {Accessor, createSignal, For, Setter, createResource, createEffect, onCleanup, createMemo, untrack} from 'solid-js';
import Section from '../section';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import RowTsx from '../rowTsx';
import {TransitionGroup} from '../../helpers/solid/transitionGroup';
import TransitionSlider from '../transition';
import {i18n, LangPackKey} from '../../lib/langPack';
import {toastNew} from '../toast';
import Icon from '../icon';
import rootScope from '../../lib/rootScope';
import preloadAnimatedEmojiSticker from '../../helpers/preloadAnimatedEmojiSticker';
import wrapStickerEmoji from '../wrappers/stickerEmoji';
import InputField from '../inputField';
import createMiddleware from '../../helpers/solid/createMiddleware';
import Button from '../buttonTsx';
import classNames from '../../helpers/string/classNames';

export default class PopupReportAd extends PopupElement {
  private static STICKER_EMOJI = '👮‍♀️';
  private reportResult: ChannelsSponsoredMessageReportResult | ReportResult;
  private sections: Accessor<ReturnType<PopupReportAd['renderSection']>[]>;
  private setSections: Setter<ReturnType<PopupReportAd['renderSection']>[]>;
  private activeSection: Accessor<ReturnType<PopupReportAd['renderSection']>>;
  private transitions: WeakMap<HTMLElement, Accessor<boolean>>;

  constructor(
    private type: 'ad' | 'message' | 'story',
    private report: (option: Uint8Array, text?: string) => Promise<ChannelsSponsoredMessageReportResult | ReportResult>,
    private onAdHide?: () => void
  ) {
    super('popup-report-ad', {
      closable: true,
      overlayClosable: true,
      body: true,
      onBackClick: () => {
        this.setSections((sections) => sections.slice(0, -1));
        return false;
      },
      title: true,
      scrollable: true
    });

    this.construct();
    preloadAnimatedEmojiSticker(PopupReportAd.STICKER_EMOJI);
  }

  private renderSection(
    result: ChannelsSponsoredMessageReportResult.channelsSponsoredMessageReportResultChooseOption | ReportResult.reportResultChooseOption | ReportResult.reportResultAddComment,
    prevText?: string
  ) {
    const [option, setOption] = createSignal<SponsoredMessageReportOption | MessageReportOption>(undefined, {equals: false});
    const [data] = createResource(() => option()?.option, (option) => this.report(option));

    const onReport = (hasReported: boolean) => {
      this.hide();
      this.onAdHide?.();
      toastNew({langPackKey: this.type === 'ad' ? (hasReported ? 'Ads.Reported' : 'AdHidden') : 'Reported2'});
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

      const rendered = this.renderSection(_data as typeof result, untrack(option).text);
      const middleware = createMiddleware().get();
      rendered.readyPromise.then(() => {
        if(!middleware()) return;
        this.setSections((sections) => [
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
        emoji: PopupReportAd.STICKER_EMOJI,
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
      const section = this.activeSection();
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
            <RowTsx
              title={wrapEmojiText(option.text)}
              clickable={() => setOption(option)}
              rightContent={Icon('next', 'popup-report-ad-option-arrow-icon')}
            />
          );
        }}
      </For>
    );

    (
      <Section
        ref={container}
        name={'title' in result ? wrapEmojiText(result.title) : undefined}
        caption={this.type === 'ad' ? 'ReportAdLearnMore' : (isComment ? 'ReportInfo' : undefined)}
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

    this.transitions.set(container, transition);
    onCleanup(() => this.transitions.delete(container));

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
              await this.report(result.option, inputField.value);
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

  private _construct() {
    const [sections, setSections] = createSignal<ReturnType<PopupReportAd['renderSection']>[]>([]);
    const [activeSection, setActiveSection] = createSignal<ReturnType<PopupReportAd['renderSection']>>();
    this.sections = sections;
    this.setSections = setSections;
    this.activeSection = activeSection;

    setSections([
      this.renderSection(this.reportResult as Parameters<PopupReportAd['renderSection']>[0])
    ]);

    createEffect(() => {
      const _sections = sections();
      this.btnCloseAnimatedIcon.classList.toggle('state-back', _sections.length > 1);
      transition(_sections.length - 1);
      headerTransition(_sections.length === 1 ? 0 : 1);
      if(!untrack(activeSection)) {
        setActiveSection(_sections[_sections.length - 1]);
      }
    });

    let container: HTMLDivElement;
    const ret = (
      <div ref={container} class="popup-report-ad-tabs tabs-container">
        <TransitionGroup transitions={this.transitions}>
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

    const titleKey: LangPackKey = this.type === 'ad' ? 'ReportAd' : 'ReportChat';
    let titleRef: HTMLDivElement;
    this.title.append((
      <div ref={titleRef} class="transition slide-fade">
        <div class="transition-item">{i18n(titleKey)}</div>
        <div class="transition-item">
          <div class="popup-report-ad-header-rows">
            <div class="popup-report-ad-header-title">{i18n(titleKey)}</div>
            <div class="popup-report-ad-header-subtitle">{wrapEmojiText(prevText())}</div>
          </div>
        </div>
      </div>
    ) as HTMLElement);

    const headerTransition = TransitionSlider({
      content: titleRef,
      type: 'slide-fade',
      transitionTime: 400,
      isHeavy: false
    });

    return ret;
  }

  private async construct() {
    this.transitions = new WeakMap();
    this.reportResult = await this.report(new Uint8Array);
    this.appendSolid(() => this._construct());
    this.show();
  }

  public static createAdReport(
    sponsoredMessage: SponsoredMessage,
    onAdHide?: () => void
  ) {
    PopupElement.createPopup(
      PopupReportAd,
      'ad',
      (option) => {
        return rootScope.managers.appMessagesManager.reportSponsoredMessage(sponsoredMessage.random_id, option);
      },
      onAdHide
    );
  }

  public static createMessageReport(peerId: PeerId, mids: number[]) {
    PopupElement.createPopup(
      PopupReportAd,
      'message',
      (option, text) => {
        return rootScope.managers.appMessagesManager.reportMessages(peerId, mids, option, text);
      }
    );
  }

  public static createStoryReport(peerId: PeerId, ids: number[], onFinish?: () => void) {
    PopupElement.createPopup(
      PopupReportAd,
      'story',
      (option, text) => {
        return rootScope.managers.appStoriesManager.report(peerId, ids, option, text);
      },
      onFinish
    );
  }
}
