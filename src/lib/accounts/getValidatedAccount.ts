import {ActiveAccountNumber} from './types';

export function getValidatedAccount(input: string | number) {
  input = parseInt((input || '1') + '');
  return (input <= 4 && input >= 1 ? input : 1) as ActiveAccountNumber;
}
