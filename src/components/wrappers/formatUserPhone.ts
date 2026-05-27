import {formatPhoneNumber} from '@helpers/formatPhoneNumber';

export default function formatUserPhone(phone: string) {
  return '+' + formatPhoneNumber(phone).formatted;
}
