/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import mediaSizes from '../helpers/mediaSizes';
import IS_TOUCH_SUPPORTED from '../environment/touchSupport';
import appImManager from '../lib/appManagers/appImManager';
import rootScope from '../lib/rootScope';
import ripple from './ripple';
import appSidebarRight from './sidebarRight';
import AppPollResultsTab from './sidebarRight/tabs/pollResults';
import {FormatterArguments, i18n, LangPackKey} from '../lib/langPack';
import {fastRaf} from '../helpers/schedulers';
import SetTransition from './singleTransition';
import findUpClassName from '../helpers/dom/findUpClassName';
import cancelEvent from '../helpers/dom/cancelEvent';
import {attachClickEvent, simulateClickEvent} from '../helpers/dom/clickEvent';
import replaceContent from '../helpers/dom/replaceContent';
import windowSize from '../helpers/windowSize';
import {Message, MessageMedia, Poll, PollResults} from '../layer';
import toHHMMSS from '../helpers/string/toHHMMSS';
import StackedAvatars from './stackedAvatars';
import setInnerHTML from '../helpers/dom/setInnerHTML';
import {AppManagers} from '../lib/appManagers/managers';
import wrapEmojiText from '../lib/richTextProcessor/wrapEmojiText';
import wrapRichText from '../lib/richTextProcessor/wrapRichText';
import liteMode from '../helpers/liteMode';

let lineTotalLength = 0;
const tailLength = 9;
const times = 10;
const fullTime = 340;
const oneTime = fullTime / times;

export const roundPercents = (percents: number[]) => {
  // console.log('roundPercents before percents:', percents);

  const sum = percents.reduce((acc, p) => acc + Math.round(p), 0);
  if(sum > 100) {
    const diff = sum - 100;
    const length = percents.length;
    for(let i = 0; i < diff; ++i) {
      let minIndex = -1, minRemainder = 1;
      for(let k = 0; k < length; ++k) {
        const remainder = percents[k] % 1;
        if(remainder >= 0.5 && remainder < minRemainder) {
          minRemainder = remainder;
          minIndex = k;
        }
      }

      if(minIndex === -1) {
        // throw new Error('lol chto');
        return;
      }

      percents[minIndex] -= minRemainder;
    }
  } else if(sum < 100) {
    const diff = 100 - sum;
    const length = percents.length;
    for(let i = 0; i < diff; ++i) {
      let minIndex = -1, maxRemainder = 0;
      for(let k = 0; k < length; ++k) {
        const remainder = percents[k] % 1;
        if(remainder < 0.5 && remainder > maxRemainder) {
          maxRemainder = remainder;
          minIndex = k;
        }
      }

      if(minIndex === -1) {
        // throw new Error('lol chto');
        return;
      }

      percents[minIndex] += 1 - maxRemainder;
    }
  }

  // console.log('roundPercents after percents:', percents);
};

/* const connectedPolls: {id: string, element: PollElement}[] = [];
rootScope.on('poll_update', (e) => {
  const {poll, results} = e as {poll: Poll, results: PollResults};

  //console.log('poll_update', poll, results);
  for(const connected of connectedPolls) {
    if(connected.id === poll.id) {
      const pollElement = connected.element;
      pollElement.isClosed = !!poll.pFlags.closed;
      pollElement.performResults(results, poll.chosenIndexes);
    }
  }
}); */

rootScope.addEventListener('poll_update', ({poll, results}) => {
  const pollElements = Array.from(document.querySelectorAll(`poll-element[poll-id="${poll.id}"]`)) as PollElement[];
  pollElements.forEach((pollElement) => {
    // console.log('poll_update', poll, results);
    pollElement.isClosed = !!poll.pFlags.closed;
    pollElement.performResults(results, poll.chosenIndexes);
  });
});

mediaSizes.addEventListener('resize', () => {
  PollElement.setMaxLength();
  PollElement.resizePolls();
});

mediaSizes.addEventListener('changeScreen', () => {
  PollElement.setMaxLength();
});

const hideQuizHint = (element: HTMLElement, onHide: () => void, timeout: number) => {
  element.classList.remove('active');

  clearTimeout(timeout);
  setTimeout(() => {
    onHide();
    element.remove();

    if(prevQuizHint === element && prevQuizHintOnHide === onHide && prevQuizHintTimeout === timeout) {
      prevQuizHint = prevQuizHintOnHide = null;
      prevQuizHintTimeout = 0;
    }
  }, 200);
};

let prevQuizHint: HTMLElement, prevQuizHintOnHide: () => void, prevQuizHintTimeout: number;
let isListenerSet = false;
const setQuizHint = (solution: string, solution_entities: any[], onHide: () => void) => {
  if(prevQuizHint) {
    hideQuizHint(prevQuizHint, prevQuizHintOnHide, prevQuizHintTimeout);
  }

  const element = document.createElement('div');
  element.classList.add('quiz-hint');

  const container = document.createElement('div');
  container.classList.add('container', 'tgico');

  const textEl = document.createElement('div');
  textEl.classList.add('text');

  container.append(textEl);
  element.append(container);

  setInnerHTML(textEl, wrapRichText(solution, {entities: solution_entities}));
  appImManager.chat.bubbles.container.append(element);

  void element.offsetLeft; // reflow
  element.classList.add('active');

  prevQuizHint = element;
  prevQuizHintOnHide = onHide;
  prevQuizHintTimeout = window.setTimeout(() => {
    hideQuizHint(element, onHide, prevQuizHintTimeout);
  }, IS_TOUCH_SUPPORTED ? 5000 : 7000);

  if(!isListenerSet) {
    isListenerSet = true;
    appImManager.addEventListener('peer_changed', () => {
      if(prevQuizHint) {
        hideQuizHint(prevQuizHint, prevQuizHintOnHide, prevQuizHintTimeout);
      }
    });
  }
};

export default class PollElement extends HTMLElement {
  public static MAX_OFFSET = -46.5;
  public static MAX_LENGTH = 0;
  public svgLines: SVGSVGElement[];
  private numberDivs: HTMLDivElement[];
  private answerDivs: HTMLDivElement[];
  private descDiv: HTMLElement;
  private typeDiv: HTMLElement;
  private avatarsDiv: HTMLElement;
  private viewResults: HTMLElement;
  private votersCountDiv: HTMLDivElement;

  // private maxLength: number;
  // private maxLengths: number[];
  private maxPercents: number[];

  public isClosed = false;
  private isQuiz = false;
  private isRetracted = false;
  private isPublic = false;
  private isMultiple = false;
  private chosenIndexes: number[] = [];
  private percents: number[];

  public message: Message.message;
  public managers: AppManagers;

  private quizInterval: number;
  private quizTimer: SVGSVGElement;

  private sendVoteBtn: HTMLElement;
  private chosingIndexes: number[] = [];

  private sendVotePromise: Promise<void>;
  private sentVote = false;

  private detachClickEvent: () => void;

  public static setMaxLength() {
    const width = windowSize.width <= 360 ? windowSize.width - 120 : mediaSizes.active.poll.width;
    this.MAX_LENGTH = width + tailLength + this.MAX_OFFSET + -13.7; // 13 - position left
  }

  public static resizePolls() {
    if(!this.MAX_LENGTH) return;
    const pollElements = Array.from(document.querySelectorAll('poll-element.is-voted')) as PollElement[];
    pollElements.forEach((pollElement) => {
      pollElement.svgLines.forEach((svg, idx) => {
        // void svg.getBoundingClientRect(); // reflow
        pollElement.setLineProgress(idx, 1);
      });
    });
  }

  public async render() {
    // браузер вызывает этот метод при добавлении элемента в документ
    // (может вызываться много раз, если элемент многократно добавляется/удаляется)

    if(!lineTotalLength) {
      lineTotalLength = (document.getElementById('poll-line') as any as SVGPathElement).getTotalLength();
      // console.log('line total length:', lineTotalLength);
      PollElement.setMaxLength();
    }

    // const {poll, results} = this.managers.appPollsManager.getPoll(pollId);
    const {poll, results} = this.message.media as MessageMedia.messageMediaPoll;

    /* const timestamp = Date.now() / 1000 | 0;
    if(timestamp < this.message.date) { */
    if(this.message.pFlags.is_scheduled) {
      this.classList.add('disable-hover');
    }

    // console.log('pollElement poll:', poll, results);

    let descKey: LangPackKey;
    if(poll.pFlags) {
      this.isPublic = !!poll.pFlags.public_voters;
      this.isQuiz = !!poll.pFlags.quiz;
      this.isClosed = !!poll.pFlags.closed;
      this.isMultiple = !!poll.pFlags.multiple_choice;

      if(this.isClosed) {
        descKey = 'Chat.Poll.Type.Closed';
        this.classList.add('is-closed');
      } else if(this.isQuiz) {
        descKey = this.isPublic ? 'Chat.Poll.Type.Quiz' : 'Chat.Poll.Type.AnonymousQuiz';
      } else {
        descKey = this.isPublic ? 'Chat.Poll.Type.Public' : 'Chat.Poll.Type.Anonymous';
      }
    }

    this.classList.toggle('is-multiple', this.isMultiple);

    const multipleSelect = this.isMultiple ? '<span class="poll-answer-selected tgico-check"></span>' : '';
    const votes = poll.answers.map((answer, idx) => {
      return `
        <div class="poll-answer" data-index="${idx}">
          <div class="circle-hover">
            <div class="animation-ring"></div>
            <svg class="progress-ring">
              <circle class="progress-ring__circle" cx="13" cy="13" r="9"></circle>
            </svg>
            ${multipleSelect}
          </div>
          <div class="poll-answer-percents"></div>
          <div class="poll-answer-text"></div>
          <svg version="1.1" class="poll-line" style="display: none;" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 485.9 35" xml:space="preserve">
            <use href="#poll-line"></use>
          </svg>
          <span class="poll-answer-selected tgico"></span>
        </div>
      `;
    }).join('');

    this.innerHTML = `
      <div class="poll-title"></div>
      <div class="poll-desc">
        <div class="poll-type"></div>
        <div class="poll-avatars"></div>
      </div>
      ${votes}`;

    setInnerHTML(this.firstElementChild, wrapEmojiText(poll.question));

    Array.from(this.querySelectorAll('.poll-answer-text')).forEach((el, idx) => {
      setInnerHTML(el, wrapEmojiText(poll.answers[idx].text));
    });

    this.descDiv = this.firstElementChild.nextElementSibling as HTMLElement;
    this.typeDiv = this.descDiv.firstElementChild as HTMLElement;
    this.avatarsDiv = this.descDiv.lastElementChild as HTMLElement;

    if(descKey) {
      this.typeDiv.append(i18n(descKey));
    }

    if(this.isQuiz) {
      this.classList.add('is-quiz');

      if(poll.close_period && poll.close_date) {
        const timeLeftDiv = document.createElement('div');
        timeLeftDiv.classList.add('poll-time');
        this.descDiv.append(timeLeftDiv);

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        // svg.setAttributeNS(null, 'viewBox', '0 0 15 15');
        svg.classList.add('poll-quiz-timer');

        this.quizTimer = svg;

        const strokeWidth = 2;
        const radius = 7;
        const circumference = 2 * Math.PI * radius;

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.classList.add('poll-quiz-timer-circle');
        circle.setAttributeNS(null, 'cx', '16');
        circle.setAttributeNS(null, 'cy', '16');
        circle.setAttributeNS(null, 'r', '' + radius);
        circle.setAttributeNS(null, 'stroke-width', '' + strokeWidth);

        svg.append(circle);
        this.descDiv.append(svg);

        const period = poll.close_period * 1000;
        const closeTime = (poll.close_date - await rootScope.managers.timeManager.getServerTimeOffset()) * 1000;

        // console.log('closeTime:', poll.close_date, serverTimeManager.serverTimeOffset, Date.now() / 1000 | 0);

        // let time = Date.now();
        // let percents = (closeTime - time) / period;

        // timeLeftDiv.innerHTML = String((closeTime - time) / 1000 + 1 | 0).toHHMMSS();

        // // @ts-ignore
        // circle.style.strokeDashoffset = circumference + percents * circumference;
        // circle.style.strokeDasharray = ${circumference} ${circumference};

        this.quizInterval = window.setInterval(() => {
          const time = Date.now();
          const percents = (closeTime - time) / period;
          const timeLeft = (closeTime - time) / 1000 + 1 | 0;
          timeLeftDiv.textContent = toHHMMSS(timeLeft);

          if(timeLeft <= 5) {
            timeLeftDiv.style.color = '#ee545c';
            circle.style.stroke = '#ee545c';
          }
          // timeLeftDiv.style.visibility = 'visible';

          // @ts-ignore
          circle.style.strokeDashoffset = circumference + percents * circumference;
          circle.style.strokeDasharray = `${circumference} ${circumference}`;

          if(time >= closeTime) {
            clearInterval(this.quizInterval);
            timeLeftDiv.replaceChildren();
            // @ts-ignore
            circle.style.strokeDashoffset = circumference;
            this.quizInterval = 0;

            setTimeout(() => {
              // нужно запросить апдейт чтобы опрос обновился
              this.managers.appPollsManager.getResults(this.message);
            }, 3e3);
          }
        }, 1e3);
      }
    }

    this.answerDivs = Array.from(this.querySelectorAll('.poll-answer')) as HTMLDivElement[];
    this.svgLines = Array.from(this.querySelectorAll('.poll-line')) as SVGSVGElement[];
    this.numberDivs = Array.from(this.querySelectorAll('.poll-answer-percents')) as HTMLDivElement[];

    const footerDiv = document.createElement('div');
    footerDiv.classList.add('poll-footer');

    this.viewResults = document.createElement('div');
    this.viewResults.className = 'poll-footer-button poll-view-results hide';
    this.viewResults.append(i18n('Chat.Poll.ViewResults'));

    this.votersCountDiv = document.createElement('div');
    this.votersCountDiv.className = 'poll-votes-count';

    footerDiv.append(this.viewResults, this.votersCountDiv);
    this.append(footerDiv);

    this.viewResults.addEventListener('click', (e) => {
      cancelEvent(e);

      if(!appSidebarRight.isTabExists(AppPollResultsTab)) {
        appSidebarRight.createTab(AppPollResultsTab).open(this.message);
      }
    });
    ripple(this.viewResults);

    if(this.isMultiple) {
      this.sendVoteBtn = document.createElement('div');
      this.sendVoteBtn.classList.add('poll-footer-button', 'poll-send-vote');
      this.sendVoteBtn.append(i18n('Chat.Poll.SubmitVote'));
      ripple(this.sendVoteBtn);

      if(!poll.chosenIndexes.length) {
        this.votersCountDiv.classList.add('hide');
      }

      attachClickEvent(this.sendVoteBtn, (e) => {
        cancelEvent(e);
        /* const indexes = this.answerDivs.filter((el) => el.classList.contains('is-chosing')).map((el) => +el.dataset.index);
        if(indexes.length) {

        } */
        if(this.chosingIndexes.length) {
          this.sendVotes(this.chosingIndexes).then(() => {
            this.chosingIndexes.length = 0;
            this.answerDivs.forEach((el) => {
              el.classList.remove('is-chosing');
            });
          });
        }
      });

      footerDiv.append(this.sendVoteBtn);
    }

    // const width = this.getBoundingClientRect().width;
    // const width = mediaSizes.active.poll.width;
    // this.maxLength = width + tailLength + this.maxOffset + -13.7; // 13 - position left

    const canVote = !(poll.chosenIndexes.length || this.isClosed);
    if(!canVote || this.isPublic) {
      this.performResults(results, poll.chosenIndexes, false);
    }

    if(canVote) {
      this.setVotersCount(results);
      this.detachClickEvent = attachClickEvent(this, this.clickHandler);
    }
  }

  initQuizHint(results: PollResults) {
    if(results.solution && results.solution_entities) {
      const toggleHint = document.createElement('div');
      toggleHint.classList.add('tgico-tip', 'poll-hint');
      this.descDiv.append(toggleHint);

      // let active = false;
      attachClickEvent(toggleHint, (e) => {
        cancelEvent(e);

        // active = true;
        toggleHint.classList.add('active');
        setQuizHint(results.solution, results.solution_entities, () => {
          // active = false;
          toggleHint.classList.remove('active');
        });
      });

      if(this.sentVote) {
        const correctResult = results.results.find((r) => r.pFlags.correct);
        if(correctResult && !correctResult.pFlags.chosen) {
          simulateClickEvent(toggleHint);
        }
      }
    }
  }

  clickHandler = (e: Event) => {
    const target = findUpClassName(e.target, 'poll-answer') as HTMLElement;
    if(!target) {
      return;
    }

    cancelEvent(e);
    const answerIndex = +target.dataset.index;
    if(this.isMultiple) {
      target.classList.toggle('is-chosing');

      const foundIndex = this.chosingIndexes.indexOf(answerIndex);
      if(foundIndex !== -1) {
        this.chosingIndexes.splice(foundIndex, 1);
      } else {
        this.chosingIndexes.push(answerIndex);
      }
    } else {
      this.sendVotes([answerIndex]);
    }

    /* target.classList.add('is-voting');
    setTimeout(() => { // simulate
      this.setResults([100, 0], answerIndex);
      target.classList.remove('is-voting');
    }, 1000); */
  };

  sendVotes(indexes: number[]) {
    if(this.sendVotePromise) return this.sendVotePromise;

    const targets = this.answerDivs.filter((_, idx) => indexes.includes(idx));
    targets.forEach((target) => {
      target.classList.add('is-voting');
    });

    this.classList.add('disable-hover');
    this.sentVote = true;
    return this.sendVotePromise = this.managers.appPollsManager.sendVote(this.message, indexes).then(() => {
      targets.forEach((target) => {
        target.classList.remove('is-voting');
      });

      this.classList.remove('disable-hover');
    }).catch(() => {
      this.sentVote = false;
    }).finally(() => {
      this.sendVotePromise = null;
    });
  }

  performResults(results: PollResults, chosenIndexes: number[], animate = true) {
    if(!liteMode.isAvailable('animations')) {
      animate = false;
    }

    if(this.isQuiz && (results.results?.length || this.isClosed)) {
      this.answerDivs.forEach((el, idx) => {
        el.classList.toggle('is-correct', !!results.results[idx].pFlags.correct);
      });

      if(this.initQuizHint) {
        this.initQuizHint(results);
        this.initQuizHint = null;
      }

      if(this.quizInterval) {
        clearInterval(this.quizInterval);
        this.quizInterval = 0;
      }

      if(this.quizTimer?.parentElement) {
        this.quizTimer.remove();
      }

      const timeEl = this.descDiv.querySelector('.poll-time');
      if(timeEl) {
        timeEl.remove();
      }
    }

    if(this.isClosed) {
      this.classList.add('is-closed');
      replaceContent(this.typeDiv, i18n('Chat.Poll.Type.Closed'));
    }

    // set chosen
    if(this.chosenIndexes.length !== chosenIndexes.length || this.isClosed) { // if we voted
      this.isRetracted = this.chosenIndexes.length && !chosenIndexes.length;
      this.chosenIndexes = chosenIndexes.slice();

      if(this.isRetracted) {
        this.detachClickEvent = attachClickEvent(this, this.clickHandler);
      } else {
        this.detachClickEvent?.();
        this.detachClickEvent = undefined;
      }
    }

    // is need update
    if(this.chosenIndexes.length || this.isRetracted || this.isClosed) {
      const percents = results.results.map((v) => results.total_voters ? v.voters / results.total_voters * 100 : 0);

      this.classList.toggle('no-transition', !animate);
      if(animate) {
        SetTransition({
          element: this,
          className: '',
          forwards: !this.isRetracted,
          duration: 340
        });
      }

      fastRaf(() => {
        this.setResults(this.isRetracted ? this.percents : percents, this.chosenIndexes, animate);
        this.percents = percents;
        this.isRetracted = false;
      });
    }

    this.setVotersCount(results);

    if(this.isPublic) {
      if(!this.isMultiple) {
        this.viewResults.classList.toggle('hide', !results.total_voters || !this.chosenIndexes.length);
        this.votersCountDiv.classList.toggle('hide', !!this.chosenIndexes.length);
      }

      const peerIds = (results.recent_voters || []).map((userId) => userId.toPeerId());
      const stackedAvatars = new StackedAvatars({avatarSize: 16});
      stackedAvatars.render(peerIds);
      replaceContent(this.avatarsDiv, stackedAvatars.container);
    }

    if(this.isMultiple) {
      const isVoted = !!this.chosenIndexes.length;

      const hideSendVoteBtn = this.isClosed || isVoted;
      const hideViewResultsBtn = !this.isPublic || !results.total_voters || (!isVoted && !this.isClosed);
      this.sendVoteBtn.classList.toggle('hide', hideSendVoteBtn);
      this.viewResults.classList.toggle('hide', hideViewResultsBtn);
      this.votersCountDiv.classList.toggle('hide', !hideSendVoteBtn || !hideViewResultsBtn);
    }
  }

  setResults(percents: number[], chosenIndexes: number[], animate: boolean) {
    this.svgLines.forEach((svg) => svg.style.display = '');

    this.answerDivs.forEach((el, idx) => {
      el.classList.toggle('is-chosen', chosenIndexes.includes(idx));
    });

    const maxValue = Math.max(...percents);
    // this.maxLengths = percents.map((p) => p / maxValue * this.maxLength);
    this.maxPercents = percents.map((p) => p / maxValue);

    // line
    if(this.isRetracted) {
      this.svgLines.forEach((svg, idx) => {
        this.setLineProgress(idx, -1);
      });
    } else {
      const cb = () => {
        this.svgLines.forEach((svg, idx) => {
          // void svg.getBoundingClientRect(); // reflow
          this.setLineProgress(idx, 1);
        });
      };

      animate ? fastRaf(cb) : cb();
    }

    percents = percents.slice();
    roundPercents(percents);
    let getPercentValue: (percents: number, index: number) => number;
    const iterate = (i: number) => {
      percents.forEach((percents, idx) => {
        const value = getPercentValue(percents, i);
        this.numberDivs[idx].innerText = value + '%';
      });
    };
    // numbers
    if(this.isRetracted) {
      getPercentValue = (percents, index) => Math.round(percents / times * index);

      if(animate) {
        for(let i = (times - 1), k = 0; i >= 0; --i, ++k) {
          setTimeout(() => {
            iterate(i);
          }, oneTime * k);
        }
      } else {
        iterate(0);
      }
    } else {
      getPercentValue = (percents, index) => Math.round(percents / times * (index + 1));

      if(animate) {
        for(let i = 0; i < times; ++i) {
          setTimeout(() => {
            iterate(i);
          }, oneTime * i);
        }
      } else {
        iterate(times - 1);
      }
    }

    if(this.isRetracted) {
      if(animate) {
        this.classList.add('is-retracting');
      }

      this.classList.remove('is-voted');
      const cb = () => {
        this.svgLines.forEach((svg) => svg.style.display = 'none');
      };

      if(animate) {
        setTimeout(() => {
          this.classList.remove('is-retracting');
          cb();
        }, fullTime);
      } else {
        cb();
      }
    } else {
      this.classList.add('is-voted');
    }
  }

  setVotersCount(results: PollResults) {
    const votersCount = results.total_voters || 0;
    let key: LangPackKey;
    const args: FormatterArguments = [votersCount];
    if(this.isClosed) {
      if(this.isQuiz) key = votersCount ? 'Chat.Quiz.TotalVotes' : 'Chat.Quiz.TotalVotesResultEmpty';
      else key = votersCount ? 'Chat.Poll.TotalVotes1' : 'Chat.Poll.TotalVotesResultEmpty';
    } else {
      if(this.isQuiz) key = votersCount ? 'Chat.Quiz.TotalVotes' : 'Chat.Quiz.TotalVotesEmpty';
      else key = votersCount ? 'Chat.Poll.TotalVotes1' : 'Chat.Poll.TotalVotesEmpty';
    }

    replaceContent(this.votersCountDiv, i18n(key, args));
  }

  setLineProgress(index: number, multiplier: number) {
    const svg = this.svgLines[index];

    if(multiplier === -1) {
      svg.style.strokeDasharray = '';
      svg.style.strokeDashoffset = '';
    } else {
      // svg.style.strokeDasharray = (multiplier * this.maxLengths[index]) + ', 485.9';
      svg.style.strokeDasharray = (multiplier * this.maxPercents[index] * PollElement.MAX_LENGTH) + ', 485.9';
      // svg.style.strokeDasharray = (multiplier * this.maxPercents[index] * 100) + '%, 485.9';
      svg.style.strokeDashoffset = '' + multiplier * PollElement.MAX_OFFSET;
    }
  }

  // у элемента могут быть ещё другие методы и свойства
}

customElements.define('poll-element', PollElement);
