import {createComputed, createEffect, createResource, createSignal, Show} from 'solid-js';
import {createStore, reconcile} from 'solid-js/store';
import {Transition} from 'solid-transition-group';
import {Portal} from 'solid-js/web';

import {useHotReloadGuard} from '../../../../../lib/solidjs/hotReloadGuard';
import anchorCallback from '../../../../../helpers/dom/anchorCallback';
// import deepEqual from '../../../../../helpers/object/solidDeepEqual';
import deepEqual from '../../../../../helpers/object/deepEqual';
import {InputPrivacyRule} from '../../../../../layer';
import {logger} from '../../../../../lib/logger';
import {i18n} from '../../../../../lib/langPack';

import StaticRadio from '../../../../staticRadio';
import ripple from '../../../../ripple'; ripple; // keep
import {IconTsx} from '../../../../iconTsx';
import Section from '../../../../section';
import RowTsx from '../../../../rowTsx';

import {usePromiseCollector} from '../../solidJsTabs/promiseCollector';
import {useSuperTab} from '../../solidJsTabs/superTabProvider';

import AppearZoomTransition from './appearZoomTransition';
import StarRangeInput from './starsRangeInput';
import throttle from '../../../../../helpers/schedulers/throttle';


const log = logger('my-debug');

const defaultPrivacyRules: InputPrivacyRule[] = [
  {
    _: 'inputPrivacyValueAllowContacts'
  },
  {
    _: 'inputPrivacyValueDisallowAll'
  }
];

enum MessagesPrivacyOption {
  Everybody = 1,
  ContactsAndPremium,
  Paid
};

type StateStore = {
  option?: MessagesPrivacyOption;
  stars?: number;
  excludedPeers?: PeerId[];
};

const MessagesTab = () => {
  const {PopupPremium, rootScope} = useHotReloadGuard();

  const [tab, {AppAddMembersTab}] = useSuperTab();
  const promiseCollector = usePromiseCollector();

  const [privacyRules] = createResource(() => {
    const promise = rootScope.managers.appPrivacyManager.getPrivacy('inputPrivacyKeyNoPaidMessages');
    promiseCollector.collect(promise);
    return promise;
  });

  const [globalPrivacy] = createResource(() => {
    const promise = rootScope.managers.appPrivacyManager.getGlobalPrivacySettings();
    promiseCollector.collect(promise);
    return promise;
  });

  const isReady = () => privacyRules.state === 'ready' && globalPrivacy.state === 'ready';


  const currentOption = () => {
    if(globalPrivacy().noncontact_peers_paid_stars) return MessagesPrivacyOption.Paid;

    if(globalPrivacy().pFlags.new_noncontact_peers_require_premium) return MessagesPrivacyOption.ContactsAndPremium;

    return MessagesPrivacyOption.Everybody;
  };

  const currentAllowedUsers = () =>
    privacyRules()
    ?.find((rule) => rule._ === 'privacyValueAllowUsers')?.users
    ?.map(user => user.toPeerId()) || [];

  const currentAllowedChats = () =>
    privacyRules()
    ?.find((rule) => rule._ === 'privacyValueAllowChatParticipants')?.chats
    ?.map(user => user.toPeerId(true)) || [];

  createEffect(() => {
    log('privacyRules() :>> ', privacyRules());
    log('globalPrivacy() :>> ', globalPrivacy());
  });

  let initialState: StateStore = {};
  const [store, setStore] = createStore<StateStore>({});

  createComputed(() => {
    if(!isReady()) return;

    initialState = {
      option: currentOption(),
      stars: Number(globalPrivacy().noncontact_peers_paid_stars) || undefined,
      excludedPeers: [...currentAllowedUsers(), ...currentAllowedChats()]
    };

    setStore(reconcile(structuredClone(initialState)));
  });


  const isPaid = () => store.option === MessagesPrivacyOption.Paid;


  const [hasChanges, setHasChanges] = createSignal(false);
  const throttledSetHasChanges = throttle(setHasChanges, 200, true);

  // The header is jerking if changing the hasChanges too quickly WTF
  createEffect(() => {
    throttledSetHasChanges(!deepEqual(store, initialState));
  });


  const onExceptionsClick = () => {
    tab.slider.createTab(AppAddMembersTab).open({
      type: 'privacy',
      skippable: true,
      title: 'PaidMessages.RemoveFee',
      placeholder: 'PrivacyModal.Search.Placeholder',
      takeOut: (newPeerIds) => {
        setStore('excludedPeers', newPeerIds);
      },
      selectedPeerIds: [...store.excludedPeers]
    });
  };


  let captionContainer: HTMLDivElement;
  let heightMeasure: HTMLDivElement;

  const caption = () => (
    <div ref={captionContainer}>
      <div ref={heightMeasure} style="height: 0; overflow: hidden; visibility: hidden" tabIndex={-1}>
        {i18n('PaidMessages.ChargeForMessagesDescription')}
      </div>
      <Transition
        mode="outin"
        onEnter={async(_el, done) => {
          const el = _el as HTMLElement;
          await el.animate({opacity: [0, 1]}, {duration: 200}).finished;
          done();
        }}
        onExit={async(_el, done) => {
          const el = _el as HTMLElement;
          if(isPaid()) captionContainer.style.height = heightMeasure.scrollHeight + 'px';
          if(!isPaid()) await el.animate({opacity: [1, 0]}, {duration: 200}).finished;

          done();
          captionContainer.style.removeProperty('height');
        }}
      >
        {
          !isPaid() ?
            i18n('Privacy.MessagesInfo', [anchorCallback(() => void PopupPremium.show())]) :
            i18n('PaidMessages.ChargeForMessagesDescription')
        }
      </Transition>
    </div>
  );

  return (
    <Show when={isReady()}>
      <Portal mount={tab.header}>
        <AppearZoomTransition>
          <Show when={hasChanges()}>
            <button use:ripple class="btn-icon blue">
              <IconTsx icon="check" />
            </button>
          </Show>
        </AppearZoomTransition>
      </Portal>

      <Section
        name="PrivacyMessagesTitle"
        caption={caption() as any}
      >
        <RowTsx
          checkboxField={
            <StaticRadio
              floating
              checked={store.option === MessagesPrivacyOption.Everybody}
            />
          }
          clickable={() => {
            setStore('option', MessagesPrivacyOption.Everybody);
          }}
          title={i18n('PrivacySettingsController.Everbody')}
        />
        <RowTsx
          checkboxField={
            <StaticRadio
              floating
              checked={store.option === MessagesPrivacyOption.ContactsAndPremium}
            />
          }
          clickable={() => {
            setStore('option', MessagesPrivacyOption.ContactsAndPremium);
          }}
          title={i18n('Privacy.ContactsAndPremium')}
        />
        <RowTsx
          checkboxField={
            <StaticRadio floating checked={isPaid()} />
          }
          clickable={() => {
            setStore(prev => ({
              option: MessagesPrivacyOption.Paid,
              stars: prev.stars || 1
            }));
          }}
          title={i18n('PaidMessages.ChargeForMessages')}
        />
      </Section>

      <Transition
        onEnter={async(el, done) => {
          await el.animate({opacity: [0, 1]}, {duration: 80}).finished;
          done();
        }}
        onExit={async(el, done) => {
          await el.animate({opacity: [1, 0]}, {duration: 80}).finished;
          done();
        }}
      >
        <Show when={isPaid()}>
          <div>
            <Section
              name="PaidMessages.SetPrice"
              caption="PaidMessages.SetPriceDescription"
              captionArgs={[10.12]}
            >
              <StarRangeInput value={store.stars} onChange={setStore.bind(null, 'stars')} />
            </Section>

            <Section name="PrivacyExceptions" caption="PaidMessages.RemoveFeeDescription">
              <RowTsx
                title={i18n('PaidMessages.RemoveFee')}
                rightContent={(() => {
                  const el = store.excludedPeers.length ?
                    i18n('Users', [store.excludedPeers.length]) :
                    i18n('PrivacySettingsController.AddUsers');

                  el.classList.add('primary');
                  return el;
                })()}
                clickable={onExceptionsClick}
              />
            </Section>
          </div>
        </Show>
      </Transition>
    </Show>
  );
};

export default MessagesTab;
