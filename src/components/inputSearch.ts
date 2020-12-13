//import { getRichValue } from "../helpers/dom";
import InputField from "./inputField";

export default class InputSearch {
  public container: HTMLElement;
  public input: HTMLInputElement;
  public clearBtn: HTMLElement;

  public prevValue = '';
  public timeout = 0;
  public onChange: (value: string) => void;

  constructor(placeholder: string, onChange?: (value: string) => void) {
    const inputField = InputField({
      placeholder,
      plainText: true
    });

    this.container = inputField.container;
    this.container.classList.remove('input-field');
    this.container.classList.add('input-search');

    this.onChange = onChange;

    this.input = inputField.input;
    this.input.classList.add('input-search-input');

    const searchIcon = document.createElement('span');
    searchIcon.classList.add('tgico', 'tgico-search');

    this.clearBtn = document.createElement('span');
    this.clearBtn.classList.add('tgico', 'btn-icon', 'tgico-close');

    this.input.addEventListener('input', this.onInput);
    this.clearBtn.addEventListener('click', this.onClearClick);

    this.container.append(this.input, searchIcon, this.clearBtn);
  }
  
  onInput = () => {
    if(!this.onChange) return;

    let value = this.value;

    //this.input.classList.toggle('is-empty', !value.trim());

    if(value != this.prevValue) {
      this.prevValue = value;
      clearTimeout(this.timeout);
      this.timeout = window.setTimeout(() => {
        this.onChange(value);
      }, 200);
    }
  };

  onClearClick = () => {
    this.value = '';
    this.onChange && this.onChange('');
  };

  get value() {
    return this.input.value;
    //return getRichValue(this.input);
  }

  set value(value: string) {
    //this.input.innerHTML = value;
    this.input.value = value;
    this.prevValue = value;
    clearTimeout(this.timeout);
    
    const event = new Event('input', {bubbles: true, cancelable: true});
    this.input.dispatchEvent(event);
  }

  public remove() {
    clearTimeout(this.timeout);
    this.input.removeEventListener('input', this.onInput);
    this.clearBtn.removeEventListener('click', this.onClearClick);
  }
}