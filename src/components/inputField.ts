const InputField = (placeholder: string, label: string, name: string) => {
  const div = document.createElement('div');
  div.classList.add('input-field');

  div.innerHTML = `
  <input type="text" name="${name}" id="input-${name}" placeholder="${placeholder}" autocomplete="off" required="">
  <label for="input-${name}">${label}</label>
  `;

  return div;
};

export default InputField;