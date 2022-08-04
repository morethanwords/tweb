import {URL_ANY_PROTOCOL_REG_EXP} from '.';

export default function matchUrlProtocol(text: string) {
  return !text ? null : text.match(URL_ANY_PROTOCOL_REG_EXP);
}
