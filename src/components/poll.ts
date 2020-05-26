import appPollsManager, { PollResults, Poll } from "../lib/appManagers/appPollsManager";
import { RichTextProcessor } from "../lib/richtextprocessor";
import { findUpClassName, $rootScope } from "../lib/utils";

let lineTotalLength = 0;
const tailLength = 9;
const times = 10;
const fullTime = 340;
const oneTime = fullTime / times;

let roundPercents = (percents: number[]) => {
  //console.log('roundPercents before percents:', percents);

  let sum = percents.reduce((acc, p) => acc + Math.round(p), 0);
  if(sum > 100) {
    let diff = sum - 100;
    let length = percents.length;
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
        throw new Error('lol chto');
      }

      percents[minIndex] -= minRemainder;
    }
  } else if(sum < 100) {
    let diff = 100 - sum;
    let length = percents.length;
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
        throw new Error('lol chto');
      }

      percents[minIndex] += 1 - maxRemainder;
    }
  }

  //console.log('roundPercents after percents:', percents);
};

const connectedPolls: {id: string, element: PollElement}[] = [];
$rootScope.$on('poll_update', (e: CustomEvent) => {
  let {poll, results} = e.detail as {poll: Poll, results: PollResults};

  for(let connected of connectedPolls) {
    if(connected.id == poll.id) {
      let pollElement = connected.element;
      pollElement.performResults(results, poll.chosenIndex);
    }
  }
});

export default class PollElement extends HTMLElement {
  private svgLines: SVGSVGElement[];
  private numberDivs: HTMLDivElement[];
  private selectedSpan: HTMLSpanElement;
  private answerDivs: HTMLDivElement[];
  private votersCountDiv: HTMLDivElement;

  private maxOffset = -46.5;
  private maxLength: number;
  private maxLengths: number[];

  private isQuiz = false;
  private isRetracted = false;
  private chosenIndex = -1; 
  private percents: number[];

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

    let pollID = this.getAttribute('poll-id');
    let {poll, results} = appPollsManager.getPoll(pollID);

    connectedPolls.push({id: pollID, element: this});

    console.log('pollElement poll:', poll, results);

    let desc = '';
    if(poll.pFlags) {
      if(poll.pFlags.closed) {
        desc = 'Final results';
      } else {
        if(poll.pFlags.quiz) {
          this.isQuiz = true;
        }

        let type = this.isQuiz ? 'Quiz' : 'Poll';
        desc = (poll.pFlags.public_voters ? 'Public' : 'Anonymous') + ' ' + type;
      }
    }

    let votes = poll.answers.map((answer, idx) => {
      return `
        <div class="poll-answer" data-index="${idx}">
          <div class="circle-hover">
            <div class="animation-ring"></div>
            <svg class="progress-ring">
              <circle class="progress-ring__circle" cx="13" cy="13" r="9"></circle>
            </svg>
          </div>
          <div class="poll-answer-percents"></div>
          <div class="poll-answer-text">${RichTextProcessor.wrapEmojiText(answer.text)}</div>
          <svg version="1.1" class="poll-line" style="display: none;" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 480 35" xml:space="preserve">
            <use href="#poll-line"></use>
          </svg>
        </div>
      `;
    }).join('');

    this.innerHTML = `
      <div class="poll-title">${poll.rQuestion}</div>
      <div class="poll-desc">${desc}</div>
      ${votes}
      <div class="poll-votes-count"></div>
    `;

    this.answerDivs = Array.from(this.querySelectorAll('.poll-answer')) as HTMLDivElement[];
    this.votersCountDiv = this.querySelector('.poll-votes-count') as HTMLDivElement;
    this.svgLines = Array.from(this.querySelectorAll('.poll-line')) as SVGSVGElement[];
    this.numberDivs = Array.from(this.querySelectorAll('.poll-answer-percents')) as HTMLDivElement[];

    let width = this.getBoundingClientRect().width;
    this.maxLength = width + tailLength + this.maxOffset + -13.7; // 13 - position left

    if(poll.chosenIndex !== -1) {
      this.performResults(results, poll.chosenIndex);
    } else {
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
    return [/* массив имён атрибутов для отслеживания их изменений */];
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    // вызывается при изменении одного из перечисленных выше атрибутов
  }

  adoptedCallback() {
    // вызывается, когда элемент перемещается в новый документ
    // (происходит в document.adoptNode, используется очень редко)
  }

  clickHandler(e: MouseEvent) {
    let target = findUpClassName(e.target, 'poll-answer') as HTMLElement;
    if(!target) {
      return;
    }

    let answerIndex = +target.dataset.index;
    this.sendVote(answerIndex);
    
    /* target.classList.add('is-voting');
    setTimeout(() => { // simulate
      this.setResults([100, 0], answerIndex);
      target.classList.remove('is-voting');
    }, 1000); */
  }

  sendVote(index: number) {
    let target = this.answerDivs[index];
    target.classList.add('is-voting');
    let mid = +this.getAttribute('message-id');
    
    this.classList.add('disable-hover');
    appPollsManager.sendVote(mid, [index]).then(() => {
      target.classList.remove('is-voting');
      this.classList.remove('disable-hover');
    });
  }

  performResults(results: PollResults, chosenIndex: number) {
    if(this.chosenIndex != chosenIndex) { // if we voted
      this.isRetracted = this.chosenIndex != -1 && chosenIndex == -1;
      this.chosenIndex = chosenIndex;
  
      if(this.isRetracted) {
        this.addEventListener('click', this.clickHandler);
      } else {
        this.removeEventListener('click', this.clickHandler);
      }
    }
    
    // is need update
    if(this.chosenIndex != -1 || this.isRetracted) {
      const percents = results.results.map(v => v.voters / results.total_voters * 100);
      this.setResults(this.isRetracted ? this.percents : percents, chosenIndex);
      this.percents = percents;
      this.isRetracted = false;
    }
    
    this.setVotersCount(results);
  }

  setResults(percents: number[], chosenIndex: number) {
    this.svgLines.forEach(svg => svg.style.display = '');

    if(chosenIndex !== -1) {
      let answerDiv = this.answerDivs[chosenIndex];
      if(!this.selectedSpan) {
        this.selectedSpan = document.createElement('span');
        this.selectedSpan.classList.add('poll-answer-selected', 'tgico-check');
      }
      answerDiv.append(this.selectedSpan);
    }

    let maxValue = Math.max(...percents);
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
            let value = Math.round(percents / times * i);
            this.numberDivs[idx].innerText = value + '%';
          });
        }, oneTime * k);
      }
    } else {
      for(let i = 0; i < times; ++i) {
        setTimeout(() => {
          percents.forEach((percents, idx) => {
            let value = Math.round(percents / times * (i + 1));
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
    let votersCount = results.total_voters || 0;
    let votersOrAnswers = this.isQuiz ? (votersCount > 1 || !votersCount ? 'answers' : 'answer') : (votersCount > 1 || !votersCount ? 'votes' : 'vote');

    this.votersCountDiv.innerText = `${results.total_voters ? results.total_voters + ' ' + votersOrAnswers : 'No ' + votersOrAnswers}`;
  }

  setLineProgress(index: number, percents: number) {
    let svg = this.svgLines[index];

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