import {Accessor, createSignal, createUniqueId, For, JSX, Setter} from 'solid-js';
import anchorCallback from '@helpers/dom/anchorCallback';
import cancelEvent from '@helpers/dom/cancelEvent';
import replaceContent from '@helpers/dom/replaceContent';
import {renderComponent} from '@helpers/solid/renderComponent';
import {InputPrivacyKey, InputPrivacyRule} from '@layer';
import {AppManagers} from '@lib/managers';
import getPrivacyRulesDetails from '@appManagers/utils/privacy/getPrivacyRulesDetails';
import PrivacyType from '@appManagers/utils/privacy/privacyType';
import {i18n, join, LangPackKey, _i18n} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import PopupPremium from '@components/popups/premium';
import RadioFieldTsx from '@components/radioFieldTsx';
import Row from '@components/rowTsx';
import Scrollable from '@components/scrollable';
import SettingSection from '@components/settingSection';
import {AppAddMembersTab} from '@components/solidJsTabs';
import {SliderSuperTabEventable} from '@components/sliderTab';
import {hideToast, toastNew} from '@components/toast';

type PrivacyKey = InputPrivacyKey['_'];
type PrivacyExceptionKey = 'allow' | 'disallow';
type PrivacyException = {
  titleLangKey: LangPackKey,
  key: PrivacyExceptionKey,
  icon: Icon,
  subtitle: Accessor<JSX.Element>,
  setSubtitle: Setter<JSX.Element>
};

export type PrivacySectionStr = LangPackKey | '' | HTMLElement;
export default class PrivacySection {
  public radioSection: SettingSection;
  public exceptionsSection: SettingSection;
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
    allowMiniApps?: boolean
  }) {
    if(options.captions) {
      options.captions.reverse();
    }

    const managers = options.managers;
    const rulesPromise = options.inputKey ? managers.appPrivacyManager.getPrivacy(options.inputKey) : Promise.resolve();

    this.radioSection = new SettingSection({name: options.title, caption: true});

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

    renderComponent({
      element: this.radioSection.content,
      Component: () => {
        const name = createUniqueId();
        return (
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
                          PopupPremium.show();
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
        );
      },
      middleware: options.tab.middlewareHelper.get()
    });
    if(options.appendTo) {
      options.appendTo.append(this.radioSection.container);
    }

    if(!options.noExceptions) {
      const section = this.exceptionsSection = new SettingSection({name: 'PrivacyExceptions', caption: 'PrivacySettingsController.PeerInfo'});

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

      renderComponent({
        element: section.content,
        Component: () => (
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
                  options.tab.slider.createTab(AppAddMembersTab).open({
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
                    extraCategories: options.allowMiniApps ? [{
                      key: 'miniapps',
                      icon: 'bot_filled',
                      text: 'PrivacyMiniApps',
                      statusLangKey: 'PrivacyMiniAppsStatus'
                    }] : undefined
                  });
                });
              }}
            >
              <Row.Icon icon={exception.icon} />
              <Row.Title>{i18n(exception.titleLangKey)}</Row.Title>
              <Row.Subtitle>{exception.subtitle()}</Row.Subtitle>
            </Row>
          )}</For>
        ),
        middleware: options.tab.middlewareHelper.get()
      });

      if(options.appendTo) {
        options.appendTo.append(section.container);
      }
    }

    /* setTimeout(() => {
      this.setRadio(PrivacyType.Contacts);
    }, 0); */

    const promise = rulesPromise.then((rules) => {
      const details = rules ? getPrivacyRulesDetails(rules) : undefined;
      const originalType = options.privacyType || details?.type;

      if(this.exceptions) {
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
            extras.add('miniapps');
          }
          this.exceptions.get(k).setSubtitle(this.generateStr(from, extras));
        });
      }

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
    if(this.isLocked()) {
      return;
    }

    if(!this.options.inputKey) {
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

    if(this.exceptions) {
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
            users: await Promise.all(splitted.users.map((id) => rootScope.managers.appUsersManager.getUserInput(id)))
          });
        }

        if(this.options.allowMiniApps && this.extras[k]?.has('miniapps')) {
          rules.push({_: botsKey});
        }
      }
    }

    rootScope.managers.appPrivacyManager.setPrivacy(this.options.inputKey, rules);
  };

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
    const hasMiniApps = extras?.has('miniapps');
    if(!peers.users.length && !peers.chats.length && !hasMiniApps) {
      return [i18n('PrivacySettingsController.AddUsers')];
    }

    return join([
      peers.users.length ? i18n('Users', [peers.users.length]) : null,
      peers.chats.length ? i18n('Chats', [peers.chats.length]) : null,
      hasMiniApps ? i18n('PrivacyMiniApps') : null
    ].filter(Boolean), false);
  }
}
