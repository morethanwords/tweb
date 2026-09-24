import {User} from '@layer';
import removeAccents from '@helpers/string/removeAccents';
import getUserStatusForSort from '@appManagers/utils/users/getUserStatusForSort';

/** How the contacts are put in order: by how recently each was seen, or alphabetically */
export type ContactsSortMode = 'online' | 'name';

/** The section of the names that do not start with a letter - one, after all the lettered ones */
export const NON_LETTER_SECTION = '#';

const LETTER_REGEXP = /\p{L}/u;

/**
 * The name a user is sorted by, put together the way tdesktop's `UserData::setName` does it: a
 * blank first name leaves the last name alone, otherwise it is "first last" (`langFullName`).
 */
export function getUserSortName(user: User.user) {
  const firstName = user.first_name || '';
  const lastName = user.last_name || '';
  if(!firstName.trim()) {
    return lastName;
  }

  return lastName ? firstName + ' ' + lastName : firstName;
}

/**
 * tdesktop's `TextUtilities::NameSortKey`: the name with its accents folded away, in lower case.
 * Keys are compared unit by unit, as `QString::compare` does - never by locale.
 */
export function getNameSortKey(name: string) {
  return removeAccents(name).toLowerCase();
}

/**
 * The section a key is listed under, as tdesktop's `ContactsBoxController::applySectionHeaders`
 * has it: the key's first letter in upper case, or `#` for a key that does not start with one.
 * Like a `QChar` it looks at one UTF-16 unit, so half of a surrogate pair is no letter.
 */
export function getNameSortSection(key: string) {
  const first = key[0];
  if(!first || !LETTER_REGEXP.test(first)) {
    return NON_LETTER_SECTION;
  }

  // a single unit stays a single unit, as it does for `QChar::toUpper` (no 'ß' turning into 'SS')
  const upper = first.toUpperCase();
  return upper.length === 1 ? upper : first;
}

function compareKeys(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Puts contacts in the order a mode lists them in. By name it is tdesktop's order, and every
 * contact comes with the section it is listed under - except that the names that do not start
 * with a letter are all gathered in one `#` section at the end, the way Android puts its `#` last:
 * in tdesktop's order a name starting with a digit comes before the letters and one starting with
 * an emoji after all of them, and `#` would head two sections. By last seen the most recent come
 * first, and the ones seen equally recently keep their alphabetical order - the list tdesktop
 * sorts by presence is the alphabetical one, and its sort is stable.
 */
export default function sortContacts(
  peerIds: PeerId[],
  mode: ContactsSortMode,
  getUser: (userId: UserId) => User.user
): {peerIds: PeerId[], sections?: string[]} {
  const keys: Map<PeerId, string> = new Map();
  for(const peerId of peerIds) {
    const user = getUser(peerId.toUserId());
    keys.set(peerId, getNameSortKey(user ? getUserSortName(user) : ''));
  }

  const byName = peerIds.slice().sort((a, b) => compareKeys(keys.get(a), keys.get(b)));
  if(mode === 'name') {
    const lettered: PeerId[] = [], sections: string[] = [], nonLettered: PeerId[] = [];
    for(const peerId of byName) {
      const section = getNameSortSection(keys.get(peerId));
      if(section === NON_LETTER_SECTION) {
        nonLettered.push(peerId);
      } else {
        lettered.push(peerId);
        sections.push(section);
      }
    }

    return {
      peerIds: lettered.concat(nonLettered),
      sections: sections.concat(nonLettered.map(() => NON_LETTER_SECTION))
    };
  }

  const statuses: Map<PeerId, number> = new Map();
  for(const peerId of peerIds) {
    statuses.set(peerId, getUserStatusForSort(getUser(peerId.toUserId())?.status));
  }

  return {
    peerIds: byName.sort((a, b) => statuses.get(b) - statuses.get(a))
  };
}
