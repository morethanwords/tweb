import base64ToBytes from '@helpers/string/base64ToBytes';
import {InputPasskeyCredential, InputPasskeyResponse} from '@layer';

export default function getInputPasskey(credential: PublicKeyCredential): InputPasskeyResponse {
  const json = credential.toJSON();
  const {response} = json;
  const clientData = atob(response.clientDataJSON);
  let ret: InputPasskeyResponse;
  if('attestationObject' in response) {
    ret = {
      _: 'inputPasskeyResponseRegister',
      client_data: {_: 'dataJSON', data: clientData},
      attestation_data: base64ToBytes(response.attestationObject)
    };
  } else {
    ret = {
      _: 'inputPasskeyResponseLogin',
      client_data: {_: 'dataJSON', data: clientData},
      authenticator_data: base64ToBytes(response.authenticatorData),
      signature: base64ToBytes(response.signature),
      user_handle: atob(response.userHandle)
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
