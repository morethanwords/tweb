import {createEffect, createSignal, For, onMount} from 'solid-js';
import PopupElement from './indexTsx';
import {createPopup} from './indexTsx';
import {I18nTsx} from '../../helpers/solid/i18n';

import {Birthday} from '../../layer';
import {getMonths, numberOfDaysEachMonth} from '../../helpers/date';
import InputField from '../inputField';
import cancelEvent from '../../helpers/dom/cancelEvent';
import {createButtonMenuSelect} from '../buttonMenuSelect';
import {IconTsx} from '../iconTsx';

import styles from './birthday.module.scss';
import appSidebarLeft from '../sidebarLeft';
import AppPrivacyBirthdayTab from '../sidebarLeft/tabs/privacy/birthday';
import rootScope from '../../lib/rootScope';
import {doubleRaf, fastRaf} from '../../helpers/schedulers';

const MIN_YEAR = 1900;

interface MonthOption {
  text: string;
  value: number;
}

export default async function showBirthdayPopup(props: {
  initialDate?: Birthday
  onSave: (date: Birthday) => MaybePromise<boolean>
}) {
  const privacy = await rootScope.managers.appPrivacyManager.getPrivacy('inputPrivacyKeyBirthday');
  const isContactsOnly = !privacy || (
    privacy.length === 2 &&
    privacy[0]._ === 'privacyValueAllowContacts' &&
    privacy[1]._ === 'privacyValueDisallowAll'
  );

  const [show, setShow] = createSignal(false);
  const [day, setDay] = createSignal<number | undefined>(props.initialDate?.day);
  const [month, setMonth] = createSignal<MonthOption | undefined>();
  const [year, setYear] = createSignal<number | undefined>(props.initialDate?.year);

  const monthOptions = getMonths().map((m, idx) => ({text: m, value: idx + 1}));
  if(props.initialDate?.month) {
    setMonth(monthOptions[props.initialDate.month - 1]);
  }

  createPopup(() => {
    onMount(() => doubleRaf().then(() => setShow(true)));
    const dayField = new InputField({
      label: 'BirthdayPopup.Day',
      plainText: true
    })
    dayField.container.classList.add(styles.day);

    const monthField = new InputField({
      label: 'BirthdayPopup.Month',
      plainText: true
    })
    monthField.container.classList.add(styles.month);

    const yearField = new InputField({
      label: 'BirthdayPopup.Year',
      plainText: true
    })
    yearField.container.classList.add(styles.year);

    if(props.initialDate?.day) {
      dayField.setValueSilently(String(props.initialDate.day));
    }
    if(props.initialDate?.year) {
      yearField.setValueSilently(String(props.initialDate.year));
    }

    const now = new Date()
    const nowYear = now.getFullYear()
    const nowMonth = now.getMonth()
    const nowDay = now.getDate()

    function updateDayInput() {
      const value = dayField.value;
      const cleanValue = value.replace(/[^0-9]/g, '');
      if(!cleanValue) return;

      const month$ = month();

      const valueNum = Number(cleanValue);
      const daysInMonth = month$ ? numberOfDaysEachMonth[month$.value - 1] : 31;
      if(yearField.value === String(nowYear) && valueNum > nowDay) {
        dayField.setValueSilently(nowDay.toString());
        setDay(nowDay);
      } else if(valueNum > daysInMonth) {
        dayField.setValueSilently(daysInMonth.toString());
        setDay(daysInMonth);
      } else if(valueNum < 1) {
        dayField.setValueSilently('1');
        setDay(1);
      } else {
        setDay(valueNum);
      }
    }

    dayField.input.addEventListener('input', updateDayInput)
    monthField.input.addEventListener('beforeinput', e => cancelEvent(e));
    monthField.input.addEventListener('paste', e => cancelEvent(e));

    const {open: openMonthsMenu, close: closeMonthsMenu} = createButtonMenuSelect<MonthOption>({
      class: styles.monthMenu,
      direction: 'bottom-center',
      get value() { return month() ? [month()] : [] },
      onValueChange: (value) => {
        setMonth(value[0])
        monthField.input.focus()
        updateDayInput()
      },
      get options() {
        if(yearField.value === String(nowYear)) {
          return monthOptions.filter(m => m.value <= nowMonth + 1)
        }

        return monthOptions
      },
      single: true,
      optionKey: v => v.value.toString(),
      renderOption: props => (
        <>
          <div class="btn-menu-item-text">
            {props.option.text}
          </div>
          {props.chosen && <IconTsx icon="check" class="btn-menu-item-icon-right" />}
        </>
      )
    })
    monthField.input.addEventListener('focus', () => openMonthsMenu(monthField.container))
    monthField.input.addEventListener('click', () => openMonthsMenu(monthField.container))
    monthField.input.addEventListener('blur', (e) => {
      if((e.relatedTarget as HTMLElement)?.closest('.btn-menu')) return;
      closeMonthsMenu()
    })

    yearField.input.addEventListener('input', () => {
      const value = yearField.value;
      const valueNum = Number(value);

      if(isNaN(valueNum)) {
        const cleanValue = value.replace(/[^0-9]/g, '');
        yearField.setValueSilently(cleanValue);
        setYear(Number(cleanValue));
      } else if(value.length >= 4) {
        if(valueNum < MIN_YEAR) {
          yearField.setValueSilently(String(MIN_YEAR));
          setYear(MIN_YEAR);
        } else if(valueNum >= nowYear) {
          yearField.setValueSilently(nowYear.toString());
          setYear(nowYear);
          if(month() && month().value > nowMonth + 1) {
            setMonth(monthOptions[nowMonth])

            if(Number(dayField.value) > nowDay) {
              dayField.setValueSilently(nowDay.toString());
              setDay(nowDay);
            }
          }
        } else {
          setYear(valueNum);
        }
      } else {
        setYear(undefined);
      }
    })
    yearField.input.addEventListener('blur', () => {
      const value = yearField.value;
      if(value.length !== 4) yearField.value = ''
    })

    function openPrivacySettings() {
      appSidebarLeft.createTab(AppPrivacyBirthdayTab).open();
      setShow(false);
    }

    createEffect(() => {
      const month$ = month();
      if(month$) {
        monthField.value = month$.text;
      }
    })

    return (
      <PopupElement class={styles.popup} containerClass={styles.popupContainer} show={show()}>
        <PopupElement.Header class={styles.popupHeader}>
          <PopupElement.CloseButton class={styles.popupCloseButton} />
        </PopupElement.Header>
        <PopupElement.Body class={styles.popupBody}>
          <img
            class={styles.img}
            src="/assets/img/utyan-birthday.png"
          />

          <I18nTsx class={styles.title} key="BirthdayPopup.Title" />

          <div class={styles.datePicker}>
            {dayField.container}
            {monthField.container}
            {yearField.container}
          </div>

          <div class={styles.privacyInfo}>
            <I18nTsx
              class={styles.privacyInfoText}
              key={isContactsOnly ? 'BirthdayPopup.OnlyContacts' : 'BirthdayPopup.Choose'}
              args={[
                <a class={styles.privacyInfoLink} onClick={openPrivacySettings}>
                  <I18nTsx key={isContactsOnly ? 'BirthdayPopup.OnlyContactsLink' : 'BirthdayPopup.ChooseLink'} />
                  <IconTsx icon="next" />
                </a>
              ]} />
          </div>
        </PopupElement.Body>
        <PopupElement.Footer class={styles.popupFooter}>
          <PopupElement.FooterButton
            disabled={!day() || !month()}
            langKey="Save"
            callback={async() => {
              if(!day() || !month() || !year()) return;
              await props.onSave({_: 'birthday', day: day(), month: month().value, year: year()});
              setShow(false);
              return true;
            } } />
        </PopupElement.Footer>
      </PopupElement>
    );
  });
}
