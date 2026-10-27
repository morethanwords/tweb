/*
 * The fields of a shared contact's vCard, for the lines under its name and the "Contact details"
 * popup — a port of tdesktop's Data::SharedContact::ParseVcard (data/data_media_types.cpp).
 *
 * Where tdesktop's parser loses data, this one does not: every value is kept, in the card's order
 * (tdesktop keeps one per kind, so a second phone of a kind is lost — iOS and Android show them
 * all), a value is cut at the first colon only
 * (tdesktop drops every line with a second colon — each URL, a time in a note), the property name
 * is matched case-insensitively and without the `item1.` group prefix Apple writes, `NICKNAME`
 * is not taken for `N`, and the structured values (name, organization, address) are joined
 * without their empty components.
 */

export const VCARD_ITEM_TYPES = [
  'phone',
  'phoneMain',
  'phoneHome',
  'phoneMobile',
  'phoneWork',
  'phoneOther',
  'email',
  'address',
  'url',
  'note',
  'birthday',
  'organization',
  'name'
] as const;

export type VcardItemType = typeof VCARD_ITEM_TYPES[number];
export type VcardItem = {type: VcardItemType, value: string};

// * iOS saves a Telegram user into the phonebook with a URL `https://t.me/@id<user id>` labelled
// * "Telegram" (DeviceContactUrlData(appProfile:)): its own link from the address book back to the
// * account, not something the person wrote down — and it leads nowhere here
const IOS_APP_PROFILE_URL = /^(?:https?:\/\/)?t\.me\/@id\d+\/?$/i;

// * what a structured value's components are joined with
const STRUCTURED_SEPARATORS: Partial<Record<VcardItemType, string>> = {
  organization: ' ',
  address: ', ',
  name: ' '
};

export function isVcardPhoneType(type: VcardItemType) {
  return type.startsWith('phone');
}

function decodeQuotedPrintable(value: string) {
  return value.replace(/(?:=[0-9a-f]{2})+/gi, (run) => {
    const bytes = run.slice(1).split('=').map((hex) => parseInt(hex, 16));
    return new TextDecoder().decode(new Uint8Array(bytes));
  });
}

function unescapeValue(value: string) {
  return value.replace(/\\([\\,;nN])/g, (_, char: string) => char.toLowerCase() === 'n' ? '\n' : char).trim();
}

function getPhoneType(params: string): VcardItemType {
  return params.includes('PREF') ? 'phoneMain' :
    params.includes('HOME') ? 'phoneHome' :
    params.includes('WORK') ? 'phoneWork' :
    params.includes('CELL') || params.includes('MOBILE') ? 'phoneMobile' :
    params.includes('OTHER') ? 'phoneOther' :
    'phone';
}

function getItemType(name: string, params: string): VcardItemType {
  switch(name) {
    case 'TEL': return getPhoneType(params);
    case 'EMAIL': return 'email';
    case 'URL': return 'url';
    case 'NOTE': return 'note';
    case 'BDAY': return 'birthday';
    case 'ORG': return 'organization';
    case 'ADR': return 'address';
    case 'N': return 'name';
  }
}

// * The items in the order tdesktop's popup lists the kinds, the card's order within a kind. The
// * phones are one kind here, whatever they are marked: they keep the order the bubble shows them in
export function sortVcardItems(items: VcardItem[]) {
  const getKindIndex = (type: VcardItemType) => isVcardPhoneType(type) ? 0 : VCARD_ITEM_TYPES.indexOf(type);
  return items.slice().sort((a, b) => getKindIndex(a.type) - getKindIndex(b.type));
}

export default function parseVcard(data: string): VcardItem[] {
  const items: VcardItem[] = [];
  // a line that goes on is folded onto the next one, which starts with a space or a tab
  const lines = (data || '').replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  for(let i = 0; i < lines.length; ++i) {
    let line = lines[i];
    const colonIndex = line.indexOf(':');
    if(colonIndex === -1) {
      continue;
    }

    const params = line.slice(0, colonIndex).toUpperCase().split(';');
    const isQuotedPrintable = params.some((param) => param === 'QUOTED-PRINTABLE' || param === 'ENCODING=QUOTED-PRINTABLE');
    // * a quoted-printable value that ends with '=' goes on on the next line (vCard 2.1, as
    // * Android writes a long one), unlike a folded line with no leading space
    while(isQuotedPrintable && line.endsWith('=') && i + 1 < lines.length) {
      line = line.slice(0, -1) + lines[++i];
    }

    const type = getItemType(params[0].replace(/^[^.]*\./, ''), params.join(';'));
    if(!type) {
      continue;
    }

    let value = line.slice(colonIndex + 1);
    if(isQuotedPrintable) {
      value = decodeQuotedPrintable(value);
    }

    const separator = STRUCTURED_SEPARATORS[type];
    value = separator === undefined ?
      unescapeValue(value) :
      value.split(/(?<!\\);/).map(unescapeValue).filter(Boolean).join(separator);

    if(
      value &&
      !(type === 'url' && IOS_APP_PROFILE_URL.test(value)) &&
      !items.some((item) => item.type === type && item.value === value)
    ) {
      items.push({type, value});
    }
  }

  return items;
}
