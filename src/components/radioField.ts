const RadioField = (text: string, name: string) => {
  const label = document.createElement('label');
  label.classList.add('radio-field');

  const input = document.createElement('input');
  input.type = 'radio';
  input.id = input.name = 'input-radio-' + name;

  const main = document.createElement('div');
  main.classList.add('radio-field-main');
  main.innerText = text;

  label.append(input, main);

  return {label, input, main};
};

export default RadioField;