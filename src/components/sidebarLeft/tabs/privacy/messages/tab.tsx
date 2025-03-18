import {createComputed, createEffect, createResource, createSignal, Show} from 'solid-js';
import {createStore, reconcile} from 'solid-js/store';
import {Transition} from 'solid-transition-group';
import {Portal} from 'solid-js/web';

import {InputPrivacyKey, InputPrivacyRule, InputUser} from '../../../../../layer';
import {useHotReloadGuard} from '../../../../../lib/solidjs/hotReloadGuard';
import anchorCallback from '../../../../../helpers/dom/anchorCallback';
import throttle from '../../../../../helpers/schedulers/throttle';
import deepEqual from '../../../../../helpers/object/deepEqual';
import {i18n, join} from '../../../../../lib/langPack';
import {logger} from '../../../../../lib/logger';

import confirmationPopup, {ConfirmationPopupRejectReason} from '../../../../confirmationPopup';
import {PopupPeerOptions} from '../../../../popups/peer';
import {hideToast, toastNew} from '../../../../toast';
import StaticRadio from '../../../../staticRadio';
import ripple from '../../../../ripple'; ripple; // keep
import {IconTsx} from '../../../../iconTsx';
import Section from '../../../../section';
import RowTsx from '../../../../rowTsx';


import {usePromiseCollector} from '../../solidJsTabs/promiseCollector';
import {useSuperTab} from '../../solidJsTabs/superTabProvider';

import AppearZoomTransition from './appearZoomTransition';
import StarRangeInput from './starsRangeInput';
import useIsPremium from './useIsPremium';


const log = logger('my-debug');

const privacyRulesInputKey = 'inputPrivacyKeyNoPaidMessages' satisfies InputPrivacyKey['_'];

const defaultPrivacyRules: InputPrivacyRule[] = [
  {
    _: 'inputPrivacyValueAllowContacts'
  }
  // One the time the Android App has set this for some reason 🤔
  // {
  //   _: 'inputPrivacyValueDisallowAll'
  // }
];

// Note: after saving privacy rules, the cached users are objects instead of being numbers
const getUserId = (user: InputUser.inputUser | string | number) => {
  if(user instanceof Object) return user.user_id?.toPeerId(true);
  return user.toPeerId(true);
};

enum MessagesPrivacyOption {
  Everybody = 1,
  ContactsAndPremium,
  Paid
};

type StateStore = {
  option?: MessagesPrivacyOption;
  stars?: number;
  chosenPeers?: PeerId[];
};


const MessagesTab = () => {
  const {PopupPremium, rootScope} = useHotReloadGuard();

  const [tab, {AppAddMembersTab}] = useSuperTab();
  const promiseCollector = usePromiseCollector();

  const isPremium = useIsPremium();

  const [privacyRules] = createResource(() => {
    const promise = rootScope.managers.appPrivacyManager.getPrivacy(privacyRulesInputKey);
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
    if(!isPremium()) return MessagesPrivacyOption.Everybody;

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
    ?.map(getUserId)
    ?.filter((v) => v !== undefined) || [];

  const chosenPeersByType = () => ({
    chats: store.chosenPeers.filter(peer => peer.isAnyChat()).map(peer => peer.toChatId()),
    users: store.chosenPeers.filter(peer => peer.isUser())
  });

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
      chosenPeers: [...currentAllowedUsers(), ...currentAllowedChats()]
    };

    setStore(reconcile(structuredClone(initialState)));
  });


  const isPaid = () => store.option === MessagesPrivacyOption.Paid;


  const [hasChanges, setHasChanges] = createSignal(false);
  const throttledSetHasChanges = throttle(setHasChanges, 200, true);

  // The header is jerking if updating the hasChanges too quickly WTF
  createEffect(() => {
    const ignoreKeys: (keyof StateStore)[] = !!!isPaid() ? ['chosenPeers', 'stars'] : [];

    throttledSetHasChanges(!deepEqual(store, initialState, ignoreKeys));
  });


  const onExceptionsClick = () => {
    tab.slider.createTab(AppAddMembersTab).open({
      type: 'privacy',
      skippable: true,
      title: 'PaidMessages.RemoveFee',
      placeholder: 'PrivacyModal.Search.Placeholder',
      takeOut: (newPeerIds) => {
        setStore('chosenPeers', newPeerIds);
      },
      selectedPeerIds: [...store.chosenPeers]
    });
  };

  const saveGlobalSettings = () => {
    const settings = structuredClone(globalPrivacy());

    settings.noncontact_peers_paid_stars = isPaid() ? store.stars : undefined;
    if(settings.pFlags) {
      settings.pFlags.new_noncontact_peers_require_premium =
        store.option === MessagesPrivacyOption.ContactsAndPremium || undefined;
    }

    log('saving settings :>> ', settings);


    return rootScope.managers.appPrivacyManager.setGlobalPrivacySettings(settings);
  };

  const savePrivacyRules = async() => {
    const rules: InputPrivacyRule[] = [];

    const {chats, users} = chosenPeersByType();

    if(chats.length) rules.push({
      _: 'inputPrivacyValueAllowChatParticipants',
      chats
    });
    if(users.length) rules.push({
      _: 'inputPrivacyValueAllowUsers',
      users: await Promise.all(users.map((id) => rootScope.managers.appUsersManager.getUserInput(id)))
    });

    rules.push(...defaultPrivacyRules);

    log('saving rules :>> ', rules);

    return rootScope.managers.appPrivacyManager.setPrivacy(privacyRulesInputKey, rules);
  };

  let isSaving = false;

  const saveAllSettings = async() => {
    if(isSaving || !hasChanges()) return;
    isSaving = true;

    try {
      await Promise.all([
        saveGlobalSettings(),
        isPaid() ? savePrivacyRules() : undefined
      ]);
      tab.close();
    } finally {
      isSaving = false; // Idk let the user retry if it somewhy fails)
    }
  };

  tab.isConfirmationNeededOnClose = async() => {
    if(!hasChanges()) return;

    const saveButton: PopupPeerOptions['buttons'][number] = {
      langKey: 'Save'
    };

    try {
      await confirmationPopup({
        titleLangKey: 'UnsavedChanges',
        descriptionLangKey: 'PrivacyUnsavedChangesDescription',
        button: saveButton,
        buttons: [
          saveButton,
          {isCancel: true, langKey: 'Discard'}
        ],
        rejectWithReason: true
      });
      saveAllSettings();
    } catch(_reason: any) {
      const reason: ConfirmationPopupRejectReason = _reason;

      if(reason === 'closed') throw new Error();
    }
  };


  const handlePremiumOptionClick = (callback: () => void) => () => {
    if(isPremium()) return callback();

    toastNew({
      langPackKey: 'PrivacySettings.Messages.PremiumError',
      langPackArguments: [
        anchorCallback(() => {
          hideToast();
          PopupPremium.show({
            feature: 'message_privacy'
          });
        })
      ]
    });
  };


  let captionContainer: HTMLDivElement;
  let heightMeasure: HTMLDivElement;

  let exitAnimationPromise: Promise<any>;

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

          await (exitAnimationPromise = el.animate({opacity: [1, 0]}, {duration: 200}).finished);
          done();
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

  const chosenPeersLabel = () => {
    if(!store.chosenPeers.length) return i18n('PrivacySettingsController.AddUsers');

    const {users, chats} = chosenPeersByType();

    return join([
      users.length ? i18n('Users', [users.length]) : null,
      chats.length ? i18n('Chats', [chats.length]) : null
    ].filter(Boolean), false);
  };

  return (
    <Show when={isReady()}>
      <Portal mount={tab.header}>
        <AppearZoomTransition>
          <Show when={hasChanges()}>
            <button
              use:ripple
              class="btn-icon blue"
              onClick={() => void saveAllSettings()}
            >
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
            isPremium() && <StaticRadio
              floating
              checked={store.option === MessagesPrivacyOption.ContactsAndPremium}
            />
          }
          icon={!isPremium() ? 'premium_lock' : undefined}
          clickable={handlePremiumOptionClick(() => {
            setStore('option', MessagesPrivacyOption.ContactsAndPremium);
          })}
          title={i18n('Privacy.ContactsAndPremium')}
        />
        <RowTsx
          checkboxField={
            isPremium() && <StaticRadio floating checked={isPaid()} />
          }
          icon={!isPremium() ? 'premium_lock' : undefined}
          clickable={handlePremiumOptionClick(() => {
            setStore(prev => ({
              option: MessagesPrivacyOption.Paid,
              stars: prev.stars || 1
            }));
          })}
          title={i18n('PaidMessages.ChargeForMessages')}
        />
      </Section>

      <Transition
        onEnter={async(_el, done) => {
          const el = _el as HTMLElement;
          el.style.opacity = '0';
          await exitAnimationPromise;
          await el.animate({opacity: [0, 1]}, {duration: 80}).finished;
          el.style.removeProperty('opacity');
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
                rightContent={<span class="primary">{chosenPeersLabel()}</span>}
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
