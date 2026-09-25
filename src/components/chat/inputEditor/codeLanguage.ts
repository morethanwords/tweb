export const CODE_LANGUAGE_DETECTION_META = 'chat-input-code-language-detection';

type CodeBlockLanguageAttributes = Record<string, unknown> & {
  detectedLanguage?: unknown,
  detectedLanguageCode?: unknown,
  language?: unknown
};

function stringAttribute(value: unknown) {
  return typeof(value) === 'string' ? value : '';
}

export function getDetectedCodeBlockLanguage(
  attributes: CodeBlockLanguageAttributes = {},
  code: string
) {
  if(stringAttribute(attributes.language)) return '';
  if(stringAttribute(attributes.detectedLanguageCode) !== code) return '';
  return stringAttribute(attributes.detectedLanguage);
}

export function getDisplayedAutoCodeBlockLanguage(
  attributes: CodeBlockLanguageAttributes = {}
) {
  if(stringAttribute(attributes.language)) return '';
  return stringAttribute(attributes.detectedLanguage);
}

export function getEffectiveCodeBlockLanguage(
  attributes: CodeBlockLanguageAttributes = {},
  code: string
) {
  return stringAttribute(attributes.language) ||
    getDetectedCodeBlockLanguage(attributes, code);
}

export function withDetectedCodeBlockLanguage<T extends CodeBlockLanguageAttributes>(
  attributes: T,
  language: string,
  code: string
) {
  return {
    ...attributes,
    detectedLanguage: language,
    detectedLanguageCode: code
  };
}

export function withoutDetectedCodeBlockLanguage<T extends CodeBlockLanguageAttributes>(
  attributes: T
) {
  return {
    ...attributes,
    detectedLanguage: '',
    detectedLanguageCode: ''
  };
}
