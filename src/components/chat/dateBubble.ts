import {SEND_WHEN_ONLINE_TIMESTAMP} from '@appManagers/constants';
import {formatDate} from '@helpers/date';
import {i18n} from '@lib/langPack';

export default function createDateBubble(
  timestamp: number,
  date: Date = new Date(timestamp * 1000),
  isScheduled = false
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let dateElement: HTMLElement;
  if(today.getTime() === date.getTime()) {
    dateElement = i18n(isScheduled ? 'Chat.Date.ScheduledForToday' : 'Date.Today');
  } else if(isScheduled && timestamp === SEND_WHEN_ONLINE_TIMESTAMP) {
    dateElement = i18n('MessageScheduledUntilOnline');
  } else {
    dateElement = formatDate(date, {today});

    if(isScheduled) {
      dateElement = i18n('Chat.Date.ScheduledFor', [dateElement]);
    }
  }

  const bubble = document.createElement('div');
  bubble.className = 'bubble service is-date';
  const bubbleContent = document.createElement('div');
  bubbleContent.classList.add('bubble-content');
  const serviceMsg = document.createElement('div');
  serviceMsg.classList.add('service-msg');

  serviceMsg.append(dateElement);
  bubbleContent.append(serviceMsg);
  bubble.append(bubbleContent);

  return bubble;
}
