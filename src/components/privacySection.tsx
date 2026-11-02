import {Accessor, createSignal, createUniqueId, For, JSX, Setter} from 'solid-js';
import anchorCallback from '@helpers/dom/anchorCallback';
import cancelEvent from '@helpers/dom/cancelEvent';
import replaceContent from '@helpers/dom/replaceContent';
import {wrapSolidComponent} from '@helpers/solid/wrapSolidComponent';
import {InputPrivacyKey, InputPrivacyRule, PrivacyRule} from '@layer';
import {AppManagers} from '@lib/managers';
import getPrivacyRulesDetails from '@appManagers/utils/privacy/getPrivacyRulesDetails';
import getPrivacyRulesToKeep from '@appManagers/utils/privacy/getPrivacyRulesToKeep';
import PrivacyType from '@appManagers/utils/privacy/privacyType';
import {i18n, join, LangPackKey, _i18n} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import RadioFieldTsx from '@components/radioFieldTsx';
import Row from '@components/rowTsx';
import Scrollable from '@components/scrollable';
import Section, {SectionParts} from '@components/section';
import {SliderSuperTabEventable} from '@components/sliderTab';
import {hideToast, toastNew} from '@components/toast';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import bindManagersToAccount from '@lib/accounts/bindManagersToAccount';
import {getCurrentAccount} from '@lib/accounts/getCurrentAccount';
import type {AppAddMembersExtraCategory} from '@components/solidJsTabs/tabs';

type PrivacyKey = InputPrivacyKey['_'];
type PrivacyExceptionKey = 'allow' | 'disallow';
type PrivacyException = {
  titleLangKey: LangPackKey,
  key: PrivacyExceptionKey,
  icon: Icon,
  subtitle: Accessor<JSX.Element>,
  setSubtitle: Setter<JSX.Element>
};

// * the kinds of user an exception can name besides peers, chosen in its picker
const PREMIUM_CATEGORY: AppAddMembersExtraCategory = {key: 'premium', icon: 'premium_badge', text: 'PrivacyPremium'};
const MINI_APPS_CATEGORY: AppAddMembersExtraCategory = {
  key: 'miniapps',
  icon: 'bot_filled',
  text: 'PrivacyMiniApps',
  statusLangKey: 'PrivacyMiniAppsStatus'
};

export type PrivacySectionStr = LangPackKey | '' | HTMLElement;
export default class PrivacySection {
  public radioSection: SectionParts;
  public exceptionsSection: SectionParts;
  public exceptions: Map<PrivacyExceptionKey, PrivacyException>;
  public peerIds: {
    disallow?: PeerId[],
    allow?: PeerId[]
  };
  public extras: {
    disallow?: Set<string>,
    allow?: Set<string>
  } = {};
  public type: PrivacyType;
  // * the rules as the screen loaded them, and the part of them it edits (`getEditedState`)
  private loadedRules: PrivacyRule[];
  private loadedState: string;

  private setLocked: Setter<boolean>;
  private setSelectedType: Setter<PrivacyType>;

  constructor(public options: {
    tab: SliderSuperTabEventable,
    title: LangPackKey,
    inputKey?: PrivacyKey,
    captions?: [PrivacySectionStr, PrivacySectionStr, PrivacySectionStr, PrivacySectionStr?],
    appendTo?: Scrollable,
    noExceptions?: boolean,
    onRadioChange?: (value: number) => any,
    skipTypes?: PrivacyType[],
    exceptionTexts?: [LangPackKey, LangPackKey],
    managers: AppManagers,
    premiumOnly?: boolean,
    premiumCaption?: PrivacySectionStr,
    premiumError?: LangPackKey,
    myContactsAndPremium?: boolean,
    privacyType?: PrivacyType,
    allowMiniApps?: boolean,
    // * "Premium users" offered in "Always allow" (elsewhere it is offered only while chosen, to be taken off)
    allowPremium?: boolean
  }) {
    if(options.captions) {
      options.captions.reverse();
    }

    const managers = options.managers;
    const rulesPromise = options.inputKey ? managers.appPrivacyManager.getPrivacy(options.inputKey) : Promise.resolve();

    let radioOptions: Array<{type: PrivacyType, langKey: LangPackKey}> = [{
      type: PrivacyType.Everybody,
      langKey: 'PrivacySettingsController.Everbody'
    }, {
      type: PrivacyType.Contacts,
      langKey: 'PrivacySettingsController.MyContacts'
    }, {
      type: PrivacyType.Nobody,
      langKey: 'PrivacySettingsController.Nobody'
    }];

    if(options.myContactsAndPremium) {
      const rr = radioOptions.find((option) => option.type === PrivacyType.Contacts);
      rr.langKey = 'PrivacyMessagesContactsAndPremium';
    }

    if(options.skipTypes) {
      radioOptions = radioOptions.filter((option) => !options.skipTypes.includes(option.type));
    }

    const [selectedType, setSelectedType] = createSignal<PrivacyType>();
    const [locked, setLocked] = createSignal(false);
    this.setSelectedType = setSelectedType;
    this.setLocked = setLocked;

    let radioContent!: HTMLElement, radioCaption!: HTMLElement;
    const radioContainer = wrapSolidComponent(() => {
      const name = createUniqueId();
      return (
        <Section
          name={options.title}
          // an empty caption element `replaceCaption` fills in as the type changes
          caption={true}
          contentProps={{ref: (element) => radioContent = element}}
          captionRef={(element) => radioCaption = element}
        >
          <form>
            <For each={radioOptions}>{({type, langKey}) => {
              const isLocked = () => locked() && type !== PrivacyType.Everybody;
              return (
                <Row
                  clickable={isLocked() ? (event) => {
                    cancelEvent(event);
                    toastNew({
                      langPackKey: options.premiumError,
                      langPackArguments: [
                        anchorCallback(() => {
                          hideToast();
                          hotReloadGuard.showPremiumPopup();
                        })
                      ]
                    });
                  } : undefined}
                >
                  <Row.RadioField>
                    <RadioFieldTsx
                      checked={selectedType() === type}
                      class="disable-hover"
                      locked={isLocked()}
                      name={name}
                      value={String(type)}
                      onChange={(checked) => checked && this.onRadioChange(type)}
                    />
                  </Row.RadioField>
                  <Row.Title>{i18n(langKey)}</Row.Title>
                </Row>
              );
            }}</For>
          </form>
        </Section>
      );
    }, options.tab.middlewareHelper.get());

    this.radioSection = {container: radioContainer, content: radioContent, caption: radioCaption};

    if(options.appendTo) {
      options.appendTo.append(radioContainer);
    }

    if(!options.noExceptions) {
      const createException = (
        key: PrivacyExceptionKey,
        titleLangKey: LangPackKey,
        icon: Icon
      ): PrivacyException => {
        const [subtitle, setSubtitle] = createSignal<JSX.Element>(i18n('PrivacySettingsController.AddUsers'));
        return {titleLangKey, key, icon, subtitle, setSubtitle};
      };

      this.exceptions = new Map([[
        'disallow',
        createException('disallow', options.exceptionTexts[0], 'person_crossed_filled')
      ], [
        'allow',
        createException('allow', options.exceptionTexts[1], 'adduser')
      ]]);

      let exceptionsContent!: HTMLElement;
      const exceptionsContainer = wrapSolidComponent(() => (
        <Section
          name="PrivacyExceptions"
          caption="PrivacySettingsController.PeerInfo"
          contentProps={{ref: (element) => exceptionsContent = element}}
        >
          <For each={[...this.exceptions.values()]}>{(exception) => (
            <Row
              classList={{
                hide: exception.key === 'allow' ?
                  selectedType() === PrivacyType.Everybody :
                  selectedType() === PrivacyType.Nobody
              }}
              clickable={() => {
                promise.then(() => {
                  const _peerIds = this.peerIds[exception.key];
                  const _extras = this.extras[exception.key] ?? (this.extras[exception.key] = new Set());
                  const extraCategories = [
                    exception.key === 'allow' && (options.allowPremium || _extras.has(PREMIUM_CATEGORY.key)) && PREMIUM_CATEGORY,
                    options.allowMiniApps && MINI_APPS_CATEGORY
                  ].filter(Boolean) as AppAddMembersExtraCategory[];
                  options.tab.slider.createTab(hotReloadGuard.tabs.AppAddMembersTab).open({
                    type: 'privacy',
                    skippable: true,
                    title: exception.titleLangKey,
                    placeholder: 'PrivacyModal.Search.Placeholder',
                    takeOut: (newPeerIds, newExtras) => {
                      _peerIds.length = 0;
                      _peerIds.push(...newPeerIds);
                      _extras.clear();
                      if(newExtras) for(const extra of newExtras) _extras.add(extra);
                      exception.setSubtitle(this.generateStr(this.splitPeersByType(newPeerIds), _extras));
                      this.onRadioChange(this.type);
                    },
                    selectedPeerIds: _peerIds,
                    selectedExtras: new Set(_extras),
                    extraCategories,
                    // * the kinds of user apart from the peers, under titles of their own, as tdesktop does
                    ...(extraCategories.length && {
                      extraCategoriesSectionLangKey: 'PrivacyUserTypes',
                      peersSectionLangKey: 'PrivacyUsersAndGroups'
                    })
                  });
                });
              }}
            >
              <Row.Icon icon={exception.icon} />
              <Row.Title>{i18n(exception.titleLangKey)}</Row.Title>
              <Row.Subtitle>{exception.subtitle()}</Row.Subtitle>
            </Row>
          )}</For>
        </Section>
      ), options.tab.middlewareHelper.get());

      this.exceptionsSection = {container: exceptionsContainer, content: exceptionsContent};

      if(options.appendTo) {
        options.appendTo.append(exceptionsContainer);
      }
    }

    /* setTimeout(() => {
      this.setRadio(PrivacyType.Contacts);
    }, 0); */

    const promise = rulesPromise.then((rules) => {
      const details = rules ? getPrivacyRulesDetails(rules) : undefined;
      const originalType = options.privacyType || details?.type;

      // * the exceptions are kept on a screen that does not show them too, for a save to send them back
      if(details) {
        this.peerIds = {};
        this.extras = {};
        ['allow' as const, 'disallow' as const].forEach((k) => {
          const arr = [];
          const from = k === 'allow' ? details.allowPeers : details.disallowPeers;
          arr.push(...from.users.map((id) => id.toPeerId()));
          arr.push(...from.chats.map((id) => id.toPeerId(true)));
          this.peerIds[k] = arr;
          const extras = this.extras[k] = new Set<string>();
          if(options.allowMiniApps && (k === 'allow' ? details.allowMiniApps : details.disallowMiniApps)) {
            extras.add(MINI_APPS_CATEGORY.key);
          }
          // * "Premium users" as the account has them, or chosen ahead on a screen that offers them while it stands
          // * at "Everybody", for a switch away to take them along, as tdesktop does
          if(k === 'allow' && (details.allowPremium || (options.allowPremium && originalType === PrivacyType.Everybody))) {
            extras.add(PREMIUM_CATEGORY.key);
          }
          this.exceptions?.get(k).setSubtitle(this.generateStr(from, extras));
        });
      }

      this.loadedRules = rules || [];
      this.loadedState = this.getEditedState(originalType);

      if(options.premiumOnly) {
        const toggleLock = () => {
          const locked = this.isLocked();
          this.setLocked(locked);

          this.setRadio(this.isLocked() ? PrivacyType.Everybody : originalType);
          if(this.exceptionsSection) {
            this.exceptionsSection.container.classList.toggle('hide', locked);
          }
        };

        toggleLock();
        options.tab.listenerSetter.add(rootScope)('premium_toggle', toggleLock);
      } else {
        this.setRadio(this.isLocked() ? PrivacyType.Everybody : originalType);
      }

      options.tab.eventListener.addEventListener('destroy', this.onTabDestroy, {once: true});
    });
  }

  public isLocked() {
    return this.options.premiumOnly && !rootScope.premium;
  }

  public onTabDestroy = async() => {
    // * a save on the way out reaches the account it was made in, even once the tab is on another one
    const managers = bindManagersToAccount(rootScope.managers, getCurrentAccount());
    if(this.isLocked()) {
      return;
    }

    if(!this.options.inputKey) {
      return;
    }

    // * a visit that changed nothing saves nothing: what the screen sends is only what it shows
    if(this.getEditedState(this.type) === this.loadedState) {
      return;
    }

    const rules: InputPrivacyRule[] = [];

    switch(this.type) {
      case PrivacyType.Everybody:
        rules.push({_: 'inputPrivacyValueAllowAll'});
        break;
      case PrivacyType.Contacts:
        rules.push({_: 'inputPrivacyValueAllowContacts'});
        break;
      case PrivacyType.Nobody:
        rules.push({_: 'inputPrivacyValueDisallowAll'});
        break;
    }

    if(this.peerIds) {
      const a = ([
        ['allow',     'inputPrivacyValueAllowChatParticipants',     'inputPrivacyValueAllowUsers',     'inputPrivacyValueAllowBots'],
        ['disallow',  'inputPrivacyValueDisallowChatParticipants',  'inputPrivacyValueDisallowUsers',  'inputPrivacyValueDisallowBots']
      ] as Array<[
        'allow' | 'disallow',
        'inputPrivacyValueAllowChatParticipants' | 'inputPrivacyValueDisallowChatParticipants',
        'inputPrivacyValueAllowUsers' | 'inputPrivacyValueDisallowUsers',
        'inputPrivacyValueAllowBots' | 'inputPrivacyValueDisallowBots'
      ]>);
      for(const [k, chatKey, usersKey, botsKey] of a) {
        if(
          (k === 'allow' && this.type === PrivacyType.Everybody) ||
          (k === 'disallow' && this.type === PrivacyType.Nobody)
        ) {
          continue;
        }

        const _peerIds = this.peerIds[k];
        if(!_peerIds) {
          continue;
        }

        const splitted = this.splitPeersByType(_peerIds);
        if(splitted.chats.length) {
          rules.push({_: chatKey, chats: splitted.chats});
        }

        if(splitted.users.length) {
          rules.push({
            _: usersKey,
            users: await Promise.all(splitted.users.map((id) => managers.appUsersManager.getUserInput(id)))
          });
        }

        if(this.options.allowMiniApps && this.extras[k]?.has(MINI_APPS_CATEGORY.key)) {
          rules.push({_: botsKey});
        }

        if(k === 'allow' && this.extras[k]?.has(PREMIUM_CATEGORY.key)) {
          rules.push({_: 'inputPrivacyValueAllowPremium'});
        }
      }
    }

    rules.push(...getPrivacyRulesToKeep(
      this.loadedRules,
      this.type,
      this.options.allowMiniApps ? ['privacyValueAllowBots', 'privacyValueDisallowBots'] : []
    ));

    managers.appPrivacyManager.setPrivacy(this.options.inputKey, rules);
  };

  // * what the screen edits - the type and the exceptions - to tell a change from a visit
  private getEditedState(type: PrivacyType) {
    const sorted = (values: Iterable<PeerId | string> = []) => [...values].map(String).sort();
    return JSON.stringify([
      type,
      ...(['allow', 'disallow'] as const).map((k) => [sorted(this.peerIds?.[k]), sorted(this.extras[k])])
    ]);
  }

  private replaceCaption(caption: PrivacySectionStr = this.isLocked() ? this.options.premiumCaption : this.options.captions[this.type]) {
    const captionElement = this.radioSection.caption;
    if(!caption) {
      captionElement.replaceChildren();
    } else if(caption instanceof HTMLElement) {
      replaceContent(captionElement, caption);
    } else {
      _i18n(captionElement, caption);
    }
    captionElement.classList.toggle('hide', !caption);
  }

  private onRadioChange = (value: string | PrivacySection['type']) => {
    value = +value as PrivacySection['type'];
    this.type = value;
    this.setSelectedType(value);

    this.replaceCaption();

    this.options.onRadioChange && this.options.onRadioChange(value);
  };

  public setRadio(type: PrivacySection['type']) {
    this.onRadioChange(type);
  }

  private splitPeersByType(peerIds: PeerId[]) {
    const peers = {users: [] as UserId[], chats: [] as ChatId[]};
    peerIds.forEach((peerId) => {
      peers[peerId.isAnyChat() ? 'chats' : 'users'].push(peerId.isAnyChat() ? peerId.toChatId() : peerId);
    });

    return peers;
  }

  private generateStr(peers: {users: UserId[], chats: ChatId[]}, extras?: Set<string>) {
    const hasMiniApps = extras?.has(MINI_APPS_CATEGORY.key);
    const hasPremium = extras?.has(PREMIUM_CATEGORY.key);
    if(!peers.users.length && !peers.chats.length && !hasMiniApps && !hasPremium) {
      return [i18n('PrivacySettingsController.AddUsers')];
    }

    return join([
      hasPremium ? i18n(PREMIUM_CATEGORY.text) : null,
      peers.users.length ? i18n('Users', [peers.users.length]) : null,
      peers.chats.length ? i18n('Chats', [peers.chats.length]) : null,
      hasMiniApps ? i18n(MINI_APPS_CATEGORY.text) : null
    ].filter(Boolean), false);
  }
}
