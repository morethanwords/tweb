import {createEffect, createSignal, For, onMount, Show} from 'solid-js';
import PopupElement from '@components/popups/indexTsx';
import {createPopup} from '@components/popups/indexTsx';
import {I18nTsx} from '@helpers/solid/i18n';

import {Birthday} from '@layer';
import {getMonths, getDaysPerMonthForYear, numberOfDaysEachMonth} from '@helpers/date';
import InputField from '@components/inputField';
import I18n from '@lib/langPack';
import A11yButton from '@components/a11yButton';
import cancelEvent from '@helpers/dom/cancelEvent';
import {createButtonMenuSelect} from '@components/buttonMenuSelect';
import {IconTsx} from '@components/iconTsx';

import styles from '@components/popups/birthday.module.scss';
import rootScope from '@lib/rootScope';
import {doubleRaf} from '@helpers/schedulers';
import {toastNew} from '@components/toast';
import {PeerTitleTsx} from '@components/peerTitleTsx';
import MediaHeader from '@components/mediaHeader';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';

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
  const managers = bindManagersToSession(rootScope.managers);
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
    dayField.input.setAttribute('aria-label', I18n.format('BirthdayPopup.Day', true));

    const monthField = new InputField({
      label: 'BirthdayPopup.Month',
      plainText: true
    });
    monthField.container.classList.add(styles.month);
    monthField.input.setAttribute('aria-label', I18n.format('BirthdayPopup.Month', true));

    const yearField = new InputField({
      label: 'BirthdayPopup.Year',
      plainText: true
    });
    yearField.container.classList.add(styles.year);
    yearField.input.setAttribute('aria-label', I18n.format('BirthdayPopup.Year', true));

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

    // * the day as it was entered: a month or year too short for it clamps what the field shows, and the next one
    // * is checked against this, not the clamp (31, then April on the way to August, is August 31)
    let enteredDay = dayField.value;
    function updateDayInput() {
      const cleanValue = enteredDay.replace(/[^0-9]/g, '');
      if(!cleanValue) {
        setDay(undefined);
        return;
      }

      const month$ = month();

      const valueNum = Number(cleanValue);
      const daysInMonth = month$ ? daysPerMonth()[month$.value - 1] : 31;
      if(yearField.value === String(nowYear) && month$?.value === nowMonth && valueNum > nowDay) {
        dayField.setValueSilently(nowDay.toString());
        setDay(nowDay);
      } else if(valueNum > daysInMonth) {
        dayField.setValueSilently(daysInMonth.toString());
        setDay(daysInMonth);
      } else if(valueNum < 1) {
        dayField.setValueSilently('1');
        setDay(1);
      } else {
        if(dayField.value !== enteredDay) dayField.setValueSilently(enteredDay);
        setDay(valueNum);
      }
    }

    function availableMonths() {
      if(yearField.value === String(nowYear)) {
        return monthOptions.filter((m) => m.value <= nowMonth);
      }

      return monthOptions;
    }

    function selectMonth(option: MonthOption | undefined) {
      setMonth(option);
      updateDayInput();
    }

    let typedBuffer = '';
    let typedTimeout: number;
    const resetTypedBuffer = () => {
      clearTimeout(typedTimeout);
      typedBuffer = '';
    };

    function findTypedMonth(buffer: string) {
      const options = availableMonths();
      if(/^\d+$/.test(buffer)) {
        const n = Number(buffer);
        return options.find((option) => option.value === n);
      }

      const lower = buffer.toLocaleLowerCase();
      return options.find((option) => option.text.toLocaleLowerCase().startsWith(lower));
    }

    function onMonthTyped(data: string) {
      clearTimeout(typedTimeout);
      typedTimeout = window.setTimeout(resetTypedBuffer, 1000);

      typedBuffer += data;
      let option = findTypedMonth(typedBuffer);
      if(!option && typedBuffer.length > data.length) {
        typedBuffer = data;
        option = findTypedMonth(typedBuffer);
      }

      if(option) selectMonth(option);
    }

    dayField.input.addEventListener('input', () => {
      enteredDay = dayField.value;
      updateDayInput();
    });
    monthField.input.addEventListener('beforeinput', (e: InputEvent) => {
      cancelEvent(e);
      if(e.inputType === 'insertText' && e.data) {
        onMonthTyped(e.data);
      } else if(e.inputType === 'deleteContentBackward' || e.inputType === 'deleteContentForward') {
        resetTypedBuffer();
        selectMonth(undefined);
        monthField.value = '';
      }
    });
    monthField.input.addEventListener('keydown', (e: KeyboardEvent) => {
      if(e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const options = availableMonths();
      const current = month();
      const idx = current ? options.findIndex((option) => option.value === current.value) : -1;
      const next = e.key === 'ArrowDown' ? idx + 1 : (idx === -1 ? 0 : idx - 1);
      const option = options[Math.min(Math.max(next, 0), options.length - 1)];
      if(option) selectMonth(option);
    });
    monthField.input.addEventListener('paste', (e) => cancelEvent(e));

    const {open: openMonthsMenu, close: closeMonthsMenu} = createButtonMenuSelect<MonthOption>({
      class: styles.monthMenu,
      direction: 'bottom-center',
      get value() { return month() ? [month()] : [] },
      onValueChange: (value) => {
        selectMonth(value[0]);
        monthField.input.focus();
      },
      get options() {
        return availableMonths();
      },
      single: true,
      // * the field opens it as it gets the focus and takes the keys itself: typing, arrows
      activateFocus: false,
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
      hotReloadGuard.appSidebarLeft.createTab(hotReloadGuard.tabs.AppPrivacyBirthdayTab).open();
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
      <PopupElement managers={managers} class={styles.popup} show={show()} old>
        <PopupElement.Header floating>
          <PopupElement.CloseButton />
        </PopupElement.Header>
        <PopupElement.Body class={styles.popupBody}>
          <MediaHeader marginBottom>
            <MediaHeader.Sticker
              name="UtyanBirthday"
              size={120}
              onReady={(animation) => {
                doubleRafPromise.then(() => {
                  setShow(true);
                  animation.playOrRestart();
                });
              }}
            />
            <MediaHeader.Title>
              <I18nTsx
                key={props.suggestForPeer ? 'BirthdayPopup.TitleForPeer' : 'BirthdayPopup.Title'}
                args={[props.suggestForPeer ? <PeerTitleTsx peerId={props.suggestForPeer} /> : undefined]}
              />
            </MediaHeader.Title>
          </MediaHeader>

          <div class={styles.datePicker}>
            {dayField.container}
            {monthField.container}
            {yearField.container}
          </div>

          <Show when={!props.suggestForPeer}>
            <div class={styles.privacyInfo}>
              <I18nTsx
                    key={isContactsOnly ? 'BirthdayPopup.OnlyContacts' : 'BirthdayPopup.Choose'}
                args={[
                  <A11yButton
                    as="a"
                    class={styles.privacyInfoLink}
                    onClick={openPrivacySettings}
                  >
                    <I18nTsx key={isContactsOnly ? 'BirthdayPopup.OnlyContactsLink' : 'BirthdayPopup.ChooseLink'} />
                    <IconTsx icon="next" />
                  </A11yButton>
                ]} />
            </div>
          </Show>
        </PopupElement.Body>
        <PopupElement.Footer>
          <Show when={props.fromSuggestion && props.initialDate.year}>
            <PopupElement.FooterButton
              langKey="BirthdayPopup.HideYear"
              color="secondary"
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
              color="secondary"
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
