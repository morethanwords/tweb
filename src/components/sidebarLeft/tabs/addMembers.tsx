import AppSelectPeers from '@components/appSelectPeers';
import {setButtonLoader} from '@components/putPreloader';
import ButtonCorner from '@components/buttonCorner';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import type {AppAddMembersTab} from '@components/solidJsTabs/tabs';

type AppAddMembersTabClass = typeof AppAddMembersTab;

const AddMembersTab = () => {
  const [tab] = useSuperTab<AppAddMembersTabClass>();
  const {type, placeholder, takeOut, skippable, selectedPeerIds} = tab.payload;

  tab.container.classList.add('add-members-container');

  const nextBtn = ButtonCorner({icon: 'arrow_next'});
  tab.content.append(nextBtn);
  tab.scrollable.container.remove();

  nextBtn.addEventListener('click', () => {
    const peerIds = selector.getSelected().map((sel) => sel.toPeerId());
    const result = takeOut(peerIds);

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
    design: 'square'
  });

  if(selectedPeerIds) {
    selector.addInitial(selectedPeerIds);
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
