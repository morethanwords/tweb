import base64ToBytes from '@helpers/string/base64ToBytes';
import {InputPasskeyCredential, InputPasskeyResponse} from '@layer';

export default function getInputPasskey(credential: PublicKeyCredential): InputPasskeyResponse {
  const json: PublicKeyCredentialJSON = credential.toJSON();
  const clientData = atob(json.response.clientDataJSON);
  let ret: InputPasskeyResponse;
  if(json.response.attestationObject) {
    ret = {
      _: 'inputPasskeyResponseRegister',
      client_data: {_: 'dataJSON', data: clientData},
      attestation_data: base64ToBytes(json.response.attestationObject)
    };
  } else {
    ret = {
      _: 'inputPasskeyResponseLogin',
      client_data: {_: 'dataJSON', data: clientData},
      authenticator_data: base64ToBytes(json.response.authenticatorData),
      signature: base64ToBytes(json.response.signature),
      user_handle: atob(json.response.userHandle)
    };
  }

  return ret;
}

export function getInputPasskeyCredential(credential: PublicKeyCredential): InputPasskeyCredential.inputPasskeyCredentialPublicKey {
  const response = getInputPasskey(credential);
  const json = credential.toJSON();
  return {
    _: 'inputPasskeyCredentialPublicKey',
    id: json.id,
    raw_id: json.rawId,
    response
  };
}
