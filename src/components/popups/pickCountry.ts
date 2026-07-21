import {filterCountries} from '@components/countryInputField';
import Row from '@components/row';
import {toastNew} from '@components/toast';
import getPollCountryName from '@helpers/getPollCountryName';
import isObject from '@helpers/object/isObject';
import {HelpCountry} from '@layer';
import I18n, {LangPackKey} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import {getCountryEmoji} from '@vendor/emoji';
import showPickUserPopup from './pickUser';

type ShowPickCountryPopupOptions = {
  excludeVirtual?: boolean;
  initial?: string[];
  limit?: number;
  limitReachedLangKey?: LangPackKey;
  naming?: 'default' | 'poll';
  onSelect: (iso2s: string[]) => void;
  titleLangKey: LangPackKey;
};

export default function showPickCountryPopup(options: ShowPickCountryPopupOptions) {
  let lastFiltered: Map<string, HelpCountry>;
  const getCountryName = (iso2: string) => {
    if(options.naming === 'poll') return getPollCountryName(iso2);

    const country = I18n.countriesList.find((item) => item.iso2.toLowerCase() === iso2.toLowerCase());
    return country ? I18n.format(country.default_name as any, true) : iso2;
  };
  const popup = showPickUserPopup({
    peerType: ['custom'],
    renderResultsFunc: (iso2s) => {
      iso2s.forEach((iso2) => {
        const country = lastFiltered.get(iso2 as any as string);
        const emoji = getCountryEmoji(country.iso2);
        const title = document.createDocumentFragment();
        const emojiContainer = document.createElement('span');
        emojiContainer.classList.add('selector-countries-emoji');
        emojiContainer.append(wrapEmojiText(emoji));
        title.append(emojiContainer, ' ', getCountryName(country.iso2));

        const row = new Row({
          title,
          clickable: true,
          havePadding: true
        });

        row.container.append(popup.selector.checkbox(popup.selector.selected.has(iso2)));
        row.container.dataset.peerId = '' + iso2;
        popup.selector.list.append(row.container);
      });
    },
    placeholder: 'Search',
    onSelect: (selected) => {
      options.onSelect(selected.map(({key}) => key));
    },
    multiSelect: true,
    footerButtonProps: {langKey: 'Save'},
    getMoreCustom: async(q) => {
      let filtered = filterCountries(q, options.excludeVirtual);
      if(options.naming === 'poll') {
        const normalizedQuery = q.trim().toLowerCase();
        const matchesPollName = filterCountries('', options.excludeVirtual)
        .filter((country) => getCountryName(country.iso2).toLowerCase().includes(normalizedQuery));
        filtered = [...new Map([...filtered, ...matchesPollName].map((country) => [country.iso2, country])).values()]
        .sort((a, b) => getCountryName(a.iso2).localeCompare(getCountryName(b.iso2)));
      }
      lastFiltered = new Map();
      return {
        result: filtered.map((country) => {
          lastFiltered.set(country.iso2, country);
          return country.iso2;
        }) as any,
        isEnd: true
      };
    },
    titleLangKey: options.titleLangKey,
    checkboxSide: 'left',
    noPlaceholder: true
  });

  const add = popup.selector.add.bind(popup.selector);
  popup.selector.add = ({key, scroll}) => {
    const iso2 = String(key);
    const ret = add({
      key,
      title: getCountryName(iso2),
      scroll
    });
    if(isObject(ret)) {
      ret.avatar.render({peerTitle: getCountryEmoji(iso2)});
    }
    return ret;
  };

  popup.selector.searchSection.container.classList.add('is-countries');
  popup.selector.container.classList.add('is-countries');
  popup.selector.addInitial((options.initial || []) as any);

  if(options.limit) {
    popup.selector.setLimit(options.limit, () => {
      if(options.limitReachedLangKey) {
        toastNew({
          langPackKey: options.limitReachedLangKey,
          langPackArguments: [options.limit]
        });
      }
    });
  }

  return popup;
}
