import {createEffect, createSignal, For, onMount, Show} from 'solid-js';
import PopupElement from '@components/popups/indexTsx';
import {createPopup} from '@components/popups/indexTsx';
import {I18nTsx} from '@helpers/solid/i18n';

import {Birthday} from '@layer';
import {getMonths, getDaysPerMonthForYear, numberOfDaysEachMonth} from '@helpers/date';
import InputField from '@components/inputField';
import cancelEvent from '@helpers/dom/cancelEvent';
import {createButtonMenuSelect} from '@components/buttonMenuSelect';
import {IconTsx} from '@components/iconTsx';

import styles from '@components/popups/birthday.module.scss';
import appSidebarLeft from '@components/sidebarLeft';
import AppPrivacyBirthdayTab from '@components/sidebarLeft/tabs/privacy/birthday';
import rootScope from '@lib/rootScope';
import {doubleRaf} from '@helpers/schedulers';
import {toastNew} from '@components/toast';
import {PeerTitleTsx} from '@components/peerTitleTsx';
import lottieLoader from '@lib/rlottie/lottieLoader';
import LottieAnimation from '@components/lottieAnimation';

const MIN_YEAR = 1900;

interface MonthOption {
  text: string;
  value: number;
}

export async function saveMyBirthday(date: Birthday | null) {
  try {
    await rootScope.managers.appProfileManager.setMyBirthday(date);
    return true;
  } catch(error) {
    console.error(error);
    toastNew({langPackKey: 'Error.AnError'});
    return false;
  }
}

export async function suggestUserBirthday(userId: UserId, date: Birthday) {
  try {
    await rootScope.managers.appProfileManager.suggestUserBirthday(userId, date);
    return true;
  } catch(error) {
    console.error(error);
    toastNew({langPackKey: 'Error.AnError'});
    return false;
  }
}

export default async function showBirthdayPopup(props: {
  initialDate?: Birthday
  suggestForPeer?: PeerId
  fromProfile?: boolean
  fromSuggestion?: boolean
  onSave: (date: Birthday | null) => MaybePromise<boolean>
}) {
  const privacy = props.suggestForPeer ? null : await rootScope.managers.appPrivacyManager.getPrivacy('inputPrivacyKeyBirthday');
  const isContactsOnly = !privacy || (
    privacy.length === 2 &&
    privacy[0]._ === 'privacyValueAllowContacts' &&
    privacy[1]._ === 'privacyValueDisallowAll'
  );

  createPopup(() => {
    const [show, setShow] = createSignal(false);
    const [day, setDay] = createSignal<number | undefined>(props.initialDate?.day);
    const [month, setMonth] = createSignal<MonthOption | undefined>();
    const [year, setYear] = createSignal<number | undefined>(props.initialDate?.year);

    const monthOptions = getMonths().map((m, idx) => ({text: m, value: idx + 1}));
    if(props.initialDate?.month) {
      setMonth(monthOptions[props.initialDate.month - 1]);
    }

    const daysPerMonth = (year$ = year()) => year$ ? getDaysPerMonthForYear(year$) : numberOfDaysEachMonth;

    const dayField = new InputField({
      label: 'BirthdayPopup.Day',
      plainText: true
    });
    dayField.container.classList.add(styles.day);

    const monthField = new InputField({
      label: 'BirthdayPopup.Month',
      plainText: true
    });
    monthField.container.classList.add(styles.month);

    const yearField = new InputField({
      label: 'BirthdayPopup.Year',
      plainText: true
    });
    yearField.container.classList.add(styles.year);

    if(props.initialDate?.day) {
      dayField.setValueSilently(String(props.initialDate.day));
    }
    if(props.initialDate?.year) {
      yearField.setValueSilently(String(props.initialDate.year));
    }

    const now = new Date();
    const nowYear = now.getFullYear();
    const nowMonth = now.getMonth() + 1;
    const nowDay = now.getDate();

    function updateDayInput() {
      const value = dayField.value;
      const cleanValue = value.replace(/[^0-9]/g, '');
      if(!cleanValue) {
        setDay(undefined);
        return;
      }

      const month$ = month();

      const valueNum = Number(cleanValue);
      const daysInMonth = month$ ? daysPerMonth()[month$.value - 1] : 31;
      if(yearField.value === String(nowYear) && month$.value === nowMonth && valueNum > nowDay) {
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

    dayField.input.addEventListener('input', updateDayInput);
    monthField.input.addEventListener('beforeinput', (e) => cancelEvent(e));
    monthField.input.addEventListener('paste', (e) => cancelEvent(e));

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
          return monthOptions.filter((m) => m.value <= nowMonth)
        }

        return monthOptions
      },
      single: true,
      optionKey: (v) => v.value.toString(),
      renderOption: (props) => (
        <>
          <div class="btn-menu-item-text">
            {props.option.text}
          </div>
          {props.chosen && <IconTsx icon="check" class="btn-menu-item-icon-right" />}
        </>
      )
    });
    monthField.input.addEventListener('focus', () => openMonthsMenu(monthField.container));
    monthField.input.addEventListener('click', () => openMonthsMenu(monthField.container));
    monthField.input.addEventListener('blur', (e) => {
      if((e.relatedTarget as HTMLElement)?.closest('.btn-menu')) return;
      closeMonthsMenu();
    });

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
          if(month() && month().value > nowMonth) {
            setMonth(monthOptions[nowMonth - 1])
          }
        } else {
          setYear(valueNum);
        }

        updateDayInput()
      } else {
        setYear(undefined);
      }
    })
    yearField.input.addEventListener('blur', () => {
      const value = yearField.value;
      if(value.length !== 4) yearField.value = '';
    });

    function openPrivacySettings() {
      appSidebarLeft.createTab(AppPrivacyBirthdayTab).open();
      setShow(false);
    }

    createEffect(() => {
      const month$ = month();
      if(month$) {
        monthField.value = month$.text;
      }
    });

    const doubleRafPromise = doubleRaf();

    return (
      <PopupElement class={styles.popup} containerClass={styles.popupContainer} show={show()}>
        <PopupElement.Header class={styles.popupHeader}>
          <PopupElement.CloseButton class={styles.popupCloseButton} />
        </PopupElement.Header>
        <PopupElement.Body class={styles.popupBody}>
          <LottieAnimation
            class={styles.img}
            size={120}
            lottieLoader={lottieLoader}
            restartOnClick
            name="UtyanBirthday"
            onPromise={(promise) => {
              Promise.all([promise, doubleRafPromise]).then(([p]) => {
                setShow(true);
                p.playOrRestart()
              });
            }}
          />

          <I18nTsx
            class={styles.title}
            key={props.suggestForPeer ? 'BirthdayPopup.TitleForPeer' : 'BirthdayPopup.Title'}
            args={[props.suggestForPeer ? <PeerTitleTsx peerId={props.suggestForPeer} /> : undefined]}
          />

          <div class={styles.datePicker}>
            {dayField.container}
            {monthField.container}
            {yearField.container}
          </div>

          <Show when={!props.suggestForPeer}>
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
          </Show>
        </PopupElement.Body>
        <PopupElement.Footer class={styles.popupFooter}>
          <Show when={props.fromSuggestion && props.initialDate.year}>
            <PopupElement.FooterButton
              langKey="BirthdayPopup.HideYear"
              secondary
              callback={() => {
                setYear(undefined);
                yearField.setValueSilently('');
                return false;
              }}
            />
          </Show>
          <Show when={props.fromProfile && props.initialDate}>
            <PopupElement.FooterButton
              langKey="BirthdayPopup.Remove"
              secondary
              callback={async() => {
                await props.onSave(null);
                return true;
              }}
            />
          </Show>
          <PopupElement.FooterButton
            disabled={!day() || !month()}
            langKey={
              props.fromSuggestion ? 'BirthdayPopup.SaveFromSuggestion' :
              props.suggestForPeer ? 'BirthdayPopup.Suggest' : 'Save'}
            callback={async() => {
              if(!day() || !month()) return;
              await props.onSave({_: 'birthday', day: day(), month: month().value, year: year()});
              return true;
            }}
          />
        </PopupElement.Footer>
      </PopupElement>
    );
  });
}
