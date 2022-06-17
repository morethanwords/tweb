/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { SliderSuperTab } from "../../slider";
import appSidebarRight from "..";
import { roundPercents } from "../../poll";
import appDialogsManager from "../../../lib/appManagers/appDialogsManager";
import ripple from "../../ripple";
import { i18n } from "../../../lib/langPack";
import setInnerHTML from "../../../helpers/dom/setInnerHTML";
import wrapEmojiText from "../../../lib/richTextProcessor/wrapEmojiText";

export default class AppPollResultsTab extends SliderSuperTab {
  private resultsDiv: HTMLElement;

  protected init() {
    this.container.id = 'poll-results-container';
    this.container.classList.add('chatlist-container');

    this.resultsDiv = document.createElement('div');
    this.resultsDiv.classList.add('poll-results');
    this.scrollable.append(this.resultsDiv);
  }

  public async open(message: any) {
    const ret = super.open();
    const poll = await this.managers.appPollsManager.getPoll(message.media.poll.id);

    this.setTitle(poll.poll.pFlags.quiz ? 'PollResults.Title.Quiz' : 'PollResults.Title.Poll');

    const title = document.createElement('h3');
    setInnerHTML(title, wrapEmojiText(poll.poll.question));

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
      setInnerHTML(answerTitle, wrapEmojiText(answer.text));

      const answerPercents = document.createElement('div');
      answerPercents.innerText = Math.round(percents[idx]) + '%';

      answerEl.append(answerTitle, answerPercents);

      // Humans
      const list = appDialogsManager.createChatList();
      list.classList.add('poll-results-voters');

      appDialogsManager.setListClickListener(list, () => {
        appSidebarRight.onCloseBtnClick();
      }, undefined, true);

      list.style.minHeight = Math.min(result.voters, 4) * 50 + 'px';

      fragment.append(hr, answerEl, list);

      let offset: string, limit = 4, loading = false, left = result.voters - 4;
      const load = () => {
        if(loading) return;
        loading = true;

        this.managers.appPollsManager.getVotes(message, answer.option, offset, limit).then((votesList) => {
          votesList.votes.forEach((vote) => {
            const {dom} = appDialogsManager.addDialogNew({
              peerId: vote.user_id.toPeerId(false),
              container: list,
              rippleEnabled: false, 
              meAsSaved: false,
              avatarSize: 32
            });
            dom.lastMessageSpan.parentElement.remove();
          });

          if(offset) {
            left -= votesList.votes.length;
            (showMore.lastElementChild as HTMLElement).replaceWith(i18n('PollResults.LoadMore', [Math.min(20, left)]));
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

      load();

      if(left <= 0) return;

      const showMore = document.createElement('div');
      showMore.classList.add('poll-results-more', 'show-more', 'rp-overflow');
      showMore.addEventListener('click', load);
      ripple(showMore);
      const down = document.createElement('div');
      down.classList.add('tgico-down');
      showMore.append(down, i18n('PollResults.LoadMore', [Math.min(20, left)]));

      fragment.append(showMore);
    });

    this.resultsDiv.append(title, fragment);

    appSidebarRight.toggleSidebar(true).then(() => {
      /* appPollsManager.getVotes(mid).then((votes) => {
        console.log('gOt VotEs', votes);
      }); */
    });

    return ret;
  }
}
