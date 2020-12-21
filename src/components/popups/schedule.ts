import PopupDatePicker from "./datePicker";

const getMinDate = () => {
  const date = new Date();
  //date.setDate(date.getDate() - 1);
  date.setHours(0, 0, 0, 0);
  return date;
};

export default class PopupSchedule extends PopupDatePicker {
  constructor(initDate: Date, onPick: (timestamp: number) => void) {
    super(initDate, onPick, {
      noButtons: true,
      noTitle: true,
      closable: true,
      withConfirm: 'Send Today',
      minDate: getMinDate(),
      maxDate: (() => {
        const date = new Date();
        date.setFullYear(date.getFullYear() + 1);
        date.setDate(date.getDate() - 1);
        return date;
      })(),
      withTime: true,
      showOverflowMonths: true
    });

    this.element.classList.add('popup-schedule');
    this.header.append(this.controlsDiv);
    this.title.replaceWith(this.monthTitle);
    this.body.append(this.btnConfirm);
  }
}