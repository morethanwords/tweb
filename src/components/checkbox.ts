const CheckboxField = (text: string, name: string) => {
  const label = document.createElement('label');
  label.classList.add('checkbox-field');

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = 'input-' + name;

  const span = document.createElement('span');
  span.innerText = text;

  label.append(input, span);

  return {label, input, span};
};

export default CheckboxField;