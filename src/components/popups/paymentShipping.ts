/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from '.';
import placeCaretAtEnd from '../../helpers/dom/placeCaretAtEnd';
import {InputInvoice, PaymentRequestedInfo, PaymentsPaymentForm, PaymentsValidatedRequestedInfo} from '../../layer';
import matchEmail from '../../lib/richTextProcessor/matchEmail';
import CheckboxField from '../checkboxField';
import CountryInputField from '../countryInputField';
import InputField from '../inputField';
import Row from '../row';
import SettingSection from '../settingSection';
import TelInputField from '../telInputField';
import {PaymentButton} from './payment';
import {createCountryZipFields, handleInputFieldsOnChange, InputFieldCorrected} from './paymentCard';

export type PaymentShippingAddress = PaymentRequestedInfo;

type ShippingFocusField = 'name' | 'email' | 'phone';

export default class PopupPaymentShipping extends PopupElement<{
  finish: (o: {shippingAddress: PaymentShippingAddress, requestedInfo: PaymentsValidatedRequestedInfo}) => void
}> {
  constructor(
    private paymentForm: PaymentsPaymentForm.paymentsPaymentForm,
    private inputInvoice: InputInvoice,
    private focus?: ShippingFocusField
  ) {
    super('popup-payment popup-payment-shipping', {
      closable: true,
      overlayClosable: true,
      body: true,
      scrollable: true,
      title: 'PaymentShippingInfo'
    });

    this.d();
  }

  private d() {
    const paymentForm = this.paymentForm;
    const invoice = paymentForm.invoice;
    const savedInfo = this.paymentForm.saved_info;

    let addressSection: SettingSection,
      address1InputField: InputField,
      address2InputField: InputField,
      cityInputField: InputField,
      stateInputField: InputField,
      countryInputField: CountryInputField,
      postcodeInputField: InputFieldCorrected;
    if(invoice.pFlags.shipping_address_requested) {
      addressSection = new SettingSection({name: 'PaymentShippingAddress', noDelimiter: true, noShadow: true});
      address1InputField = new InputField({label: 'PaymentShippingAddress1Placeholder', maxLength: 64, required: true});
      address2InputField = new InputField({label: 'PaymentShippingAddress2Placeholder', maxLength: 64});
      cityInputField = new InputField({label: 'PaymentShippingCityPlaceholder', maxLength: 64, required: true});
      stateInputField = new InputField({label: 'PaymentShippingStatePlaceholder', maxLength: 64});
      const res = createCountryZipFields(true, true);
      countryInputField = res.countryInputField;
      postcodeInputField = res.postcodeInputField;

      addressSection.content.append(...[
        address1InputField,
        address2InputField,
        cityInputField,
        stateInputField,
        countryInputField,
        postcodeInputField
      ].filter(Boolean).map((inputField) => inputField.container));
    }

    let receiverSection: SettingSection;
    let nameInputField: InputField, emailInputField: InputField, telInputField: TelInputField;
    if([invoice.pFlags.name_requested, invoice.pFlags.email_requested, invoice.pFlags.phone_requested].includes(true)) {
      receiverSection = new SettingSection({name: 'PaymentShippingReceiver', noDelimiter: true, noShadow: true});

      const validateEmail = () => {
        const value = emailInputField.value;
        const match = matchEmail(value);
        if(!match || match[0].length !== value.length) {
          return false;
        }

        return true;
      };

      const validatePhone = () => {
        return !!telInputField.value.match(/\d/);
      };

      if(invoice.pFlags.name_requested) nameInputField = new InputField({label: 'PaymentShippingName', maxLength: 256, required: true});
      if(invoice.pFlags.email_requested) emailInputField = new InputField({label: 'PaymentShippingEmailPlaceholder', maxLength: 64, required: true, validate: validateEmail});
      if(invoice.pFlags.phone_requested) telInputField = new TelInputField({required: true, validate: validatePhone});

      receiverSection.content.append(...[
        nameInputField,
        emailInputField,
        telInputField
      ].filter(Boolean).map((inputField) => inputField.container));
    }

    const saveCheckboxField = new CheckboxField({
      text: 'PaymentShippingSave',
      checked: true
    });
    const saveRow = new Row({
      checkboxField: saveCheckboxField,
      subtitleLangKey: 'PaymentShippingSaveInfo'
    });

    (receiverSection || addressSection).content.append(saveRow.container);

    this.scrollable.append(...[addressSection, receiverSection].filter(Boolean).map((section) => section.container));

    const payButton = PaymentButton({
      key: 'PaymentInfo.Done',
      onClick: async() => {
        const selectedCountry = countryInputField && countryInputField.getSelected().country;
        const data: PaymentShippingAddress = {
          _: 'paymentRequestedInfo',
          shipping_address: selectedCountry && {
            _: 'postAddress',
            street_line1: address1InputField.value,
            street_line2: address2InputField.value,
            city: cityInputField.value,
            state: stateInputField.value,
            // country: countryInputField.value,
            country_iso2: selectedCountry?.iso2,
            post_code: postcodeInputField.value
          },
          name: nameInputField?.value,
          email: emailInputField?.value,
          phone: telInputField?.value
        };

        try {
          const requestedInfo = await this.managers.appPaymentsManager.validateRequestedInfo(this.inputInvoice, data, saveCheckboxField?.checked);

          this.dispatchEvent('finish', {
            shippingAddress: data,
            requestedInfo
          });

          this.hide();
        } catch(err: any) {
          const errorMap: {[err in ErrorType]?: InputField} = {
            ADDRESS_STREET_LINE1_INVALID: address1InputField,
            ADDRESS_STREET_LINE2_INVALID: address2InputField,
            ADDRESS_COUNTRY_INVALID: countryInputField,
            ADDRESS_CITY_INVALID: cityInputField,
            ADDRESS_STATE_INVALID: stateInputField,
            ADDRESS_POSTCODE_INVALID: postcodeInputField,

            REQ_INFO_NAME_INVALID: nameInputField,
            REQ_INFO_EMAIL_INVALID: emailInputField,
            REQ_INFO_PHONE_INVALID: telInputField
          };

          const inputField = errorMap[(err as ApiError).type];
          if(inputField) {
            inputField.setError();
            (err as ApiError).handled = true;
          }

          throw err;
        }
      }
    });
    this.body.append(this.btnConfirmOnEnter = payButton);

    if(savedInfo) {
      const shippingAddress = savedInfo.shipping_address;
      if(shippingAddress) {
        address1InputField.value = shippingAddress.street_line1;
        address2InputField.value = shippingAddress.street_line2;
        cityInputField.value = shippingAddress.city;
        stateInputField.value = shippingAddress.state;
        countryInputField.selectCountryByIso2(shippingAddress.country_iso2);
        postcodeInputField.value = shippingAddress.post_code;
      }

      savedInfo.name && nameInputField && (nameInputField.value = savedInfo.name);
      savedInfo.email && emailInputField && (emailInputField.value = savedInfo.email);
      savedInfo.phone && telInputField && (telInputField.value = savedInfo.phone);
    }

    const {validate} = handleInputFieldsOnChange([
      address1InputField,
      address2InputField,
      cityInputField,
      stateInputField,
      countryInputField,
      postcodeInputField,
      nameInputField,
      emailInputField,
      telInputField
    ].filter(Boolean), (valid) => {
      payButton.disabled = !valid;
    });

    validate();

    this.show();

    let focusField: InputField;
    if(this.focus) {
      const focusMap: {[field in ShippingFocusField]?: InputField} = {
        name: nameInputField,
        email: emailInputField,
        phone: telInputField
      };

      focusField = focusMap[this.focus];
    } else {
      focusField = address1InputField;
    }

    if(focusField) {
      placeCaretAtEnd(focusField.input);
    }
  }
}
