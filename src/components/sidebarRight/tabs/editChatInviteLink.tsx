import {Component, createSignal, onMount, Show} from 'solid-js';
import {formatFullSentTime} from '@helpers/date';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import findUpAsChild from '@helpers/dom/findUpAsChild';
import placeCaretAtEnd from '@helpers/dom/placeCaretAtEnd';
import formatDuration from '@helpers/formatDuration';
import clamp from '@helpers/number/clamp';
import tsNow from '@helpers/tsNow';
import {i18n, LangPackKey} from '@lib/langPack';
import ButtonCorner from '@components/buttonCorner';
import CheckboxField from '@components/checkboxField';
import InputField from '@components/inputField';
import {InputFieldTsx} from '@components/inputFieldTsx';
import {InputStarsField} from '@components/popups/makePaid';
import {InputRightNumber} from '@components/popups/payment';
import showDatePickerPopup from '@components/popups/datePicker';
import {setButtonLoader} from '@components/putPreloader';
import RangeStepsSelector from '@components/rangeStepsSelector';
import Row from '@components/row';
import Section from '@components/section';
import {wrapFormattedDuration} from '@components/wrappers/wrapDuration';
import {ChatInvite} from './chatInviteLinkShared';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import type {AppEditChatInviteLinkTab} from '@components/solidJsTabs/tabs';

export function findClosestDifference(array: Array<number>, difference: number) {
  const differences = array.map((value, idx) => {
    return {idx, diff: Math.abs(value - difference)};
  });

  return differences.sort((a, b) => a.diff - b.diff)[0];
}

const EditChatInviteLink: Component = () => {
  const [tab] = useSuperTab<typeof AppEditChatInviteLinkTab>();
  const promiseCollector = usePromiseCollector();
  const {chatId, invite} = tab.payload;

  let nameInputField!: InputField;
  let timePeriodSelector: RangeStepsSelector<number | Date>;
  let usersLimitSelector: RangeStepsSelector<number>;
  let paidLinkCheckboxField: CheckboxField, paidLinkInputField: InputField;
  let approveNewMembersCheckboxField: CheckboxField;

  let timePeriodContent!: HTMLDivElement;
  let usersLimitContent!: HTMLDivElement;
  const [isBroadcast, setIsBroadcast] = createSignal(false);
  const [paidRow, setPaidRow] = createSignal<HTMLElement>();
  const [paidWrapper, setPaidWrapper] = createSignal<HTMLElement>();
  const [approveContent, setApproveContent] = createSignal<HTMLElement>();
  const [approveCaption, setApproveCaption] = createSignal<HTMLElement>();
  const [usersLimitHidden, setUsersLimitHidden] = createSignal(false);

  const build = async() => {
    const confirmBtn = ButtonCorner({className: 'is-visible', icon: 'check'});
    tab.content.append(confirmBtn);

    attachClickEvent(confirmBtn, async() => {
      setButtonLoader(confirmBtn);
      const expireDateValue = timePeriodSelector.value;
      const expireDate = expireDateValue instanceof Date ? expireDateValue.getTime() / 1000 | 0 : (expireDateValue ? tsNow(true) + expireDateValue : 0);
      const title = nameInputField.value;
      const requestNeeded = approveNewMembersCheckboxField?.checked;
      const usageLimit = requestNeeded ? 0 : (usersLimitSelector.value ?? 0);

      let chatInvite: ChatInvite;
      if(invite) {
        const result = await tab.managers.appChatInvitesManager.editExportedChatInvite({
          chatId,
          link: invite.link,
          expireDate,
          requestNeeded,
          title,
          usageLimit
        });

        chatInvite = result.invite as ChatInvite;
      } else {
        chatInvite = await tab.managers.appChatInvitesManager.exportChatInvite({
          chatId,
          title,
          requestNeeded,
          usageLimit,
          expireDate,
          stars: paidLinkCheckboxField?.checked ? +paidLinkInputField.value : undefined
        }) as ChatInvite;
      }

      tab.eventListener.dispatchEvent('finish', chatInvite);
      tab.close();
    }, {listenerSetter: tab.listenerSetter});

    if(invite?.title) {
      nameInputField.setOriginalValue(invite.title);
    }

    const isBroadcastChat = await tab.managers.appChatsManager.isBroadcast(chatId);
    const appConfig = await tab.managers.apiManager.getAppConfig();

    if(isBroadcastChat) {
      const row = new Row({
        titleLangKey: 'InviteLink.Subscription.Title',
        checkboxField: paidLinkCheckboxField = new CheckboxField({toggle: true})
      });

      tab.listenerSetter.add(paidLinkCheckboxField.input)('change', () => {
        const checked = paidLinkCheckboxField.checked;
        approveNewMembersCheckboxField.toggleDisability(checked);
        setApproveCaption(i18n(checked ? 'ApproveNewMembersDescription' : 'InviteLink.AdminApproval.Disabled'));
        wrapper.classList.toggle('hide', !checked);
      });

      const wrapper = document.createElement('div');
      wrapper.classList.add('input-wrapper');
      const inputField = paidLinkInputField = InputStarsField({
        label: 'InviteLink.Subscription.Placeholder',
        max: appConfig.stars_subscription_amount_max,
        middleware: tab.middlewareHelper.get(),
        onValue: (stars) => {
          rightLabel.replaceChildren(...(stars ? [
            i18n('InviteLink.Subscription.Price', ['$' + (appConfig.stars_usd_sell_rate_x1000 / 1000 * stars / 100).toFixed(2)])
          ] : []));
        }
      });

      const rightLabel = document.createElement('span');
      rightLabel.classList.add('input-field-right-label');
      inputField.container.append(rightLabel);

      wrapper.append(inputField.container);
      inputField.value = '' + 500;

      setPaidRow(row.container);
      setPaidWrapper(wrapper);

      const approveRow = new Row({
        titleLangKey: 'ApproveNewMembers',
        checkboxField: approveNewMembersCheckboxField = new CheckboxField({toggle: true})
      });
      setApproveContent(approveRow.container);

      setIsBroadcast(true);
    }

    {
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
        middleware: tab.middlewareHelper.get()
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

          showDatePickerPopup({
            initDate,
            withTime: true,
            onPick: setCustomTimestamp,
            btnConfirmLangKey: 'Save'
          });
        },
        listenerSetter: tab.listenerSetter
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

      timePeriodContent.append(range.container, row.container);
    }

    {
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
        middleware: tab.middlewareHelper.get()
      });

      const row = new Row({
        titleLangKey: 'EditInvitation.NumberOfUsers',
        titleRightSecondary: true,
        clickable: true,
        listenerSetter: tab.listenerSetter,
        noRipple: true
      });

      const inputRightNumber = new InputRightNumber();
      const {input} = inputRightNumber;

      tab.listenerSetter.add(row.container)('mousedown', (e) => {
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

      tab.listenerSetter.add(input)('input', onInput);

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
      }

      usersLimitContent.append(range.container, row.container);
    }

    if(approveNewMembersCheckboxField) {
      tab.listenerSetter.add(approveNewMembersCheckboxField.input)('change', () => {
        setUsersLimitHidden(approveNewMembersCheckboxField.checked);
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
      }
    }
  };

  onMount(() => {
    promiseCollector.collect(build());
  });

  return (
    <>
      <Section caption="LinkNameHelp">
        <div class="input-wrapper">
          <InputFieldTsx
            label="LinkNameHint"
            maxLength={32}
            instanceRef={(ref) => nameInputField = ref}
          />
        </div>
      </Section>
      <Show when={isBroadcast()}>
        <Section caption={invite ? 'InviteLink.Subscription.Edit' : 'InviteLink.Subscription.Caption'}>
          {paidRow()}
          {paidWrapper()}
        </Section>
        <Section caption={approveCaption()}>
          {approveContent()}
        </Section>
      </Show>
      <Section name="LimitByPeriod" caption="TimeLimitHelp">
        <div ref={timePeriodContent} />
      </Section>
      <Section name="LimitNumberOfUses" caption="UsesLimitHelp" classList={{hide: usersLimitHidden()}}>
        <div ref={usersLimitContent} />
      </Section>
    </>
  );
};

export default EditChatInviteLink;
