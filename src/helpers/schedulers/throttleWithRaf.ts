// * Jolly Cobra's schedulers

import {AnyToVoidFunction} from '../../types';
import {fastRaf} from '../schedulers';
import throttleWith from './throttleWith';

export default function throttleWithRaf<F extends AnyToVoidFunction>(fn: F) {
  return throttleWith(fastRaf, fn);
}
