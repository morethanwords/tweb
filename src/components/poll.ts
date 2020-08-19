import appPollsManager, { PollResults, Poll } from "../lib/appManagers/appPollsManager";
import { RichTextProcessor } from "../lib/richtextprocessor";
import { findUpClassName, $rootScope, cancelEvent } from "../lib/utils";
import { mediaSizes, touchSupport } from "../lib/config";
import { ripple } from "./misc";
import appSidebarRight from "../lib/appManagers/appSidebarRight";
import appImManager from "../lib/appManagers/appImManager";
import serverTimeManager from "../lib/mtproto/serverTimeManager";

let lineTotalLength = 0;
const tailLength = 9;
const times = 10;
const fullTime = 340;
const oneTime = fullTime / times;

export const roundPercents = (percents: number[]) => {
  //console.log('roundPercents before percents:', percents);

  const sum = percents.reduce((acc, p) => acc + Math.round(p), 0);
  if(sum > 100) {
    const diff = sum - 100;
    const length = percents.length;
    for(let i = 0; i < diff; ++i) {
      let minIndex = -1, minRemainder = 1;
      for(let k = 0; k < length; ++k) {
        let remainder = percents[k] % 1;
        if(remainder >= 0.5 && remainder < minRemainder) {
          minRemainder = remainder;
          minIndex = k;
        }
      }

      if(minIndex == -1) {
        //throw new Error('lol chto');
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
        let remainder = percents[k] % 1;
        if(remainder < 0.5 && remainder > maxRemainder) {
          maxRemainder = remainder;
          minIndex = k;
        }
      }

      if(minIndex == -1) {
        //throw new Error('lol chto');
        return;
      }

      percents[minIndex] += 1 - maxRemainder;
    }
  }

  //console.log('roundPercents after percents:', percents);
};

const connectedPolls: {id: string, element: PollElement}[] = [];
$rootScope.$on('poll_update', (e: CustomEvent) => {
  const {poll, results} = e.detail as {poll: Poll, results: PollResults};

  //console.log('poll_update', poll, results);
  for(const connected of connectedPolls) {
    if(connected.id == poll.id) {
      const pollElement = connected.element;
      pollElement.isClosed = !!poll.pFlags.closed;
      pollElement.performResults(results, poll.chosenIndexes);
    }
  }
});

$rootScope.$on('peer_changed', () => {
  if(prevQuizHint) {
    hideQuizHint(prevQuizHint, prevQuizHintOnHide, prevQuizHintTimeout);
  }
});

const hideQuizHint = (element: HTMLElement, onHide: () => void, timeout: number) => {
  element.classList.remove('active');

  clearTimeout(timeout);
  setTimeout(() => {
    onHide();
    element.remove();

    if(prevQuizHint == element && prevQuizHintOnHide == onHide && prevQuizHintTimeout == timeout) {
      prevQuizHint = prevQuizHintOnHide = null;
      prevQuizHintTimeout = 0;
    }
  }, 200);
};

let prevQuizHint: HTMLElement, prevQuizHintOnHide: () => void, prevQuizHintTimeout: number;
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

  textEl.innerHTML = RichTextProcessor.wrapRichText(solution, {entities: solution_entities});
  appImManager.bubblesContainer.append(element);

  void element.offsetLeft; // reflow
  element.classList.add('active');

  prevQuizHint = element;
  prevQuizHintOnHide = onHide;
  prevQuizHintTimeout = setTimeout(() => {
    hideQuizHint(element, onHide, prevQuizHintTimeout);
  }, touchSupport ? 5000 : 7000);
};

export default class PollElement extends HTMLElement {
  private svgLines: SVGSVGElement[];
  private numberDivs: HTMLDivElement[];
  private answerDivs: HTMLDivElement[];
  private descDiv: HTMLElement;
  private typeDiv: HTMLElement;
  private avatarsDiv: HTMLElement;
  private viewResults: HTMLElement;
  private votersCountDiv: HTMLDivElement;

  private maxOffset = -46.5;
  private maxLength: number;
  private maxLengths: number[];

  public isClosed = false;
  private isQuiz = false;
  private isRetracted = false;
  private isPublic = false;
  private isMultiple = false;
  private chosenIndexes: number[] = [];
  private percents: number[];

  private pollID: string;
  private mid: number;

  private quizInterval: number;
  private quizTimer: SVGSVGElement;

  private sendVoteBtn: HTMLElement;
  private chosingIndexes: number[] = [];

  private sendVotePromise: Promise<void>;
  private sentVote = false;

  constructor() {
    super();
    // элемент создан
  }

  connectedCallback() {
    // браузер вызывает этот метод при добавлении элемента в документ
    // (может вызываться много раз, если элемент многократно добавляется/удаляется)

    if(!lineTotalLength) {
      lineTotalLength = (document.getElementById('poll-line') as any as SVGPathElement).getTotalLength();
      console.log('line total length:', lineTotalLength);
    }

    this.pollID = this.getAttribute('poll-id');
    this.mid = +this.getAttribute('message-id');
    const {poll, results} = appPollsManager.getPoll(this.pollID);

    connectedPolls.push({id: this.pollID, element: this});

    console.log('pollElement poll:', poll, results);

    let desc = '';
    if(poll.pFlags) {
      this.isPublic = !!poll.pFlags.public_voters;
      this.isQuiz = !!poll.pFlags.quiz;
      this.isClosed = !!poll.pFlags.closed;
      this.isMultiple = !!poll.pFlags.multiple_choice;

      if(this.isClosed) {
        desc = 'Final results';
        this.classList.add('is-closed');
      } else {
        let type = this.isQuiz ? 'Quiz' : 'Poll';
        desc = (this.isPublic ? '' : 'Anonymous ') + type;
      }
    }

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
          <div class="poll-answer-text">${RichTextProcessor.wrapEmojiText(answer.text)}</div>
          <svg version="1.1" class="poll-line" style="display: none;" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${mediaSizes.active.regular.width} 35" xml:space="preserve">
            <use href="#poll-line"></use>
          </svg>
          <span class="poll-answer-selected tgico"></span>
        </div>
      `;
    }).join('');

    this.innerHTML = `
      <div class="poll-title">${poll.rQuestion}</div>
      <div class="poll-desc">
        <div class="poll-type">${desc}</div>
        <div class="poll-avatars"></div>
      </div>
      ${votes}
      <div class="poll-footer">
        <div class="poll-footer-button poll-view-results hide">View Results</div>
        <div class="poll-votes-count"></div>
      </div>
    `;

    this.descDiv = this.firstElementChild.nextElementSibling as HTMLElement;
    this.typeDiv = this.descDiv.firstElementChild as HTMLElement;
    this.avatarsDiv = this.descDiv.lastElementChild as HTMLElement;

    if(this.isQuiz) {
      this.classList.add('is-quiz');

      if(poll.close_period && poll.close_date) {
        const timeLeftDiv = document.createElement('div');
        timeLeftDiv.classList.add('poll-time');
        this.descDiv.append(timeLeftDiv);

        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        //svg.setAttributeNS(null, 'viewBox', '0 0 15 15');
        svg.classList.add('poll-quiz-timer');

        this.quizTimer = svg;
  
        const strokeWidth = 2;
        const radius = 7;
        const circumference = 2 * Math.PI * radius;
  
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.classList.add('poll-quiz-timer-circle');
        circle.setAttributeNS(null, 'cx', '16');
        circle.setAttributeNS(null, 'cy', '16');
        circle.setAttributeNS(null, 'r', '' + radius);
        circle.setAttributeNS(null, 'stroke-width', '' + strokeWidth);
  
        svg.append(circle);
        this.descDiv.append(svg);
        
        const period = poll.close_period * 1000;
        const closeTime = (poll.close_date - serverTimeManager.serverTimeOffset) * 1000;

        //console.log('closeTime:', poll.close_date, serverTimeManager.serverTimeOffset, Date.now() / 1000 | 0);

        // let time = Date.now();
        // let percents = (closeTime - time) / period;

        // timeLeftDiv.innerHTML = String((closeTime - time) / 1000 + 1 | 0).toHHMMSS();

        // // @ts-ignore
        // circle.style.strokeDashoffset = circumference + percents * circumference;
        // circle.style.strokeDasharray = ${circumference} ${circumference};

        this.quizInterval = setInterval(() => {
          const time = Date.now();
          const percents = (closeTime - time) / period;
          const timeLeft = (closeTime - time) / 1000 + 1 | 0;
          timeLeftDiv.innerHTML = String(timeLeft).toHHMMSS();
          
          if (timeLeft <= 5) {
            timeLeftDiv.style.color = '#ee545c';
            circle.style.stroke = '#ee545c';
          }
          //timeLeftDiv.style.visibility = 'visible';

          // @ts-ignore
          circle.style.strokeDashoffset = circumference + percents * circumference;
          circle.style.strokeDasharray = `${circumference} ${circumference}`;

          if(time >= closeTime) {
            clearInterval(this.quizInterval);
            timeLeftDiv.innerHTML = '';
            // @ts-ignore
            circle.style.strokeDashoffset = circumference;
            this.quizInterval = 0;

            setTimeout(() => {
              // нужно запросить апдейт чтобы опрос обновился
              appPollsManager.getResults(this.mid);
            }, 3e3);
          }
        }, 1e3);
      }
    }
    
    this.answerDivs = Array.from(this.querySelectorAll('.poll-answer')) as HTMLDivElement[];
    this.svgLines = Array.from(this.querySelectorAll('.poll-line')) as SVGSVGElement[];
    this.numberDivs = Array.from(this.querySelectorAll('.poll-answer-percents')) as HTMLDivElement[];

    const footerDiv = this.lastElementChild;
    this.viewResults = footerDiv.firstElementChild as HTMLElement;
    this.votersCountDiv = footerDiv.lastElementChild as HTMLDivElement;

    this.viewResults.addEventListener('click', (e) => {
      cancelEvent(e);
      appSidebarRight.pollResultsTab.init(this.pollID, this.mid);
    });
    ripple(this.viewResults);

    if(this.isMultiple) {
      this.sendVoteBtn = document.createElement('div');
      this.sendVoteBtn.classList.add('poll-footer-button', 'poll-send-vote');
      this.sendVoteBtn.innerText = 'Vote';
      ripple(this.sendVoteBtn);

      if(!poll.chosenIndexes.length) {
        this.votersCountDiv.classList.add('hide');
      }

      this.sendVoteBtn.addEventListener('click', () => {
        /* const indexes = this.answerDivs.filter(el => el.classList.contains('is-chosing')).map(el => +el.dataset.index);
        if(indexes.length) {
          
        } */
        if(this.chosingIndexes.length) {
          this.sendVotes(this.chosingIndexes).then(() => {
            this.chosingIndexes.length = 0;
            this.answerDivs.forEach(el => {
              el.classList.remove('is-chosing');
            });
          });
        }
      });

      footerDiv.append(this.sendVoteBtn);
    }

    const width = this.getBoundingClientRect().width;
    this.maxLength = width + tailLength + this.maxOffset + -13.7; // 13 - position left

    if(poll.chosenIndexes.length || this.isClosed) {
      this.performResults(results, poll.chosenIndexes);
    } else if(!this.isClosed) {
      this.setVotersCount(results);
      this.addEventListener('click', this.clickHandler);
    }
  }

  disconnectedCallback() {
    // браузер вызывает этот метод при удалении элемента из документа
    // (может вызываться много раз, если элемент многократно добавляется/удаляется)

    connectedPolls.findAndSplice(c => c.element == this);
  }

  static get observedAttributes(): string[] {
    return ['poll-id', 'message-id'/* массив имён атрибутов для отслеживания их изменений */];
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    // вызывается при изменении одного из перечисленных выше атрибутов
    if(name == 'poll-id') {
      this.pollID = newValue;
    } else if(name == 'message-id') {
      this.mid = +newValue;
    }
  }

  adoptedCallback() {
    // вызывается, когда элемент перемещается в новый документ
    // (происходит в document.adoptNode, используется очень редко)
  }

  initQuizHint(results: PollResults) {
    if(results.solution && results.solution_entities) {
      const toggleHint = document.createElement('div');
      toggleHint.classList.add('tgico-tip', 'poll-hint');
      this.descDiv.append(toggleHint);

      //let active = false;
      toggleHint.addEventListener('click', (e) => {
        cancelEvent(e);

        //active = true;
        toggleHint.classList.add('active');
        setQuizHint(results.solution, results.solution_entities, () => {
          //active = false;
          toggleHint.classList.remove('active');
        });
      });

      if(this.sentVote) {
        const correctResult = results.results.find(r => r.pFlags.correct);
        if(correctResult && !correctResult.pFlags.chosen) {
          toggleHint.click();
        }
      }
    }
  }

  clickHandler(e: MouseEvent) {
    const target = findUpClassName(e.target, 'poll-answer') as HTMLElement;
    if(!target) {
      return;
    }

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
  }

  sendVotes(indexes: number[]) {
    if(this.sendVotePromise) return this.sendVotePromise;

    const targets = this.answerDivs.filter((_, idx) => indexes.includes(idx));
    targets.forEach(target => {
      target.classList.add('is-voting');
    });
    
    this.classList.add('disable-hover');
    this.sentVote = true;
    return this.sendVotePromise = appPollsManager.sendVote(this.mid, indexes).then(() => {
      targets.forEach(target => {
        target.classList.remove('is-voting');
      });

      this.classList.remove('disable-hover');
    }).catch(() => {
      this.sentVote = false;
    }).finally(() => {
      this.sendVotePromise = null;
    });
  }

  performResults(results: PollResults, chosenIndexes: number[]) {
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
      this.typeDiv.innerText = 'Final results';
    }

    // set chosen
    if(this.chosenIndexes.length != chosenIndexes.length || this.isClosed) { // if we voted
      this.isRetracted = this.chosenIndexes.length && !chosenIndexes.length;
      this.chosenIndexes = chosenIndexes.slice();

      if(this.isRetracted) {
        this.addEventListener('click', this.clickHandler);
      } else {
        this.removeEventListener('click', this.clickHandler);
      }
    }
    
    // is need update
    if(this.chosenIndexes.length || this.isRetracted || this.isClosed) {
      const percents = results.results.map(v => results.total_voters ? v.voters / results.total_voters * 100 : 0);
      this.setResults(this.isRetracted ? this.percents : percents, this.chosenIndexes);
      this.percents = percents;
      this.isRetracted = false;
    }
    
    this.setVotersCount(results);

    if(this.isPublic) {
      if(!this.isMultiple) {
        this.viewResults.classList.toggle('hide', !results.total_voters || !this.chosenIndexes.length);
        this.votersCountDiv.classList.toggle('hide', !!this.chosenIndexes.length);
      }

      let html = '';
      /**
       * MACOS, ANDROID - без реверса
       * WINDOWS DESKTOP - реверс
       * все приложения накладывают аватарку первую на вторую, а в макете зато вторая на первую, ЛОЛ!
       */
      results.recent_voters/* .slice().reverse() */.forEach((userID, idx) => {
        const style = idx == 0 ? '' : `style="transform: translateX(-${idx * 3}px);"`;
        html += `<avatar-element dialog="0" peer="${userID}" ${style}></avatar-element>`;
      });
      this.avatarsDiv.innerHTML = html;
    }

    if(this.isMultiple) {
      this.sendVoteBtn.classList.toggle('hide', !!this.chosenIndexes.length);
      if(!this.chosenIndexes.length) {
        this.votersCountDiv.classList.add('hide');
        this.viewResults.classList.add('hide');
      } else if(this.isPublic) {
        this.viewResults.classList.toggle('hide', !results.total_voters || !this.chosenIndexes.length);
        this.votersCountDiv.classList.toggle('hide', !!this.chosenIndexes.length);
      } else {
        this.votersCountDiv.classList.toggle('hide', !this.chosenIndexes.length);
      }
    }
  }

  setResults(percents: number[], chosenIndexes: number[]) {
    this.svgLines.forEach(svg => svg.style.display = '');

    this.answerDivs.forEach((el, idx) => {
      el.classList.toggle('is-chosen', chosenIndexes.includes(idx));
    });

    const maxValue = Math.max(...percents);
    this.maxLengths = percents.map(p => p / maxValue * this.maxLength);

    // line
    if(this.isRetracted) {
      this.svgLines.forEach((svg, idx) => {
        this.setLineProgress(idx, -1);
      });
    } else {
      this.svgLines.forEach((svg, idx) => {
        void svg.getBoundingClientRect(); // reflow
        this.setLineProgress(idx, 1);
      });
    }

    percents = percents.slice();
    roundPercents(percents);
    // numbers
    if(this.isRetracted) {
      for(let i = (times - 1), k = 0; i >= 0; --i, ++k) {
        setTimeout(() => {
          percents.forEach((percents, idx) => {
            const value = Math.round(percents / times * i);
            this.numberDivs[idx].innerText = value + '%';
          });
        }, oneTime * k);
      }
    } else {
      for(let i = 0; i < times; ++i) {
        setTimeout(() => {
          percents.forEach((percents, idx) => {
            const value = Math.round(percents / times * (i + 1));
            this.numberDivs[idx].innerText = value + '%';
          });
        }, oneTime * i);
      }
    }

    if(this.isRetracted) {
      this.classList.add('is-retracting');
      this.classList.remove('is-voted');
      setTimeout(() => {
        this.classList.remove('is-retracting');
        this.svgLines.forEach(svg => svg.style.display = 'none');
      }, fullTime);
    } else {
      this.classList.add('is-voted');
    }
  }

  setVotersCount(results: PollResults) {
    const votersCount = results.total_voters || 0;
    const votersOrAnswers = this.isQuiz ? (votersCount > 1 || !votersCount ? 'answers' : 'answer') : (votersCount > 1 || !votersCount ? 'votes' : 'vote');

    this.votersCountDiv.innerText = `${results.total_voters ? results.total_voters + ' ' + votersOrAnswers : 'No ' + votersOrAnswers}`;
  }

  setLineProgress(index: number, percents: number) {
    const svg = this.svgLines[index];

    if(percents == -1) {
      svg.style.strokeDasharray = '';
      svg.style.strokeDashoffset = '';
    } else {
      svg.style.strokeDasharray = (percents * this.maxLengths[index]) + ', 485.9';
      svg.style.strokeDashoffset = '' + percents * this.maxOffset;
    }
  }

  // у элемента могут быть ещё другие методы и свойства
}

customElements.define("poll-element", PollElement);