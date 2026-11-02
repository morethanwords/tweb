import {InputPrivacyRule, PrivacyRule} from '@layer';
import PrivacyType from '@appManagers/utils/privacy/privacyType';
import convertKeyToInputKey from '@helpers/string/convertKeyToInputKey';

// * each kind of rule a privacy screen may not edit, kept while it still means something next to the chosen type:
// * one that allows is covered by "Everybody", one that disallows by "Nobody" (tdesktop's `RulesToTL`)
const KEEP_NEXT_TO: {[rule in PrivacyRule['_']]?: (type: PrivacyType) => boolean} = {
  privacyValueAllowBots: (type) => type !== PrivacyType.Everybody,
  privacyValueDisallowBots: (type) => type !== PrivacyType.Nobody,
  privacyValueAllowCloseFriends: (type) => type !== PrivacyType.Everybody && type !== PrivacyType.Contacts,
  privacyValueDisallowContacts: (type) => type !== PrivacyType.Nobody && type !== PrivacyType.Contacts
};

/**
 * The account's rules a privacy screen sends back as they are when it saves: it saves what it shows, and the rest -
 * mini apps where it has no such exception, kinds no screen here shows - would be lost. `edited` are the kinds it shows
 */
export default function getPrivacyRulesToKeep(rules: PrivacyRule[], type: PrivacyType, edited: PrivacyRule['_'][] = []) {
  return rules
  .filter((rule) => !edited.includes(rule._) && KEEP_NEXT_TO[rule._]?.(type))
  .map((rule) => ({_: convertKeyToInputKey(rule._)}) as InputPrivacyRule);
}
