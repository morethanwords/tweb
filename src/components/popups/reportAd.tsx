/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from '.';
import {ChannelsSponsoredMessageReportResult, SponsoredMessage, SponsoredMessageReportOption} from '../../layer';
import {render} from 'solid-js/web';
import {Accessor, createSignal, For, Setter, createResource, createEffect, onCleanup, createMemo, untrack} from 'solid-js';
import Section from '../section';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import RowTsx from '../rowTsx';
import {TransitionGroup} from '../../helpers/solid/transitionGroup';
import TransitionSlider from '../transition';
import {i18n} from '../../lib/langPack';
import {toastNew} from '../toast';
import Icon from '../icon';

export default class PopupReportAd extends PopupElement {
  private reportResult: ChannelsSponsoredMessageReportResult;
  private sections: Accessor<ReturnType<PopupReportAd['renderSection']>[]>;
  private setSections: Setter<ReturnType<PopupReportAd['renderSection']>[]>;
  private activeSection: Accessor<ReturnType<PopupReportAd['renderSection']>>;
  private transitions: WeakMap<HTMLElement, Accessor<boolean>>;

  constructor(
    private peerId: PeerId,
    private sponsoredMessage: SponsoredMessage,
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
  }

  private renderSection(result: ChannelsSponsoredMessageReportResult.channelsSponsoredMessageReportResultChooseOption, prevText?: string) {
    const [option, setOption] = createSignal<SponsoredMessageReportOption>(undefined, {equals: false});
    const [data] = createResource(() => option()?.option, this.report);

    createEffect(() => {
      const _data = data();
      if(!_data) {
        return;
      }

      const hasReported = _data._ === 'channels.sponsoredMessageReportResultReported';
      const hasHidden = _data._ === 'channels.sponsoredMessageReportResultAdsHidden';
      if(hasReported || hasHidden) {
        this.hide();
        this.onAdHide?.();
        toastNew({langPackKey: hasReported ? 'Ads.Reported' : 'AdHidden'});
        return;
      }

      this.setSections((sections) => [
        ...sections,
        this.renderSection(_data as ChannelsSponsoredMessageReportResult.channelsSponsoredMessageReportResultChooseOption, untrack(option).text)
      ]);
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

    const maxHeight = 48 * result.options.length;
    let container: HTMLDivElement;
    const activeHeight = createMemo(() => this.activeSection()?.maxHeight);
    (
      <Section
        ref={container}
        name={wrapEmojiText(result.title)}
        caption="ReportAdLearnMore"
        class="popup-report-ad-tab tabs-tab"
        noShadow
        noDelimiter
        onTransitionStart={onTransition}
        onTransitionEnd={onTransition}
      >
        <div class="popup-report-ad-tab-options" style={{height: (activeHeight() || maxHeight) + 'px'}}>
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
        </div>
      </Section>
    );

    this.transitions.set(container, transition);
    onCleanup(() => this.transitions.delete(container));

    return {container, transition, maxHeight, prevText};
  }

  private _construct() {
    const [sections, setSections] = createSignal<ReturnType<PopupReportAd['renderSection']>[]>([]);
    const [activeSection, setActiveSection] = createSignal<ReturnType<PopupReportAd['renderSection']>>();
    this.sections = sections;
    this.setSections = setSections;
    this.activeSection = activeSection;

    setSections([
      this.renderSection(this.reportResult as ChannelsSponsoredMessageReportResult.channelsSponsoredMessageReportResultChooseOption)
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

    let titleRef: HTMLDivElement;
    this.title.append((
      <div ref={titleRef} class="transition slide-fade">
        <div class="transition-item">{i18n('ReportAd')}</div>
        <div class="transition-item">
          <div class="popup-report-ad-header-rows">
            <div class="popup-report-ad-header-title">{i18n('ReportAd')}</div>
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

  private report = (option: Uint8Array) => {
    return this.managers.appChatsManager.reportSponsoredMessage(this.peerId.toChatId(), this.sponsoredMessage.random_id, option);
  };

  private async construct() {
    this.transitions = new WeakMap();
    this.reportResult = await this.report(new Uint8Array);
    this.appendSolid(() => this._construct());
    this.show();
  }
}
