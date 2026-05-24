import {IS_MOBILE_SAFARI} from '@environment/userAgent';

export function canFocus(isFirstInput: boolean) {
  return !IS_MOBILE_SAFARI || !isFirstInput;
}
