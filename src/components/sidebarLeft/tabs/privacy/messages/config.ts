import {InputPrivacyKey, InputPrivacyRule} from '../../../../../layer';

export enum MessagesPrivacyOption {
  Everybody = 1,
  ContactsAndPremium,
  Paid
};

export type MessagesTabStateStore = {
  option?: MessagesPrivacyOption;
  stars?: number;
  chosenPeers?: PeerId[];
};

export const privacyRulesInputKey = 'inputPrivacyKeyNoPaidMessages' satisfies InputPrivacyKey['_'];

export const defaultPrivacyRules: InputPrivacyRule[] = [
  // Why the API won't accept this??? It comes by default when setting messages privacy from other device
  // {
  //   _: 'inputPrivacyValueDisallowAll'
  // },
  {
    _: 'inputPrivacyValueAllowContacts'
  }
];

export const TRANSITION_TIME = 120;
