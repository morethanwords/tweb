export default class SearchInput {
  public container: HTMLElement;
  public input: HTMLInputElement;
  public clearBtn: HTMLElement;

  public prevValue = '';
  public timeout = 0;
  public onChange: (value: string) => void;

  constructor(placeholder: string, onChange?: (value: string) => void) {
    this.container = document.createElement('div');
    this.container.classList.add('input-search');

    this.onChange = onChange;

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = placeholder;
    this.input.autocomplete = Math.random().toString(36).substring(7);

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

    let value = this.input.value;

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
  }

  set value(value: string) {
    this.input.value = value;
    this.prevValue = value;
    clearTimeout(this.timeout);
  }

  public remove() {
    clearTimeout(this.timeout);
    this.input.removeEventListener('input', this.onInput);
    this.clearBtn.removeEventListener('click', this.onClearClick);
  }
}