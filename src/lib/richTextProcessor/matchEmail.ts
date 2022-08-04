import {EMAIL_REG_EXP} from '.';

export default function matchEmail(text: string) {
  return !text ? null : text.match(EMAIL_REG_EXP);
}
