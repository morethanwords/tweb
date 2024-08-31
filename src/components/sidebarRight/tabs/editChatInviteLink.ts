/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {formatFullSentTime} from '../../../helpers/date';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import findUpAsChild from '../../../helpers/dom/findUpAsChild';
import placeCaretAtEnd from '../../../helpers/dom/placeCaretAtEnd';
import formatDuration from '../../../helpers/formatDuration';
import {Middleware} from '../../../helpers/middleware';
import clamp from '../../../helpers/number/clamp';
import safeAssign from '../../../helpers/object/safeAssign';
import tsNow from '../../../helpers/tsNow';
import {ExportedChatInvite} from '../../../layer';
import {i18n} from '../../../lib/langPack';
import ButtonCorner from '../../buttonCorner';
import CheckboxField from '../../checkboxField';
import InputField from '../../inputField';
import {InputStarsField} from '../../popups/makePaid';
import {InputRightNumber} from '../../popups/payment';
import PopupSchedule from '../../popups/schedule';
import {setButtonLoader} from '../../putPreloader';
import RangeSelector from '../../rangeSelector';
import RangeStepsSelector from '../../rangeStepsSelector';
import Row from '../../row';
import SettingSection from '../../settingSection';
import SliderSuperTab, {SliderSuperTabEventable} from '../../sliderTab';
import {wrapFormattedDuration} from '../../wrappers/wrapDuration';

type ChatInvite = ExportedChatInvite.chatInviteExported;

export function findClosestDifference(array: Array<number>, difference: number) {
  const differences = array.map((value, idx) => {
    return {idx, diff: Math.abs(value - difference)};
  });

  return differences.sort((a, b) => a.diff - b.diff)[0];
}

export default class AppEditChatInviteLink extends SliderSuperTabEventable<{
  finish: (chatInvite: ChatInvite) => void
}> {
  private confirmBtn: HTMLButtonElement;

  public async init({chatId, invite}: {
    chatId: ChatId,
    invite?: ChatInvite
  }) {
    this.setTitle(invite ? 'InviteLinks.Edit' : 'NewLink');

    this.confirmBtn = ButtonCorner({className: 'is-visible', icon: 'check'});
    this.content.append(this.confirmBtn);

    attachClickEvent(this.confirmBtn, async() => {
      const removeLoader = setButtonLoader(this.confirmBtn);
      const expireDateValue = timePeriodSelector.value;
      const expireDate = expireDateValue instanceof Date ? expireDateValue.getTime() / 1000 | 0 : (expireDateValue ? tsNow(true) + expireDateValue : 0);
      const title = nameInputField.value;
      const requestNeeded = approveNewMembersCheckboxField.checked;
      const usageLimit = requestNeeded ? 0 : (usersLimitSelector.value ?? 0);

      let chatInvite: ChatInvite;
      if(invite) {
        const result = await this.managers.appChatInvitesManager.editExportedChatInvite({
          chatId,
          link: invite.link,
          expireDate,
          requestNeeded,
          title,
          usageLimit
        });

        chatInvite = result.invite as ChatInvite;
      } else {
        chatInvite = await this.managers.appChatInvitesManager.exportChatInvite({
          chatId,
          title,
          requestNeeded,
          usageLimit,
          expireDate,
          stars: paidLinkCheckboxField?.checked ? +paidLinkInputField.value : undefined
        }) as ChatInvite;
      }

      this.eventListener.dispatchEvent('finish', chatInvite);
      this.close();
      // removeLoader();
    }, {listenerSetter: this.listenerSetter});

    let nameInputField: InputField;
    {
      const section = new SettingSection({caption: 'LinkNameHelp'});

      const inputWrapper = document.createElement('div');
      inputWrapper.classList.add('input-wrapper');

      nameInputField = new InputField({
        label: 'LinkNameHint',
        maxLength: 32
      });

      if(invite?.title) {
        nameInputField.setOriginalValue(invite.title);
      }

      inputWrapper.append(nameInputField.container);
      section.content.append(inputWrapper);

      this.scrollable.append(section.container);
    }

    const isBroadcast = await this.managers.appChatsManager.isBroadcast(chatId);
    const appConfig = await this.managers.apiManager.getAppConfig();

    let paidLinkCheckboxField: CheckboxField, paidLinkInputField: InputField;
    if(isBroadcast) {
      const section = new SettingSection({caption: invite ? 'InviteLink.Subscription.Edit' : 'InviteLink.Subscription.Caption'});

      const row = new Row({
        titleLangKey: 'InviteLink.Subscription.Title',
        checkboxField: paidLinkCheckboxField = new CheckboxField({toggle: true})
      });

      this.listenerSetter.add(paidLinkCheckboxField.input)('change', () => {
        const checked = paidLinkCheckboxField.checked;
        approveNewMembersCheckboxField.toggleDisability(checked);
        approveNewMembersSection.caption.replaceChildren(i18n(checked ? 'ApproveNewMembersDescription' : 'InviteLink.AdminApproval.Disabled'));
        wrapper.classList.toggle('hide', !checked);
      });

      const wrapper = document.createElement('div');
      wrapper.classList.add('input-wrapper');
      const inputField = paidLinkInputField = InputStarsField({
        label: 'InviteLink.Subscription.Placeholder',
        max: appConfig.stars_subscription_amount_max,
        middleware: this.middlewareHelper.get(),
        onValue: (stars) => {
          rightLabel.replaceChildren(...(stars ? [
            i18n('InviteLink.Subscription.Price', ['$' + (appConfig.stars_usd_sell_rate_x1000 / 1000 * stars / 100).toFixed(2)])
          ] : []));
        }
      });

      const rightLabel = document.createElement('span');
      rightLabel.classList.add('input-field-right-label');
      inputField.container.append(rightLabel);

      this.listenerSetter.add(inputField.input)('input', () => {});

      wrapper.append(inputField.container);

      section.content.append(row.container, wrapper);

      inputField.value = '' + 500;

      this.scrollable.append(section.container);
    }

    let approveNewMembersCheckboxField: CheckboxField, approveNewMembersSection: SettingSection;
    if(isBroadcast) {
      const section = approveNewMembersSection = new SettingSection({caption: true});

      const row = new Row({
        titleLangKey: 'ApproveNewMembers',
        checkboxField: approveNewMembersCheckboxField = new CheckboxField({toggle: true})
      });

      section.content.append(row.container);

      this.scrollable.append(section.container);
    }

    let timePeriodSelector: RangeStepsSelector<number | Date>;
    {
      const section = new SettingSection({name: 'LimitByPeriod', caption: 'TimeLimitHelp'});

      const range: typeof timePeriodSelector = timePeriodSelector = new RangeStepsSelector({
        generateStep: (value) => {
          const formatted = formatDuration(value instanceof Date ? (value.getTime() / 1000 | 0) - tsNow(true) : value, 1);
          return [wrapFormattedDuration(formatted, false), value];
        },
        generateSteps: (values) => {
          return [
            ...values.map(range.generateStep),
            ['∞', undefined]
          ];
        },
        onValue: (value) => {
          if(!value) {
            setExpiry();
          } else {
            let date: Date;
            if(value instanceof Date) {
              date = value;
            } else {
              date = new Date();
              date.setSeconds(date.getSeconds() + value);
            }

            setExpiry(date.getTime() / 1000);
          }
        },
        middleware: this.middlewareHelper.get()
      });

      const row = new Row({
        titleLangKey: 'EditInvitation.ExpiryDate',
        titleRightSecondary: true,
        clickable: () => {
          let initDate: Date;
          const value = range.value;
          if(value) {
            initDate = new Date(value instanceof Date ? value : tsNow() + value * 1000);
          } else {
            initDate = new Date();
            initDate.setDate(initDate.getDate() + 7);
          }

          const popup = new PopupSchedule({
            initDate,
            onPick: setCustomTimestamp,
            btnConfirmLangKey: 'Save'
          });
          popup.show();
        },
        listenerSetter: this.listenerSetter
      });

      const setCustomTimestamp = (timestamp: number) => {
        const difference = timestamp - tsNow(true);
        const closest = findClosestDifference(stepValues, difference);
        const newSteps = steps.slice();
        newSteps[closest.idx] = range.generateStep(new Date(timestamp * 1000));
        range.setSteps(newSteps, closest.idx);
      };

      const setExpiry = (timestamp?: number) => {
        if(!timestamp) {
          row.titleRight.replaceChildren(i18n('EditInvitation.Never'));
        } else {
          row.titleRight.replaceChildren(formatFullSentTime(timestamp));
        }
      };

      const stepValues: number[] = [3600, 86400, 86400 * 7];
      const steps = range.generateSteps(stepValues);
      range.setSteps(steps, steps.length - 1);

      if(invite && invite.expire_date && invite.expire_date > tsNow(true)) {
        setCustomTimestamp(invite.expire_date);
      }

      section.content.append(range.container, row.container);
      this.scrollable.append(section.container);
    }

    let usersLimitSelector: RangeStepsSelector<number>, usersLimitSection: SettingSection;
    {
      const section = usersLimitSection = new SettingSection({name: 'LimitNumberOfUses', caption: 'UsesLimitHelp'});

      const range: typeof usersLimitSelector = usersLimitSelector = new RangeStepsSelector({
        generateStep: (value) => ['' + value, value],
        generateSteps: (values) => {
          return [
            ...values.map(range.generateStep),
            ['∞', undefined]
          ];
        },
        onValue: (value) => {
          setNumber(value);
        },
        middleware: this.middlewareHelper.get()
      });

      const row = new Row({
        titleLangKey: 'EditInvitation.NumberOfUsers',
        titleRightSecondary: true,
        clickable: true,
        listenerSetter: this.listenerSetter,
        // asLabel: true,
        noRipple: true
      });

      const inputRightNumber = new InputRightNumber();
      const {input} = inputRightNumber;

      this.listenerSetter.add(row.container)('mousedown', (e) => {
        if(!range.value) {
          setCustomNumber(stepValues[0]);
        }

        if(!findUpAsChild(e.target as HTMLElement, input)) {
          placeCaretAtEnd(input);
        }
      });

      const onInput = () => {
        let originalValue = inputRightNumber.value;
        const isEmpty = !originalValue.trim();
        originalValue = originalValue.replace(/\D/g, '');

        const value = clamp(isEmpty ? 0 : +originalValue, stepValues[0], 9999);
        if(!isEmpty) inputRightNumber.value = '' + value;
        ignoreNextSet = true;
        setCustomNumber(value);
      };

      this.listenerSetter.add(input)('input', onInput);

      const setCustomNumber = (value: number) => {
        const closest = findClosestDifference(stepValues, value);
        const newSteps = steps.slice();
        newSteps[closest.idx] = range.generateStep(value);
        range.setSteps(newSteps, closest.idx);
      };

      let ignoreNextSet = false;
      const setNumber = (value?: number) => {
        if(ignoreNextSet) {
          ignoreNextSet = false;
          return;
        }

        if(!value) {
          row.titleRight.replaceChildren(i18n('EditInvitation.Unlimited'));
        } else {
          inputRightNumber.value = '' + value;
          row.titleRight.replaceChildren(input);
        }
      };

      const stepValues = [1, 10, 50, 100];
      const steps = range.generateSteps(stepValues);
      range.setSteps(steps, steps.length - 1);

      if(invite?.usage_limit) {
        const value = Math.max(stepValues[0], invite.usage_limit - (invite.usage || 0));
        setNumber(value);
        setCustomNumber(value);
        // inputRightNumber.value = '' + value;
        // onInput();
      }

      section.content.append(range.container, row.container);
      this.scrollable.append(section.container);
    }

    if(approveNewMembersCheckboxField) {
      this.listenerSetter.add(approveNewMembersCheckboxField.input)('change', () => {
        usersLimitSection.container.classList.toggle('hide', approveNewMembersCheckboxField.checked);
      });

      if(invite) {
        approveNewMembersCheckboxField.checked = invite?.pFlags?.request_needed;
      }
    }

    if(paidLinkCheckboxField) {
      const value = !!invite?.subscription_pricing;
      paidLinkCheckboxField.setValueSilently(!value);
      paidLinkCheckboxField.checked = value;

      if(value) {
        paidLinkInputField.value = '' + invite.subscription_pricing?.amount;
      }

      if(invite) {
        paidLinkCheckboxField.toggleDisability(true);
        paidLinkInputField.container.classList.add('disable-hover');
        // paidLinkInputField.input.contentEditable = 'false';
      }
    }
  }
}
