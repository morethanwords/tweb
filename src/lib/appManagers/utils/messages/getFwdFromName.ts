import {MessageFwdHeader} from '../../../../layer';

export default function getFwdFromName(fwdFrom: MessageFwdHeader) {
  return fwdFrom && (fwdFrom.saved_from_name || fwdFrom.from_name);
}
