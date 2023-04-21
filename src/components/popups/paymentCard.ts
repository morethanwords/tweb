/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from '.';
import cardFormattingPatterns from '../../helpers/cards/cardFormattingPatterns';
import {detectUnifiedCardBrand} from '../../helpers/cards/cardBrands';
import formatInputValueByPattern from '../../helpers/cards/formatInputValueByPattern';
import {validateAnyIncomplete, validateCardExpiry, validateCardNumber} from '../../helpers/cards/validateCard';
import placeCaretAtEnd from '../../helpers/dom/placeCaretAtEnd';
import {renderImageFromUrlPromise} from '../../helpers/dom/renderImageFromUrl';
import noop from '../../helpers/noop';
import {PaymentsPaymentForm, User} from '../../layer';
import {LangPackKey, _i18n} from '../../lib/langPack';
import CheckboxField from '../checkboxField';
import confirmationPopup from '../confirmationPopup';
import CountryInputField from '../countryInputField';
import InputField, {InputFieldOptions, InputState} from '../inputField';
import Row from '../row';
import {getPaymentBrandIconPath, PaymentButton, PaymentsCredentialsToken} from './payment';
import {createVerificationIframe} from './paymentVerification';
import {PasswordInputHelpers} from '../passwordInputField';
import SettingSection from '../settingSection';
import TelegramWebView from '../telegramWebView';
import {formatPhoneNumber} from '../../helpers/formatPhoneNumber';

export type PaymentCardDetails = {
  cardNumber: string;
  cardholderName: string;
  expiryFull: string;
  expiryMonth: string;
  expiryYear: string;
  cvc: string;
  country: string;
  zip: string;
  save?: boolean;
};

export type PaymentCardDetailsShort = {
  title: string,
  save?: boolean;
  icon?: string;
};

export type PaymentCardDetailsResult = PaymentCardDetails | PaymentCardDetailsShort;

export class InputFieldCorrected extends InputField {
  private lastKeyDown: string;
  private lastTransformed: ReturnType<typeof formatInputValueByPattern>;

  constructor(public options: InputFieldOptions & {
    formatMethod: typeof cardFormattingPatterns['cardNumber'],
    validateMethod?: typeof validateCardNumber,
    errorKeys?: {[code: string]: LangPackKey},
    optional?: boolean,
    onChange?: (transformed: InputFieldCorrected['lastTransformed']) => void,
    onKeyDown?: (e: KeyboardEvent) => void
  }) {
    super(options);

    // const handleIncomplete = (t?: any) => {
    //   if(
    //     (!lastTransformed.value && t) ||
    //     lastTransformed.meta.autocorrectComplete ||
    //     lastTransformed.meta.error ||
    //     optional
    //   ) {
    //     return;
    //   }


    // };

    this.input.addEventListener('keydown', this.onKeyDown);
    this.input.addEventListener('input', this.onInput);
    this.input.addEventListener('blur', this.onBlur);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.lastKeyDown = e.key;
    this.options.onKeyDown?.(e);
  };

  private onInput = () => {
    const value = this.value;
    const deleting = this.lastKeyDown === 'Backspace' && (((this.lastTransformed && this.lastTransformed.value.length) || 0) - value.length) === 1;
    const result = this.lastTransformed = formatInputValueByPattern({
      value: value,
      getPattern: this.options.formatMethod,
      deleting,
      input: this.input
    });

    const transformedValue = result.value;
    if(transformedValue !== value) {
      this.setValueSilently(transformedValue);

      if(result.selection) {
        (this.input as HTMLInputElement).selectionStart = result.selection.selectionStart;
        (this.input as HTMLInputElement).selectionEnd = result.selection.selectionEnd;
      }
    }

    this.validateNew(transformedValue, {ignoreIncomplete: true/* !result.meta.autocorrectComplete */});

    this.options.onChange?.(result);
  };

  private onBlur = () => {
    const value = this.lastTransformed?.value;
    if(value) {
      this.validateNew(value);
    }
  };

  public update() {
    this.onInput();
  }

  public validate = () => {
    return this.validateNew();
  };

  public validateNew(
    value = this.lastTransformed?.value ?? '',
    t: any = {},
    justReturn?: boolean
  ) {
    let result: ReturnType<InputFieldCorrected['options']['validateMethod']>;
    if(this.options.validateMethod) {
      result = this.options.validateMethod?.(value, t);
    } else {
      result = validateAnyIncomplete(this.lastTransformed, value, t);
    }

    if(result?.code) {
      const langPackKey: LangPackKey = this.options.errorKeys?.[result.code];
      !justReturn && this.setState(InputState.Error, langPackKey);
      return false;
    }

    !justReturn && this.setState(InputState.Neutral);
    return true;
  }
}

export function handleInputFieldsOnChange(inputFields: (CountryInputField | InputField | InputFieldCorrected)[], _onChange: (valid: boolean) => void) {
  const onChange = () => {
    const valid = inputFields.every((inputField) => {
      return 'validateNew' in inputField ? inputField.validateNew(undefined, undefined, true) : inputField.isValid();
    });

    _onChange(valid);
  };

  inputFields.forEach((inputField) => {
    if(inputField instanceof InputFieldCorrected) {
      const original = inputField.options.onChange;
      inputField.options.onChange = (...args: any[]) => {
        // @ts-ignore
        original?.(...args);
        onChange();
      };

      if('update' in inputField) {
        inputField.update();
      }
    } else {
      inputField.input.addEventListener('input', onChange);
    }
  });

  return {validate: onChange};
}

export function createCountryZipFields(country?: boolean, zip?: boolean) {
  let countryInputField: CountryInputField, postcodeInputField: InputFieldCorrected;
  if(country || zip) {
    if(country) countryInputField = new CountryInputField({
      noPhoneCodes: true,
      onCountryChange: () => {
        postcodeInputField?.update();
      },
      required: true,
      autocomplete: 'country'
    });
    if(zip) postcodeInputField = new InputFieldCorrected({
      label: 'PaymentShippingZipPlaceholder',
      plainText: true,
      inputMode: 'numeric',
      autocomplete: 'postal-code',
      formatMethod: (/* ...args */) => {
        const {country} = countryInputField.getSelected();
        const iso2 = country?.iso2;
        return cardFormattingPatterns.postalCodeFromCountry(iso2 && iso2.toUpperCase());
      }
    });
  }

  return {countryInputField, postcodeInputField};
}

export type PaymentsNativeProvider = 'stripe' | 'smartglocal';
export type PaymentsNativeParams = {
  need_country?: boolean,
  need_zip?: boolean,
  need_cardholder_name?: boolean,
  publishable_key?: string, // stripe
  public_token?: string, // smartglocal
  gpay_params: string,
};
const SUPPORTED_NATIVE_PROVIDERS: Set<PaymentsNativeProvider> = new Set(['stripe', 'smartglocal']);

export default class PopupPaymentCard extends PopupElement<{
  finish: (obj: {token: any, card: PaymentCardDetailsResult}) => void
}> {
  protected telegramWebView: TelegramWebView;

  constructor(
    private paymentForm: PaymentsPaymentForm,
    private user: User.user,
    private savedCard?: PaymentCardDetails
  ) {
    super('popup-payment popup-payment-card', {
      closable: true,
      overlayClosable: true,
      body: true,
      scrollable: SUPPORTED_NATIVE_PROVIDERS.has(paymentForm.native_provider as PaymentsNativeProvider),
      title: 'PaymentCardInfo'
    });

    if(SUPPORTED_NATIVE_PROVIDERS.has(paymentForm.native_provider as PaymentsNativeProvider)) {
      this.d();
    } else {
      const telegramWebView = this.telegramWebView = createVerificationIframe({
        url: paymentForm.url
      });

      telegramWebView.addEventListener('payment_form_submit', (data) => {
        const cardOut = {title: data.title, save: false} as any as PaymentCardDetails;
        this.dispatchEvent('finish', {
          token: data.credentials,
          card: cardOut
        });

        this.hide();

        if(paymentForm.pFlags.can_save_credentials) {
          confirmationPopup({
            titleLangKey: 'PaymentCardSavePaymentInformation',
            descriptionLangKey: 'PaymentCardSavePaymentInformationInfoLine1',
            button: {
              langKey: 'Save'
            }
          }).then(() => {
            cardOut.save = true;
          }, noop);
        }
      });

      // putPreloader(this.body, true);
      this.body.append(telegramWebView.iframe);
      this.show();
      telegramWebView.onMount();
    }
  }

  protected destroy() {
    this.telegramWebView?.destroy();
    return super.destroy();
  }

  private d() {
    const savedCard = this.savedCard;
    const cardSection = new SettingSection({name: 'PaymentInfo.Card.Title', noDelimiter: true, noShadow: true});

    const nativeParams: PaymentsNativeParams = JSON.parse(this.paymentForm.native_params.data);

    let lastBrand: string, brandIconTempId = 0, lastBrandImg: HTMLImageElement;
    const setBrandIcon = (brand: string) => {
      if(lastBrand === brand) {
        return;
      }

      const tempId = ++brandIconTempId;
      lastBrand = brand;

      const path = getPaymentBrandIconPath(brand);
      if(!path) {
        if(lastBrandImg) {
          lastBrandImg.remove();
          lastBrandImg = undefined;
        }

        return;
      }

      const img = new Image();
      img.classList.add('input-field-icon');
      renderImageFromUrlPromise(img, path, false).then(() => {
        if(brandIconTempId !== tempId) {
          return;
        }

        if(lastBrandImg) {
          lastBrandImg.replaceWith(img);
        } else {
          cardInputField.container.append(img);
        }

        lastBrandImg = img;
      });
    };
    const cardInputField = new InputFieldCorrected({
      label: 'PaymentCardNumber',
      plainText: true,
      inputMode: 'numeric',
      autocomplete: 'cc-number',
      formatMethod: cardFormattingPatterns.cardNumber,
      validateMethod: validateCardNumber,
      errorKeys: {
        invalid: 'PaymentCard.Error.Invalid',
        incomplete: 'PaymentCard.Error.Incomplete'
      },
      onChange: (transformed) => {
        setBrandIcon(detectUnifiedCardBrand(transformed.value));
        cvcInputField.update(); // format cvc
      }
    });

    let nameInputField: InputField;
    if(nativeParams.need_cardholder_name) nameInputField = new InputField({
      label: 'Checkout.NewCard.CardholderNamePlaceholder',
      maxLength: 255,
      required: true,
      autocomplete: 'cc-name'
    });

    const formatted = formatPhoneNumber(this.user.phone);
    const expireInputField = new InputFieldCorrected({
      label: 'SecureId.Identity.Placeholder.ExpiryDate',
      plainText: true,
      inputMode: 'numeric',
      autocomplete: 'cc-exp',
      formatMethod: cardFormattingPatterns.cardExpiry,
      validateMethod: formatted.country.iso2 === 'RU' ? (str, options) => {
        return validateCardExpiry(str, {
          ...(options || {}),
          date: new Date(2022, 0, 1)
        });
      } : validateCardExpiry
    });

    // handle autocomplete: 01/2345 -> 01/45
    expireInputField.input.addEventListener('input', () => {
      let value = expireInputField.value;
      if(value.length < 5) {
        return;
      }

      const splitted = value.split('/');
      if(splitted[1].length !== 4) {
        return;
      }

      value = [splitted[0], splitted[1].slice(2)].join('/');
      expireInputField.setValueSilently(value);
    }, {capture: true});

    const cvcInputField = new InputFieldCorrected({
      labelText: 'CVC',
      plainText: true,
      inputMode: 'numeric',
      autocomplete: 'cc-csc',
      name: 'cvc',
      formatMethod: () => cardFormattingPatterns.cardCvc(cardInputField.value)
      // validateMethod: (...args) => _5AH3.a.cardCvc(cardInputField.value)(...args)
    });

    const passwordHelpers = new PasswordInputHelpers(cvcInputField.container, cvcInputField.input as HTMLInputElement);

    const switchFocusOrder: (InputFieldCorrected | InputField)[] = [
      cardInputField,
      expireInputField,
      cvcInputField,
      nameInputField
    ].filter(Boolean);
    switchFocusOrder.forEach((inputField) => {
      const onKeyDown = (e: KeyboardEvent) => {
        if(!inputField.value && e.key === 'Backspace') {
          const previousInputField = switchFocusOrder[switchFocusOrder.indexOf(inputField) - 1];
          if(previousInputField) {
            // previousInputField.value = previousInputField.value.slice(0, -1);
            placeCaretAtEnd(previousInputField.input, true);
          }
        }
      };

      if(inputField instanceof InputFieldCorrected) {
        inputField.options.onKeyDown = onKeyDown;

        const original = inputField.options.onChange;
        inputField.options.onChange = (transformed) => {
          original?.(transformed);

          if(document.activeElement === inputField.input && transformed.meta.autocorrectComplete) {
            for(let i = switchFocusOrder.indexOf(inputField), length = switchFocusOrder.length; i < length; ++i) {
              const nextInputField = switchFocusOrder[i];
              if(
                nextInputField instanceof InputFieldCorrected ?
                !nextInputField.validateNew(undefined, undefined, true) :
                !nextInputField.value
              ) {
                placeCaretAtEnd(nextInputField.input, true);
                break;
              }
            }
          }
        };
      } else {
        inputField.input.addEventListener('keydown', onKeyDown);
      }
    });

    const inputFieldsRow = document.createElement('div');
    inputFieldsRow.classList.add('input-fields-row');
    inputFieldsRow.append(expireInputField.container, cvcInputField.container);

    const form = document.createElement('form');
    form.append(...[
      cardInputField.container,
      inputFieldsRow,
      nameInputField?.container
    ].filter(Boolean))

    cardSection.content.append(form);

    let billingSection: SettingSection;
    // let saveCheckboxField: CheckboxField;
    const {countryInputField, postcodeInputField} = createCountryZipFields(nativeParams.need_country, nativeParams.need_zip);
    if(nativeParams.need_country || nativeParams.need_zip) {
      billingSection = new SettingSection({name: 'PaymentInfo.Billing.Title', noDelimiter: true, noShadow: true});

      // const inputFieldsRow2 = inputFieldsRow.cloneNode() as HTMLElement;
      // inputFieldsRow2.append(countryInputField.container, postcodeInputField.container);
      // billingSection.content.append(inputFieldsRow2);
      billingSection.content.append(...[countryInputField, postcodeInputField].filter(Boolean).map((i) => i.container));
    }

    const canSave = !!this.paymentForm.pFlags.can_save_credentials;
    const saveCheckboxField = new CheckboxField({
      text: 'PaymentCardSavePaymentInformation',
      checked: !!canSave
    });
    const saveRow = new Row({
      checkboxField: saveCheckboxField,
      subtitleLangKey: canSave ? 'PaymentCardSavePaymentInformationInfoLine1' : 'Checkout.2FA.Text'
    });

    if(!canSave) {
      saveRow.container.classList.add('is-disabled');
    }

    (billingSection || cardSection).content.append(saveRow.container);

    this.scrollable.append(...[cardSection, billingSection].filter(Boolean).map((s) => s.container));

    const payButton = PaymentButton({
      key: 'PaymentInfo.Done',
      onClick: async() => {
        const data: PaymentCardDetails = {
          cardNumber: cardInputField.value,
          expiryFull: expireInputField.value,
          expiryMonth: expireInputField.value.split('/')[0],
          expiryYear: expireInputField.value.split('/')[1],
          cvc: cvcInputField.value,

          cardholderName: nameInputField?.value,
          country: countryInputField?.value,
          zip: postcodeInputField?.value,

          save: saveCheckboxField?.checked
        };

        const nativeProvider: PaymentsNativeProvider = this.paymentForm.native_provider as any;
        let out: PaymentsCredentialsToken;
        if(nativeProvider === 'stripe') {
          const url = new URL('https://api.stripe.com/v1/tokens');
          url.search = new URLSearchParams({
            'card[number]': data.cardNumber,
            'card[exp_month]': data.expiryMonth,
            'card[exp_year]': data.expiryYear,
            'card[cvc]': data.cvc,
            'card[address_zip]': data.zip,
            'card[address_country]': data.country,
            'card[name]': data.cardholderName
          }).toString();

          const response = await fetch(url.toString(), {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': `Bearer ${nativeParams.publishable_key}`
            }
          });

          out = await response.json();
        } else if(nativeProvider === 'smartglocal') {
          const params = {
            card: {
              number: data.cardNumber.replace(/[^\d]+/g, ''),
              expiration_month: data.expiryMonth,
              expiration_year: data.expiryYear,
              security_code: data.cvc.replace(/[^\d]+/g, '')
            }
          };

          const url = /* DEBUG_PAYMENT_SMART_GLOCAL */false ?
            'https://tgb-playground.smart-glocal.com/cds/v1/tokenize/card' :
            'https://tgb.smart-glocal.com/cds/v1/tokenize/card';

          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'X-PUBLIC-TOKEN': nativeParams.public_token
            },
            body: JSON.stringify(params)
          });

          const json: { // smartglocal
            data: {
              info: {
                card_network: string,
                card_type: string,
                masked_card_number: string
              },
              token: string
            },
            status: 'ok'
          } = await response.json();

          out = {type: 'card', token: json.data.token}
        }

        this.dispatchEvent('finish', {token: out, card: data});
        this.hide();
      }
    });

    const inputFields = ([
      cardInputField,
      nameInputField,
      expireInputField,
      cvcInputField,
      countryInputField,
      postcodeInputField
    ] as const).filter(Boolean);
    handleInputFieldsOnChange(inputFields, (valid) => {
      payButton.disabled = !valid;
      // payButton.classList.toggle('btn-disabled', !valid);
    });

    if(savedCard) {
      cardInputField.value = savedCard.cardNumber;
      expireInputField.value = savedCard.expiryFull;
      cvcInputField.value = savedCard.cvc;
      nameInputField && (nameInputField.value = savedCard.cardholderName);
      countryInputField && (countryInputField.value = savedCard.country);
      postcodeInputField && (postcodeInputField.value = savedCard.zip);
    }

    this.body.append(this.btnConfirmOnEnter = payButton);

    this.show();

    if(!cardInputField.validateNew(undefined, undefined, true)) {
      placeCaretAtEnd(cardInputField.input);
    }
  }
}
