import appPollsManager, { PollResults } from "../lib/appManagers/appPollsManager";
import { RichTextProcessor } from "../lib/richtextprocessor";

let lineTotalLength = 0;
const tailLength = 9;
const times = 10;
const fullTime = 340;
const oneTime = fullTime / times;

export default class PollElement extends HTMLElement {
  private svgLines: SVGSVGElement[];
  private numberDivs: HTMLDivElement[];
  private maxOffset = -44.8;
  private maxLength: number;
  private maxLengths: number[];

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

    console.log('pollElement poll:', poll, results);

    let desc = '';
    if(poll.pFlags) {
      if(poll.pFlags.closed) {
        desc = 'Final results';
      } else {
        desc = poll.pFlags.public_voters ? 'Public Poll' : 'Anonymous Poll';
      }
    }

    let votes = poll.answers.map(answer => {
      return `
        <div class="poll-answer">
          <div class="circle-hover">
            <div class="animation-ring"></div>
            <svg class="progress-ring">
              <circle class="progress-ring__circle" cx="13" cy="13" r="9"></circle>
            </svg>
          </div>
          <div class="poll-answer-percents"></div>
          <svg version="1.1" class="poll-line" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 480 28" xml:space="preserve">
            <use href="#poll-line"></use>
          </svg>
          <div class="poll-answer-text">${RichTextProcessor.wrapEmojiText(answer.text)}</div>
        </div>
      `;
    }).join('');

    this.innerHTML = `
      <div class="poll-title">${poll.rQuestion}</div>
      <div class="poll-desc">${desc}</div>
      ${votes}
      <div class="poll-votes-count">${results.total_voters ? results.total_voters + ' voters' : 'No votes'}</div>
    `;

    let width = this.getBoundingClientRect().width;
    this.maxLength = width + tailLength + this.maxOffset + -9; // 13 - position left
    this.performResults(results);
  }

  disconnectedCallback() {
    // браузер вызывает этот метод при удалении элемента из документа
    // (может вызываться много раз, если элемент многократно добавляется/удаляется)
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

  performResults(results: PollResults) {
    const percents = results.results.map(v => v.voters / results.total_voters * 100);
    this.setResults(percents);
  }

  setResults(percents: number[]) {
    if(!this.svgLines) {
      this.svgLines = Array.from(this.querySelectorAll('.poll-line')) as SVGSVGElement[];
      this.numberDivs = Array.from(this.querySelectorAll('.poll-answer-percents')) as HTMLDivElement[];
    }

    let maxValue = Math.max(...percents);

    this.maxLengths = percents.map(p => p / maxValue * this.maxLength);

    /* this.svgLines.forEach((svg, idx) => {
      this.setLineProgress(idx, 1);
    }); */

    /* percents = percents.map(p => {
      return Math.round(p);
    }); */

    console.log('setResults before percents:', percents);

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
    } else {
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

    console.log('setResults after percents:', percents, sum);

    let start = Date.now();
    let r = () => {
      let diff = Date.now() - start;
      let progress = diff / fullTime;
      if(progress > 1) progress = 1;

      this.svgLines.forEach((svg, idx) => {
        this.setLineProgress(idx, progress);
      });
    
      if(progress < 1) {
        window.requestAnimationFrame(r);
      }
    };
    window.requestAnimationFrame(r);

    for(let i = 0; i < times; ++i) {
      setTimeout(() => {
        percents.forEach((percents, idx) => {
          let value = Math.round(percents / times * (i + 1));
          let div = this.numberDivs[idx];
          //div.style.opacity = ((i + 1) * 0.10).toFixed(1); // опасити в 10 шагов от 0.1 до 1
          div.innerText = value + '%';
        });
      }, oneTime * i);
    }

    this.classList.add('is-voted');
  }

  setLineProgress(index: number, percents: number) {
    let svg = this.svgLines[index];
    svg.style.strokeDasharray = (percents * this.maxLengths[index]) + ', 485.9';
    svg.style.strokeDashoffset = '' + percents * this.maxOffset;
  }

  // у элемента могут быть ещё другие методы и свойства
}

customElements.define("poll-element", PollElement);