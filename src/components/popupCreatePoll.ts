import appMessagesManager from "../lib/appManagers/appMessagesManager";
import appPeersManager from "../lib/appManagers/appPeersManager";
import appPollsManager, { Poll } from "../lib/appManagers/appPollsManager";
import { cancelEvent, findUpTag, getRichValue, isInputEmpty, whichChild } from "../helpers/dom";
import CheckboxField from "./checkbox";
import InputField from "./inputField";
import { PopupElement } from "./popup";
import RadioField from "./radioField";
import Scrollable from "./scrollable";
import { toast } from "./toast";

const MAX_LENGTH_QUESTION = 255;
const MAX_LENGTH_OPTION = 100;
const MAX_LENGTH_SOLUTION = 200;

export default class PopupCreatePoll extends PopupElement {
  private questionInput: HTMLInputElement;
  private questions: HTMLElement;
  private scrollable: Scrollable;
  private tempID = 0;

  private anonymousCheckboxField: ReturnType<typeof CheckboxField>;
  private multipleCheckboxField: PopupCreatePoll['anonymousCheckboxField'];
  private quizCheckboxField: PopupCreatePoll['anonymousCheckboxField'];

  private correctAnswers: Uint8Array[];
  private quizSolutionInput: HTMLInputElement;

  constructor(private peerID: number) {
    super('popup-create-poll popup-new-media', null, {closable: true, withConfirm: 'CREATE', body: true});

    this.title.innerText = 'New Poll';

    const questionField = InputField({
      placeholder: 'Ask a Question',
      label: 'Ask a Question', 
      name: 'question', 
      maxLength: MAX_LENGTH_QUESTION
    });
    this.questionInput = questionField.input;

    this.header.append(questionField.container);

    const hr = document.createElement('hr');
    const d = document.createElement('div');
    d.classList.add('caption');
    d.innerText = 'Options';

    this.questions = document.createElement('form');
    this.questions.classList.add('poll-create-questions');

    const dd = document.createElement('div');
    dd.classList.add('poll-create-settings');
    
    const settingsCaption = document.createElement('div');
    settingsCaption.classList.add('caption');
    settingsCaption.innerText = 'Settings';

    if(!appPeersManager.isBroadcast(peerID)) {
      this.anonymousCheckboxField = CheckboxField('Anonymous Voting', 'anonymous');
      this.anonymousCheckboxField.input.checked = true;
      dd.append(this.anonymousCheckboxField.label);
    }
    
    this.multipleCheckboxField = CheckboxField('Multiple Answers', 'multiple');
    this.quizCheckboxField = CheckboxField('Quiz Mode', 'quiz');

    this.multipleCheckboxField.input.addEventListener('change', () => {
      const checked = this.multipleCheckboxField.input.checked;
      this.quizCheckboxField.input.toggleAttribute('disabled', checked);
    });

    this.quizCheckboxField.input.addEventListener('change', () => {
      const checked = this.quizCheckboxField.input.checked;

      (Array.from(this.questions.children) as HTMLElement[]).map(el => {
        el.classList.toggle('radio-field', checked);
      });

      quizElements.forEach(el => el.classList.toggle('hide', !checked));

      this.multipleCheckboxField.input.toggleAttribute('disabled', checked);
    });

    dd.append(this.multipleCheckboxField.label, this.quizCheckboxField.label);

    const quizElements: HTMLElement[] = [];

    const quizSolutionCaption = document.createElement('div');
    quizSolutionCaption.classList.add('caption');
    quizSolutionCaption.innerText = 'Explanation';

    const quizHr = document.createElement('hr');

    const quizSolutionContainer = document.createElement('div');
    quizSolutionContainer.classList.add('poll-create-questions');

    const quizSolutionField = InputField({
      placeholder: 'Add a Comment (Optional)', 
      label: 'Add a Comment (Optional)',
      name: 'solution',
      maxLength: MAX_LENGTH_SOLUTION
    });
    this.quizSolutionInput = quizSolutionField.input;

    const quizSolutionSubtitle = document.createElement('div');
    quizSolutionSubtitle.classList.add('subtitle');
    quizSolutionSubtitle.innerText = 'Users will see this comment after choosing a wrong answer, good for educational purposes.';

    quizSolutionContainer.append(quizSolutionField.container, quizSolutionSubtitle);

    quizElements.push(quizHr, quizSolutionCaption, quizSolutionContainer);
    quizElements.forEach(el => el.classList.add('hide'));

    this.body.parentElement.insertBefore(hr, this.body);
    this.body.append(d, this.questions, document.createElement('hr'), settingsCaption, dd, ...quizElements);

    this.confirmBtn.addEventListener('click', this.onSubmitClick);

    this.scrollable = new Scrollable(this.body);
    this.appendMoreField();

    this.onEscape = () => {
      return !this.getFilledAnswers().length;
    };
  }

  private getFilledAnswers() {
    const answers = Array.from(this.questions.children).map((el, idx) => {
      const input = el.querySelector('.input-field-input') as HTMLElement;
      return getRichValue(input);
    }).filter(v => !!v.trim());

    return answers;
  }

  onSubmitClick = (e: MouseEvent) => {
    const question = getRichValue(this.questionInput);

    if(!question) {
      toast('Please enter a question.');
      return;
    }

    if(question.length > MAX_LENGTH_QUESTION) {
      toast('Question is too long.');
      return;
    }

    if(this.quizCheckboxField.input.checked && !this.correctAnswers?.length) {
      toast('Please choose the correct answer.');
      return;
    }

    const answers = this.getFilledAnswers();

    if(answers.length < 2) {
      toast('Please enter at least two options.');
      return;
    }

    const tooLongOption = answers.find(a => a.length > MAX_LENGTH_OPTION);
    if(tooLongOption) {
      toast('Option is too long.');
      return;
    }

    const quizSolution = getRichValue(this.quizSolutionInput) || undefined;
    if(quizSolution?.length > MAX_LENGTH_SOLUTION) {
      toast('Explanation is too long.');
      return;
    }

    this.closeBtn.click();
    this.confirmBtn.removeEventListener('click', this.onSubmitClick);

    //const randomID = [nextRandomInt(0xFFFFFFFF), nextRandomInt(0xFFFFFFFF)];
    //const randomIDS = bigint(randomID[0]).shiftLeft(32).add(bigint(randomID[1])).toString();

    const pFlags: Poll['pFlags'] = {};

    if(this.anonymousCheckboxField && !this.anonymousCheckboxField.input.checked) {
      pFlags.public_voters = true;
    }

    if(this.multipleCheckboxField.input.checked) {
      pFlags.multiple_choice = true;
    }

    if(this.quizCheckboxField.input.checked) {
      pFlags.quiz = true;
    }

    const poll: Poll = {
      _: 'poll',
      pFlags,
      question,
      answers: answers.map((value, idx) => {
        return {
          _: 'pollAnswer',
          text: value,
          option: new Uint8Array([idx])
        };
      }),
      id: undefined
    };
    //poll.id = randomIDS;

    const inputMediaPoll = appPollsManager.getInputMediaPoll(poll, this.correctAnswers, quizSolution);

    //console.log('Will try to create poll:', inputMediaPoll);

    appMessagesManager.sendOther(this.peerID, inputMediaPoll);
  };

  onInput = (e: Event) => {
    const target = e.target as HTMLInputElement;

    const radioLabel = findUpTag(target, 'LABEL');
    const isEmpty = isInputEmpty(target);
    if(!isEmpty) {
      target.parentElement.classList.add('is-filled');
      radioLabel.classList.remove('hidden-widget');
      radioLabel.firstElementChild.removeAttribute('disabled');
    }

    const isLast = !radioLabel.nextElementSibling;
    if(isLast && !isEmpty && this.questions.childElementCount < 10) {
      this.appendMoreField();
    }
  };

  onDeleteClick = (e: MouseEvent) => {
    const target = e.target as HTMLSpanElement;
    findUpTag(target, 'LABEL').remove();

    Array.from(this.questions.children).forEach((el, idx) => {
      const label = el.querySelector('label') as HTMLLabelElement;
      label.innerText = 'Option ' + (idx + 1);
    });
  };

  private appendMoreField() {
    const tempID = this.tempID++;
    const idx = this.questions.childElementCount + 1;
    const questionField = InputField({
      placeholder: 'Add an Option', 
      label: 'Option ' + idx, 
      name: 'question-' + tempID, 
      maxLength: MAX_LENGTH_OPTION
    });
    questionField.input.addEventListener('input', this.onInput);

    const radioField = RadioField('', 'question');
    radioField.main.append(questionField.container);
    radioField.main.addEventListener('click', cancelEvent);
    radioField.label.classList.add('hidden-widget');
    radioField.input.disabled = true;
    if(!this.quizCheckboxField.input.checked) {
      radioField.label.classList.remove('radio-field');
    }
    radioField.input.addEventListener('change', () => {
      const checked = radioField.input.checked;
      if(checked) {
        const idx = whichChild(radioField.label);
        this.correctAnswers = [new Uint8Array([idx])];
      }
    });

    const deleteBtn = document.createElement('span');
    deleteBtn.classList.add('btn-icon', 'tgico-close');
    questionField.container.append(deleteBtn);
  
    deleteBtn.addEventListener('click', this.onDeleteClick, {once: true});

    this.questions.append(radioField.label);

    this.scrollable.scrollIntoView(this.questions.lastElementChild as HTMLElement, true);
    //this.scrollable.scrollTo(this.scrollable.scrollHeight, 'top', true, true);
  }
}