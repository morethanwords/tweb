import eachTimeout from '@helpers/eachTimeout';

// It's better to use timeout instead of interval, because interval can be corrupted
export default function eachSecond(callback: () => any, runFirst?: boolean) {
  return eachTimeout(callback, () => 1000 - new Date().getMilliseconds(), runFirst);
}
