// * Jolly Cobra's schedulers

import {AnyToVoidFunction} from '@types';
import {fastRaf} from '@helpers/schedulers';
import throttleWith from '@helpers/schedulers/throttleWith';

export default function throttleWithRaf<F extends AnyToVoidFunction>(fn: F) {
  return throttleWith(fastRaf, fn);
}
