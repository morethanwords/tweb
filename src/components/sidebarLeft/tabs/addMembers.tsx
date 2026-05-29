import AppSelectPeers from '@components/appSelectPeers';
import {setButtonLoader} from '@components/putPreloader';
import ButtonCorner from '@components/buttonCorner';
import Button from '@components/button';
import SettingSection from '@components/settingSection';
import {i18n} from '@lib/langPack';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import type {AppAddMembersTab} from '@components/solidJsTabs/tabs';
import type {AppAddMembersExtraCategory} from '@components/solidJsTabs/tabs';

type AppAddMembersTabClass = typeof AppAddMembersTab;

const AddMembersTab = () => {
  const [tab] = useSuperTab<AppAddMembersTabClass>();
  const {type, placeholder, takeOut, skippable, selectedPeerIds, selectedExtras, extraCategories, extraCategoriesSectionLangKey} = tab.payload;

  tab.container.classList.add('add-members-container');

  const nextBtn = ButtonCorner({icon: 'arrow_next'});
  tab.content.append(nextBtn);
  tab.scrollable.container.remove();

  nextBtn.addEventListener('click', () => {
    const all = selector.getSelected();
    const peerIds: PeerId[] = [];
    const extras = new Set<string>();
    for(const sel of all) {
      if(sel.isPeerId()) peerIds.push(sel.toPeerId());
      else extras.add(sel as string);
    }
    const result = takeOut(peerIds, extras);

    if(skippable && !(result instanceof Promise)) {
      tab.close();
    } else if(result instanceof Promise) {
      attachToPromise(result);
    } else if(result === undefined) {
      tab.close();
    }
  });

  const isPrivacy = type === 'privacy';
  const selector = new AppSelectPeers({
    middleware: tab.middlewareHelper.get(),
    appendTo: tab.content,
    onChange: skippable ? null : (length) => {
      nextBtn.classList.toggle('is-visible', !!length);
    },
    peerType: [isPrivacy ? 'dialogs' : 'contacts'],
    placeholder,
    exceptSelf: isPrivacy,
    filterPeerTypeBy: isPrivacy ? ['isAnyGroup', 'isUser'] : undefined,
    managers: tab.managers,
    design: isPrivacy ? 'round' : 'square',
    checkboxSide: isPrivacy ? 'right' : 'left'
  });

  if(extraCategories?.length) {
    const categoriesByKey = new Map<string, AppAddMembersExtraCategory>(
      extraCategories.map((c) => [c.key, c])
    );

    const categoriesSection = new SettingSection({
      noDelimiter: true,
      name: extraCategoriesSectionLangKey
    });
    categoriesSection.container.classList.add('folder-categories');

    const f = document.createDocumentFragment();
    for(const cat of extraCategories) {
      const button = Button('btn-primary btn-transparent folder-category-button', {icon: cat.icon, text: cat.text});
      button.dataset.peerId = cat.key;
      button.append(selector.checkbox());
      f.append(button);
    }
    categoriesSection.content.append(f);

    const _add = selector.add.bind(selector);
    selector.add = ({key, title, scroll, fireOnChange, fallbackIcon}) => {
      const cat = typeof key === 'string' ? categoriesByKey.get(key) : undefined;
      return _add({
        key,
        title: cat ? i18n(cat.text) : title,
        scroll,
        fireOnChange,
        fallbackIcon: cat ? cat.icon : fallbackIcon
      });
    };

    selector.scrollable.append(
      categoriesSection.container,
      selector.scrollable.container.lastElementChild
    );
  }

  const initialPeerIds = selectedPeerIds || [];
  const initialExtras = selectedExtras ? [...selectedExtras] : [];
  const initialAll = [...initialExtras, ...initialPeerIds];
  if(initialAll.length) {
    selector.addInitial(initialAll);
  }

  nextBtn.disabled = false;
  nextBtn.classList.toggle('is-visible', skippable);

  function attachToPromise(promise: Promise<any>) {
    const removeLoader = setButtonLoader(nextBtn, 'arrow_next');
    promise.then(() => {
      tab.close();
    }, () => {
      removeLoader();
    });
  }

  tab.payload.attachToPromise = attachToPromise;

  return <></>;
};

export default AddMembersTab;
