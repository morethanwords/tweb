import compareLong from './long/compareLong';

export default function compareValue(val1: string | number, val2: typeof val1) {
  if((val1 as number).toExponential) {
    const diff = (val1 as number) - (val2 as number);
    return diff < 0 ? -1 : (diff > 0 ? 1 : 0);
  }

  return compareLong(val1 as string, val2 as string);
}
