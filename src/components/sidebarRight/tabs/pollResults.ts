import { SliderSuperTab } from "../../slider";
import appSidebarRight from "..";
import appPollsManager from "../../../lib/appManagers/appPollsManager";
import { roundPercents } from "../../poll";
import { RichTextProcessor } from "../../../lib/richtextprocessor";
import appDialogsManager from "../../../lib/appManagers/appDialogsManager";
import { ripple } from "../../ripple";

export default class AppPollResultsTab extends SliderSuperTab {
  private resultsDiv: HTMLElement;

  protected init() {
    this.container.id = 'poll-results-container';
    this.container.classList.add('chatlist-container');

    this.title.innerHTML = 'Results';

    this.resultsDiv = document.createElement('div');
    this.resultsDiv.classList.add('poll-results');
    this.scrollable.append(this.resultsDiv);
  }

  public open(message: any) {
    const ret = super.open();
    const poll = appPollsManager.getPoll(message.media.poll.id);

    const title = document.createElement('h3');
    title.innerHTML = poll.poll.rQuestion;

    const percents = poll.results.results.map(v => v.voters / poll.results.total_voters * 100);
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
      answerTitle.innerHTML = RichTextProcessor.wrapEmojiText(answer.text);

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

        appPollsManager.getVotes(message, answer.option, offset, limit).then(votesList => {
          votesList.votes.forEach(vote => {
            const {dom} = appDialogsManager.addDialogNew({
              dialog: vote.user_id,
              container: list,
              drawStatus: false,
              rippleEnabled: false, 
              meAsSaved: false,
              avatarSize: 32
            });
            dom.lastMessageSpan.parentElement.remove();
          });

          if(offset) {
            left -= votesList.votes.length;
            (showMore.lastElementChild as HTMLElement).innerText = `Show ${Math.min(20, left)} more voter${left > 1 ? 's' : ''}`;
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
      showMore.classList.add('poll-results-more', 'show-more');
      showMore.addEventListener('click', load);

      showMore.innerHTML = `<div class="tgico-down"></div><div>Show ${Math.min(20, left)} more voter${left > 1 ? 's' : ''}</div>`;
      ripple(showMore);

      fragment.append(showMore);
    });

    this.resultsDiv.append(title, fragment);

    appSidebarRight.toggleSidebar(true).then(() => {
      /* appPollsManager.getVotes(mid).then(votes => {
        console.log('gOt VotEs', votes);
      }); */
    });

    return ret;
  }
}
