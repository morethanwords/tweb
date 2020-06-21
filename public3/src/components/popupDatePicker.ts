import { PopupElement } from "./popup";

export default class PopupDatePicker extends PopupElement {
  private controlsDiv: HTMLElement;
  private monthTitle: HTMLElement;
  private prevBtn: HTMLElement;
  private nextBtn: HTMLElement;

  private monthsContainer: HTMLElement;
  private month: HTMLElement;

  private minMonth: Date;
  private maxMonth: Date;
  private minDate = new Date('2013-08-01T00:00:00');
  private maxDate: Date;
  private selectedDate: Date;
  private selectedMonth: Date;
  private selectedEl: HTMLElement;

  constructor(initDate: Date, public onPick: (timestamp: number) => void) {
    super('popup-date-picker', [{
      text: 'CANCEL',
      isCancel: true
    }, {
      text: 'JUMP TO DATE',
      callback: () => {
        if(this.onPick) {
          this.onPick(this.selectedDate.getTime() / 1000 | 0);
        }
      }
    }]);

    const popupBody = document.createElement('div');
    popupBody.classList.add('popup-body');

    // Controls
    this.controlsDiv = document.createElement('div');
    this.controlsDiv.classList.add('date-picker-controls');

    this.prevBtn = document.createElement('button');
    this.prevBtn.classList.add('btn-icon', 'tgico-down', 'date-picker-prev');
    this.prevBtn.addEventListener('click', this.onPrevClick);

    this.nextBtn = document.createElement('button');
    this.nextBtn.classList.add('btn-icon', 'tgico-down', 'date-picker-next');
    this.nextBtn.addEventListener('click', this.onNextClick);
    
    this.monthTitle = document.createElement('div');
    this.monthTitle.classList.add('date-picker-month-title');

    this.controlsDiv.append(this.prevBtn, this.monthTitle, this.nextBtn);

    // Month
    this.monthsContainer = document.createElement('div');
    this.monthsContainer.classList.add('date-picker-months');
    this.monthsContainer.addEventListener('click', this.onDateClick);

    popupBody.append(this.controlsDiv, this.monthsContainer);
    this.container.append(popupBody);

    //const passed = (initDate.getTime() - (initDate.getTimezoneOffset() * 60000)) % 86400000;
    //this.selectedDate = this.maxDate = new Date(initDate.getTime() - passed);
    initDate.setHours(0, 0, 0, 0);
    this.selectedDate = initDate;

    this.maxDate = new Date();
    this.maxDate.setHours(0, 0, 0, 0);

    this.selectedMonth = new Date(this.selectedDate);
    this.selectedMonth.setDate(1);

    this.maxMonth = new Date(this.maxDate);
    this.maxMonth.setDate(1);

    this.minMonth = new Date(this.minDate);
    this.minMonth.setDate(1);

    if(this.selectedMonth.getTime() == this.minMonth.getTime()) {
      this.prevBtn.setAttribute('disabled', 'true');
    }

    if(this.selectedMonth.getTime() == this.maxMonth.getTime()) {
      this.nextBtn.setAttribute('disabled', 'true');
    }

    this.setTitle();
    this.setMonth();
  }

  onPrevClick = (e: MouseEvent) => {
    this.selectedMonth.setMonth(this.selectedMonth.getMonth() - 1);
    this.setMonth();

    if(this.selectedMonth.getTime() == this.minMonth.getTime()) {
      this.prevBtn.setAttribute('disabled', 'true');
    }
    
    this.nextBtn.removeAttribute('disabled');
  };

  onNextClick = (e: MouseEvent) => {
    this.selectedMonth.setMonth(this.selectedMonth.getMonth() + 1);
    this.setMonth();

    if(this.selectedMonth.getTime() == this.maxMonth.getTime()) {
      this.nextBtn.setAttribute('disabled', 'true');
    }

    this.prevBtn.removeAttribute('disabled');
  };

  onDateClick = (e: MouseEvent) => {
    //cancelEvent(e);
    const target = e.target as HTMLElement;

    if(!target.dataset.timestamp) return;

    if(this.selectedEl) {
      if(this.selectedEl == target) return;
      this.selectedEl.classList.remove('active');
    }
    
    target.classList.add('active');
    const timestamp = +target.dataset.timestamp;

    this.selectedDate = new Date(timestamp);

    this.setTitle();
    this.setMonth();
  };

  public setTitle() {
    const splitted = this.selectedDate.toString().split(' ', 3);
    this.title.innerText = splitted[0] + ', ' + splitted[1] + ' ' + splitted[2];
  }

  public setMonth() {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    this.monthTitle.innerText = months[this.selectedMonth.getMonth()] + ' ' + this.selectedMonth.getFullYear();

    if(this.month) {
      this.month.remove();
    }

    this.month = document.createElement('div');
    this.month.classList.add('date-picker-month');

    const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    this.month.append(...days.map(s => {
      const el = document.createElement('span');
      el.innerText = s;
      return el;
    }));

    const firstDate = new Date(this.selectedMonth);

    // 0 - sunday
    let dayIndex = firstDate.getDay() - 1;
    if(dayIndex == -1) dayIndex = days.length - 1;

    // Padding first week
    for(let i = 0; i < dayIndex; ++i) {
      const el = document.createElement('span');
      this.month.append(el);
    }

    do {
      const date = firstDate.getDate();
      const el = document.createElement('button');
      el.classList.add('btn-icon');
      el.innerText = '' + date;
      el.dataset.timestamp = '' + firstDate.getTime();

      if(firstDate > this.maxDate) {
        el.setAttribute('disabled', 'true');
      }
      
      if(firstDate.getTime() == this.selectedDate.getTime()) {
        this.selectedEl = el;
        el.classList.add('active');
      }

      this.month.append(el);

      firstDate.setDate(date + 1);
    } while(firstDate.getDate() != 1);

    this.container.classList.toggle('is-max-lines', (this.month.childElementCount / 7) > 6);

    this.monthsContainer.append(this.month);
  }
}