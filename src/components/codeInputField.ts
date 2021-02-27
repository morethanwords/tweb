import InputField from "./inputField";

export default class CodeInputField extends InputField {
  constructor(options: {
    label?: string,
    name?: string,
    length: number,
    onFill: (code: number) => void
  }) {
    super({
      plainText: true,
      ...options
    });

    const input = this.input as HTMLInputElement;
    input.type = 'tel';
    input.setAttribute('required', '');
    input.autocomplete = 'off';

    let lastLength = 0;
    this.input.addEventListener('input', (e) => {
      this.input.classList.remove('error');
      this.label.innerText = options.label;
  
      const value = this.value.replace(/\D/g, '').slice(0, options.length);
      this.setValueSilently(value);
  
      const length = this.value.length;
      if(length === options.length) { // submit code
        options.onFill(+this.value);
      } else if(length === lastLength) {
        return;
      }
  
      lastLength = length;
    });
  }
}
