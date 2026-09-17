import PopupElement, {createPopup} from '@components/popups/indexTsx';
import placeCaretAtEnd from '@helpers/dom/placeCaretAtEnd';
import {InputInvoice, PaymentRequestedInfo, PaymentsPaymentForm, PaymentsValidatedRequestedInfo} from '@layer';
import matchEmail from '@lib/richTextProcessor/matchEmail';
import CountryInputField from '@components/countryInputField';
import InputField from '@components/inputField';
import Section from '@components/section';
import TelInputField from '@components/telInputField';
import {createCountryZipFields, handleInputFieldsOnChange, InputFieldCorrected} from '@components/popups/paymentCard';
import PaymentSaveInformationRow from '@components/popups/paymentSaveInformationRow';

export type PaymentShippingAddress = PaymentRequestedInfo;

type ShippingFocusField = 'name' | 'email' | 'phone';

import rootScope from '@lib/rootScope';
import {createSignal} from 'solid-js';
import createMiddleware from '@helpers/solid/createMiddleware';
export default function showPaymentShippingPopup(options: {
  paymentForm: PaymentsPaymentForm.paymentsPaymentForm,
  inputInvoice: InputInvoice,
  focus?: ShippingFocusField,
  onFinish?: (o: {shippingAddress: PaymentShippingAddress, requestedInfo: PaymentsValidatedRequestedInfo}) => void
}) {
  const {paymentForm, inputInvoice, focus} = options;
  const [disabled, setDisabled] = createSignal(true);

  const invoice = paymentForm.invoice;
  const savedInfo = paymentForm.saved_info;

  let addressFields: HTMLElement[],
    address1InputField: InputField,
    address2InputField: InputField,
    cityInputField: InputField,
    stateInputField: InputField,
    countryInputField: CountryInputField,
    postcodeInputField: InputFieldCorrected;
  if(invoice.pFlags.shipping_address_requested) {
    address1InputField = new InputField({label: 'PaymentShippingAddress1Placeholder', maxLength: 64, required: true});
    address2InputField = new InputField({label: 'PaymentShippingAddress2Placeholder', maxLength: 64});
    cityInputField = new InputField({label: 'PaymentShippingCityPlaceholder', maxLength: 64, required: true});
    stateInputField = new InputField({label: 'PaymentShippingStatePlaceholder', maxLength: 64});
    const res = createCountryZipFields(true, true);
    countryInputField = res.countryInputField;
    postcodeInputField = res.postcodeInputField;

    addressFields = [
      address1InputField,
      address2InputField,
      cityInputField,
      stateInputField,
      countryInputField,
      postcodeInputField
    ].filter(Boolean).map((inputField) => inputField.container);
  }

  let receiverFields: HTMLElement[];
  let nameInputField: InputField, emailInputField: InputField, telInputField: TelInputField;
  if([invoice.pFlags.name_requested, invoice.pFlags.email_requested, invoice.pFlags.phone_requested].includes(true)) {
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

    receiverFields = [
      nameInputField,
      emailInputField,
      telInputField
    ].filter(Boolean).map((inputField) => inputField.container);
  }

  let savePaymentInformation = true;
  const SaveRow = () => (
    <PaymentSaveInformationRow
      checked
      title="PaymentShippingSave"
      subtitle="PaymentShippingSaveInfo"
      onChange={(checked) => savePaymentInformation = checked}
    />
  );

  const onDone = async() => {
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
      const requestedInfo = await rootScope.managers.appPaymentsManager.validateRequestedInfo(inputInvoice, data, savePaymentInformation);

      options.onFinish?.({
        shippingAddress: data,
        requestedInfo
      });
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
  };


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
    setDisabled(!valid);
  });

  validate();


  let focusField: InputField;
  if(focus) {
    const focusMap: {[field in ShippingFocusField]?: InputField} = {
      name: nameInputField,
      email: emailInputField,
      phone: telInputField
    };

    focusField = focusMap[focus];
  } else {
    focusField = address1InputField;
  }

  createPopup(() => (
    <PopupElement
      class="popup-payment popup-payment-shipping"
      closable
      show
    >
      <PopupElement.Header>
        <PopupElement.CloseButton />
        <PopupElement.Title title="PaymentShippingInfo" />
      </PopupElement.Header>
      <PopupElement.Scrollable>
        <PopupElement.Body>
          {addressFields && (
            <Section name="PaymentShippingAddress">
              <div class="popup-payment-input-fields">
                {addressFields}
                {/* the save row belongs to the last section on screen */}
                {!receiverFields && <SaveRow />}
              </div>
            </Section>
          )}
          {receiverFields && (
            <Section name="PaymentShippingReceiver">
              <div class="popup-payment-input-fields">
                {receiverFields}
                <SaveRow />
              </div>
            </Section>
          )}
        </PopupElement.Body>
      </PopupElement.Scrollable>
      <PopupElement.Footer>
        <PopupElement.FooterButton
          confirm
          preloader
          pendingLangKey="PleaseWait"
          disabled={disabled()}
          langKey="PaymentInfo.Done"
          callback={onDone}
        />
      </PopupElement.Footer>
    </PopupElement>
  ));

  if(focusField) {
    placeCaretAtEnd(focusField.input);
  }
}
