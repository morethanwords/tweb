import { formatDateAccordingToTodayNew } from "../../helpers/date";
import { MyMessage } from "../../lib/appManagers/appMessagesManager";

export default function wrapSentTime(message: MyMessage) {
  const el: HTMLElement = document.createElement('span');
  el.classList.add('sent-time');
  el.append(formatDateAccordingToTodayNew(new Date(message.date * 1000)));

  return el;
}
