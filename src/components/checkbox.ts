const CheckboxField = (text: string, name: string, round = false) => {
  const label = document.createElement('label');
  label.classList.add(round ? 'checkbox-field-round' : 'checkbox-field');

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = 'input-' + name;

  const span = document.createElement('span');
  span.classList.add('checkbox-caption');
  if(text) {
    span.innerText = text;
  }

  label.append(input, span);

  return {label, input, span};
};

export default CheckboxField;