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
  // This is set by default on the server, there's an error thrown if we try to set it ourselves
  // {
  //   _: 'inputPrivacyValueDisallowAll'
  // },
  {
    _: 'inputPrivacyValueAllowContacts'
  }
];

export const TRANSITION_TIME = 120;
