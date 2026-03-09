/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {render} from 'solid-js/web';
import {SliderSuperTab} from '@components/slider';
import appSidebarRight from '..';
import {roundPercents} from '@components/poll';
import appDialogsManager from '@lib/appDialogsManager';
import {i18n} from '@lib/langPack';
import setInnerHTML from '@helpers/dom/setInnerHTML';
import Section from '@components/section';
import {Message, MessageMedia} from '@layer';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import wrapTextWithEntities from '@lib/richTextProcessor/wrapTextWithEntities';
import {Show, untrack} from 'solid-js';
import {createLoadableList, MoreButton} from '@components/sidebarRight/tabs/statistics';
import {formatFullSentTimeRaw} from '@helpers/date';

export default class AppPollResultsTab extends SliderSuperTab {
  private dispose: VoidFunction;

  public async init(message: Message.message) {
    this.container.id = 'poll-results-container';
    this.container.classList.add('chatlist-container');

    const poll = await this.managers.appPollsManager.getPoll((message.media as MessageMedia.messageMediaPoll).poll.id);

    this.setTitle(poll.poll.pFlags.quiz ? 'PollResults.Title.Quiz' : 'PollResults.Title.Poll');

    this.header.append((
      <div class="sidebar-header__rows">
        {this.title}
        <div class="sidebar-header__subtitle">
          {i18n('Chat.Poll.TotalVotes1', [poll.results.total_voters])}
        </div>
      </div>
    ) as HTMLElement);

    const percents = poll.results.results.map((v) => v.voters / poll.results.total_voters * 100);
    roundPercents(percents);

    const getSections = () => poll.results.results.map((result, idx) => {
      if(!result.voters) {
        return;
      }

      const answer = poll.poll.answers[idx];

      const answerTitle = document.createElement('div');
      const answerText = wrapTextWithEntities(answer.text);
      const answerTextWrapped = wrapRichText(answerText.text, {entities: answerText.entities, middleware: this.middlewareHelper.get()});
      setInnerHTML(answerTitle, answerTextWrapped);
      answerTitle.append(' — ', Math.round(percents[idx]) + '%');

      const answerPercents = i18n('Chat.Poll.TotalVotes1', [result.voters]);

      // Humans
      const list = appDialogsManager.createChatList();
      list.classList.add('poll-results-voters');

      appDialogsManager.setListClickListener({
        list,
        onFound: () => {
          appSidebarRight.onCloseBtnClick();
        },
        openInner: true
      });

      list.style.minHeight = Math.min(result.voters, 4) * 48 + 'px';

      let offset: string, limit = 4;
      const load = async() => {
        const votesList = await this.managers.appPollsManager.getVotes(
          message,
          answer.option,
          offset,
          limit
        );

        const elements = votesList.votes.map((vote) => {
          const {dom} = appDialogsManager.addDialogNew({
            peerId: getPeerId(vote.peer),
            container: false,
            rippleEnabled: false,
            meAsSaved: false,
            avatarSize: 'small',
            withStories: false,
            wrapOptions: {
              middleware: this.middlewareHelper.get()
            },
            dontSetActive: true
          });
          dom.lastMessageSpan.parentElement.remove();
          const {dateEl, timeEl} = formatFullSentTimeRaw(vote.date);
          dom.containerEl.append((
            <span class="vote-time-container disable-hover">
              <span class="vote-time-title secondary">{dateEl}</span>
              <span class="vote-time-subtitle primary-text">{timeEl}</span>
            </span>
          ) as HTMLElement);
          return dom.containerEl;
        });

        setLoader((value) => {
          value.count = votesList.count;
          limit = 20;
          if(!(offset = votesList.next_offset)) {
            value.loadMore = undefined;
          }

          list.append(...elements);
          value.rendered.push(...elements);
          return value;
        });
      };

      const [loader, setLoader] = createLoadableList({loadMore: load});
      loader().loadMore();

      return (
        <Section
          name={answerTitle}
          nameRight={answerPercents}
        >
          {list}
          <Show when={!!loader().loadMore}>
            <MoreButton
              count={loader().count - loader().rendered.length}
              callback={() => loader().loadMore()}
            />
          </Show>
        </Section>
      );
    });

    const questionText = wrapTextWithEntities(poll.poll.question);
    const questionFragment = wrapRichText(questionText.text, {
      entities: questionText.entities,
      middleware: this.middlewareHelper.get()
    });

    const div = document.createElement('div');
    div.classList.add('poll-results');
    this.scrollable.append(div);

    this.dispose = render(() => (
      <>
        <h3 dir="auto">{questionFragment}</h3>
        {untrack(getSections)}
      </>
    ), div);

    appSidebarRight.toggleSidebar(true);
  }

  onCloseAfterTimeout() {
    super.onCloseAfterTimeout();
    this.dispose();
  }
}
