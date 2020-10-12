const InputField = (placeholder: string, label: string, name: string, maxLength?: number, showLengthOn: number = maxLength ? maxLength / 3 : 0) => {
  const div = document.createElement('div');
  div.classList.add('input-field');

  div.innerHTML = `
  <input type="text" name="${name}" id="input-${name}" placeholder="${placeholder}" autocomplete="off" required="">
  <label for="input-${name}">${label}</label>
  `;

  if(maxLength) {
    const input = div.firstElementChild as HTMLInputElement;
    const labelEl = div.lastElementChild as HTMLLabelElement;
    let showingLength = false;
    input.addEventListener('input', (e) => {
      const wasError = input.classList.contains('error');
      const diff = maxLength - input.value.length;
      const isError = diff < 0;
      input.classList.toggle('error', isError);

      if(isError || diff <= showLengthOn) {
        labelEl.innerText = label + ` (${maxLength - input.value.length})`;
        if(!showingLength) showingLength = true;
      } else if((wasError && !isError) || showingLength) {
        labelEl.innerText = label;
        showingLength = false;
      }
    });
  }

  return div;
};

export default InputField;