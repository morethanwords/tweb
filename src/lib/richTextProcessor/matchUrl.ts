import {URL_REG_EXP} from '.';

export default function matchUrl(text: string) {
  return !text ? null : text.match(URL_REG_EXP);
}
