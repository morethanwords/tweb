import formatValueByPattern from './formatValueByPattern';

export default function formatInputValueByPattern(options: {
  value: string,
  getPattern: Parameters<typeof formatValueByPattern>[0],
  deleting?: boolean,
  input?: HTMLElement
}) {
  const {value: originalValue, getPattern, deleting, input} = options;
  const pushRest = !deleting && !!originalValue.length;
  const result = formatValueByPattern(getPattern, originalValue, {
    selectionStart: input ? (input as HTMLInputElement).selectionStart : 0,
    selectionEnd: input ? (input as HTMLInputElement).selectionEnd : 0
  }, pushRest)
  const {value, selection} = result;

  return {
    value,
    meta: {
      autocorrectComplete: result.autocorrectComplete,
      empty: !value
    },
    selection
  };
}
