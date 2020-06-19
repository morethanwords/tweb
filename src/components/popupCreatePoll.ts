import { PopupElement } from "./popup";
import Scrollable from "./scrollable_new";
import appMessagesManager from "../lib/appManagers/appMessagesManager";
import { $rootScope } from "../lib/utils";
import { Poll } from "../lib/appManagers/appPollsManager";
import { nextRandomInt, bigint } from "../lib/bin_utils";
import { toast } from "./misc";

const InputField = (placeholder: string, label: string, name: string) => {
  const div = document.createElement('div');
  div.classList.add('input-field');

  div.innerHTML = `
  <input type="text" name="${name}" id="input-${name}" placeholder="${placeholder}" autocomplete="off" required="">
  <label for="input-${name}">${label}</label>
  `;

  return div;
};

export default class PopupCreatePoll extends PopupElement {
  private questionInput: HTMLInputElement;
  private questions: HTMLElement;
  private scrollable: Scrollable;
  private tempID = 0;

  constructor() {
    super('popup-create-poll popup-new-media', null, {closable: true, withConfirm: 'CREATE', body: true});

    this.title.innerText = 'New Poll';

    const questionField = InputField('Ask a Question', 'Ask a Question', 'question');
    this.questionInput = questionField.firstElementChild as HTMLInputElement;

    this.header.append(questionField);

    const hr = document.createElement('hr');
    const d = document.createElement('div');
    d.classList.add('caption');
    d.innerText = 'Options';

    this.questions = document.createElement('div');
    this.questions.classList.add('poll-create-questions');

    this.body.parentElement.insertBefore(hr, this.body);
    this.body.append(d, this.questions);

    this.confirmBtn.addEventListener('click', this.onSubmitClick);

    this.scrollable = new Scrollable(this.body, 'y', undefined);
    this.appendMoreField();
  }

  onSubmitClick = (e: MouseEvent) => {
    const question = this.questionInput.value;

    if(!question.trim()) {
      toast('Please enter a question');
      return;
    }

    const answers = Array.from(this.questions.children).map((el, idx) => {
      const input = (el.firstElementChild as HTMLInputElement);
      return input.value;
    }).filter(v => !!v.trim());

    if(answers.length < 2) {
      toast('Please enter at least two options');
      return;
    }

    this.closeBtn.click();
    this.confirmBtn.removeEventListener('click', this.onSubmitClick);

    //const randomID = [nextRandomInt(0xFFFFFFFF), nextRandomInt(0xFFFFFFFF)];
    //const randomIDS = bigint(randomID[0]).shiftLeft(32).add(bigint(randomID[1])).toString();

    const poll: Partial<Poll> = {};
    poll._ = 'poll';
    //poll.id = randomIDS;
    poll.flags = 0;
    poll.question = question;

    poll.answers = answers.map((value, idx) => {
      return {
        _: 'pollAnswer',
        text: value,
        option: new Uint8Array([idx])
      };
    });

    appMessagesManager.sendOther($rootScope.selectedPeerID, {
      _: 'inputMediaPoll',
      flags: 0,
      poll
    });
  };

  onInput = (e: Event) => {
    const target = e.target as HTMLInputElement;

    if(target.value.length) {
      target.parentElement.classList.add('is-filled');
    }

    const isLast = !target.parentElement.nextElementSibling;
    if(isLast && target.value.length && this.questions.childElementCount < 10) {
      this.appendMoreField();
    }
  };

  onDeleteClick = (e: MouseEvent) => {
    const target = e.target as HTMLSpanElement;
    target.parentElement.remove();

    Array.from(this.questions.children).forEach((el, idx) => {
      const label = el.firstElementChild.nextElementSibling as HTMLLabelElement;
      label.innerText = 'Option ' + (idx + 1);
    });
  };

  private appendMoreField() {
    const idx = this.questions.childElementCount + 1;
    const questionField = InputField('Add an Option', 'Option ' + idx, 'question-' + this.tempID++);
    (questionField.firstElementChild as HTMLInputElement).addEventListener('input', this.onInput);

    const deleteBtn = document.createElement('span');
    deleteBtn.classList.add('btn-icon', 'tgico-close');
    questionField.append(deleteBtn);
  
    deleteBtn.addEventListener('click', this.onDeleteClick, {once: true});

    this.questions.append(questionField);

    this.scrollable.scrollTo(this.scrollable.scrollHeight, true, true);
  }
}