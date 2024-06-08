/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {SliderSuperTab} from '../../slider';
import appSidebarRight from '..';
import {roundPercents} from '../../poll';
import appDialogsManager from '../../../lib/appManagers/appDialogsManager';
import {i18n} from '../../../lib/langPack';
import setInnerHTML from '../../../helpers/dom/setInnerHTML';
import wrapEmojiText from '../../../lib/richTextProcessor/wrapEmojiText';
import Button from '../../button';
import {Message, MessageMedia} from '../../../layer';
import getPeerId from '../../../lib/appManagers/utils/peers/getPeerId';
import wrapRichText from '../../../lib/richTextProcessor/wrapRichText';
import wrapTextWithEntities from '../../../lib/richTextProcessor/wrapTextWithEntities';

export default class AppPollResultsTab extends SliderSuperTab {
  private resultsDiv: HTMLElement;

  public async init(message: Message.message) {
    this.container.id = 'poll-results-container';
    this.container.classList.add('chatlist-container');

    this.resultsDiv = document.createElement('div');
    this.resultsDiv.classList.add('poll-results');
    this.scrollable.append(this.resultsDiv);

    const poll = await this.managers.appPollsManager.getPoll((message.media as MessageMedia.messageMediaPoll).poll.id);

    this.setTitle(poll.poll.pFlags.quiz ? 'PollResults.Title.Quiz' : 'PollResults.Title.Poll');

    const title = document.createElement('h3');
    const questionText = wrapTextWithEntities(poll.poll.question);
    setInnerHTML(title, wrapRichText(questionText.text, {entities: questionText.entities, middleware: this.middlewareHelper.get()}));

    const percents = poll.results.results.map((v) => v.voters / poll.results.total_voters * 100);
    roundPercents(percents);

    const fragment = document.createDocumentFragment();
    poll.results.results.forEach((result, idx) => {
      if(!result.voters) return;

      const hr = document.createElement('hr');

      const answer = poll.poll.answers[idx];

      // Head
      const answerEl = document.createElement('div');
      answerEl.classList.add('poll-results-answer');

      const answerTitle = document.createElement('div');
      const answerText = wrapTextWithEntities(answer.text);
      setInnerHTML(answerTitle, wrapRichText(answerText.text, {entities: answerText.entities, middleware: this.middlewareHelper.get()}));

      const answerPercents = document.createElement('div');
      answerPercents.innerText = Math.round(percents[idx]) + '%';

      answerEl.append(answerTitle, answerPercents);

      // Humans
      const list = appDialogsManager.createChatList();
      list.classList.add('poll-results-voters');

      appDialogsManager.setListClickListener({
        list,
        onFound: () => {
          appSidebarRight.onCloseBtnClick();
        },
        withContext: undefined,
        autonomous: true
      });

      list.style.minHeight = Math.min(result.voters, 4) * 48 + 'px';

      fragment.append(hr, answerEl, list);

      let offset: string, limit = 4, loading = false, left = Math.max(0, result.voters - 4);
      const load = () => {
        if(loading) return;
        loading = true;

        this.managers.appPollsManager.getVotes(message, answer.option, offset, limit).then((votesList) => {
          votesList.votes.forEach((vote) => {
            const {dom} = appDialogsManager.addDialogNew({
              peerId: getPeerId(vote.peer),
              container: list,
              rippleEnabled: false,
              meAsSaved: false,
              avatarSize: 'small',
              withStories: false,
              wrapOptions: {
                middleware: this.middlewareHelper.get()
              }
            });
            dom.lastMessageSpan.parentElement.remove();
          });

          if(offset) {
            left = Math.max(0, left - votesList.votes.length);

            if(left) {
              (showMore.lastElementChild as HTMLElement).replaceWith(i18n('PollResults.LoadMore', [Math.min(20, left)]));
            }
          }

          offset = votesList.next_offset;
          limit = 20;

          if(!left || !votesList.votes.length) {
            showMore.remove();
          }
        }).finally(() => {
          loading = false;
        });
      };

      const showMore = Button('poll-results-more btn btn-primary btn-transparent', {icon: 'down'});
      showMore.addEventListener('click', load);
      showMore.append(i18n('PollResults.LoadMore', [Math.min(20, left)]));

      fragment.append(showMore);

      load();
    });

    this.resultsDiv.append(title, fragment);

    appSidebarRight.toggleSidebar(true).then(() => {
      /* appPollsManager.getVotes(mid).then((votes) => {
        console.log('gOt VotEs', votes);
      }); */
    });
  }
}
