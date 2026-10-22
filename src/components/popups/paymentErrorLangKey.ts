import type {LangPackKey} from '@lib/langPack';

// what the server refusing a payment tells the payer
const PAYMENT_ERRORS: {[type in ErrorType]?: LangPackKey} = {
  PAYMENT_FAILED: 'PaymentFailed',
  REQUESTED_INFO_INVALID: 'PaymentFailed',
  SHIPPING_OPTION_INVALID: 'PaymentFailed',
  PAYMENT_CREDENTIALS_INVALID: 'PaymentFailed',
  PAYMENT_CREDENTIALS_ID_INVALID: 'PaymentFailed',
  BOT_PRECHECKOUT_FAILED: 'PaymentPrecheckoutFailed'
};

/** The toast for a payment the server refused: a card one or a Stars one; any other refusal is a generic error. */
export default function paymentErrorLangKey(type: ErrorType): LangPackKey {
  return PAYMENT_ERRORS[type] || 'Error.AnError';
}
