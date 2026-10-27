import {formatPhoneNumber} from '@helpers/formatPhoneNumber';

export default function formatUserPhone(phone: string) {
  return '+' + formatPhoneNumber(phone).formatted;
}

// * A phone someone shared (a contact, a vCard) may lack its country code: it is then grouped as
// * a number of the viewer's own country rather than read as a foreign one (#30681), and printed
// * without a '+'
export function formatSharedPhone(phone: string, defaultCountryCode?: string) {
  const {formatted, code} = formatPhoneNumber(phone, {defaultCountryCode});
  return (code ? '+' : '') + formatted;
}

// * How a shared contact's numbers read. A Telegram user's number is international: their own
// * when it is visible (Android shows "+" + user.phone), and the message's, which the server found
// * the account by — as tdesktop reads it. Any other number can be a national one (#30681) and is
// * read as one of the viewer's country; so is one with a trunk 0, which tdesktop leaves as it is
export function makeContactPhoneFormatter(accountPhones: string[], defaultCountryCode?: string) {
  const getDigits = (value: string) => value.replace(/\D/g, '');
  const accountDigits = accountPhones.filter(Boolean).map(getDigits);
  return (value: string) => accountDigits.includes(getDigits(value)) && !value.trimStart().startsWith('0') ?
    formatUserPhone(value) :
    formatSharedPhone(value, defaultCountryCode);
}
