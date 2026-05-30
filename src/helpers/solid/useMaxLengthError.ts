import {Accessor, createMemo} from 'solid-js';

export const useMaxLengthError = (value: Accessor<string>, maxLength: Accessor<number>) => {
  const threshold = () => Math.min(40, Math.round(maxLength() / 3));
  const lengthLeft = () => maxLength() - value().length;
  const shouldShowLengthLeft = createMemo(() => lengthLeft() < threshold());

  return {
    hasError: createMemo(() => value().length > maxLength()),
    shouldShowLengthLeft,
    lengthLeft
  };
};
