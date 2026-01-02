const IS_WEB_AUTHN_SUPPORTED = navigator.credentials &&
  typeof(PublicKeyCredential) !== 'undefined' &&
  'parseCreationOptionsFromJSON' in PublicKeyCredential;

export default IS_WEB_AUTHN_SUPPORTED;
