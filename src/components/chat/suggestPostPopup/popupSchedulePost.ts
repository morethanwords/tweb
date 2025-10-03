import {formatTime} from '../../../helpers/date';
import {i18n} from '../../../lib/langPack';
import PopupSchedule from '../../popups/schedule';
import styles from './styles.module.scss';


const MILLIS_IN_MINUTE = 60 * 1000;

type Args = {
  minTimeDate: Date;
} & ConstructorParameters<typeof PopupSchedule>[0];

export default class PopupSchedulePost extends PopupSchedule {
  protected caption: HTMLElement;
  protected minTimeDate: Date;

  constructor(args: Args) {
    const {minTimeDate, ...rest} = args;

    super(rest);

    this.minTimeDate = minTimeDate;

    this.caption = document.createElement('div');
    this.caption.classList.add(styles.Caption, styles.center);
    this.caption.append(i18n('SuggestedPosts.PublishingTime.MinSendTime', [formatTime(minTimeDate)]));

    this.timeDiv.after(this.caption);
  }

  public setTimeTitle() {
    super.setTimeTitle();

    if(!this.caption || !this.minTimeDate) return;

    const sendDate = new Date(this.selectedDate.getTime());
    sendDate.setHours(+this.hoursInputField.value, +this.minutesInputField.value);

    const disabled = sendDate < new Date() || (sendDate.valueOf() / MILLIS_IN_MINUTE | 0) < (this.minTimeDate.valueOf() / MILLIS_IN_MINUTE | 0);

    this.btnConfirm.toggleAttribute('disabled', disabled);

    const isCaptionVisible = sendDate.getDate() === this.minTimeDate.getDate();
    this.caption.classList.toggle('hide', !isCaptionVisible);
  }
}
