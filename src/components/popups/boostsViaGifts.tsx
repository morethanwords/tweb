/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {render} from 'solid-js/web';
import PopupElement from '.';
import I18n, {_i18n, i18n, join} from '../../lib/langPack';
import Row from '../row';
import CheckboxField from '../checkboxField';
import Section from '../section';
import RangeStepsSelector from '../rangeStepsSelector';
import {For, JSX, createEffect, createMemo, createSignal, untrack} from 'solid-js';
import tsNow from '../../helpers/tsNow';
import PopupSchedule from './schedule';
import {formatFullSentTime, formatMonthsDuration} from '../../helpers/date';
import renderImageFromUrl from '../../helpers/dom/renderImageFromUrl';
import Icon from '../icon';
import {AvatarNew} from '../avatarNew';
import {IconTsx} from '../stories/viewer';
import Button from '../button';
import PeerTitle from '../peerTitle';
import {HelpCountry, InputInvoice, InputStorePaymentPurpose, PremiumGiftCodeOption} from '../../layer';
import cancelEvent from '../../helpers/dom/cancelEvent';
import PopupPremium from './premium';
import {premiumOptionsForm} from '../premium/promoSlideTab';
import {MTAppConfig} from '../../lib/mtproto/appConfig';
import PopupPickUser from './pickUser';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import toggleDisability from '../../helpers/dom/toggleDisability';
import getChatMembersString from '../wrappers/getChatMembersString';
import findUpClassName from '../../helpers/dom/findUpClassName';
import {filterCountries} from '../countryInputField';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import {getCountryEmoji} from '../../vendor/emoji';
import {toastNew} from '../toast';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import getPeerActiveUsernames from '../../lib/appManagers/utils/peers/getPeerActiveUsernames';
import confirmationPopup from '../confirmationPopup';
import {randomLong} from '../../helpers/random';
import PopupPayment from './payment';
import shake from '../../helpers/dom/shake';
import anchorCallback from '../../helpers/dom/anchorCallback';

export default class PopupBoostsViaGifts extends PopupElement {
  private premiumGiftCodeOptions: PremiumGiftCodeOption[];
  private appConfig: MTAppConfig;
  private channelsLimit: number;
  private subscribersLimit: number;
  private countriesLimit: number;

  constructor(private peerId: PeerId) {
    super('popup-boosts', {
      closable: true,
      overlayClosable: true,
      body: true,
      scrollable: true,
      title: 'BoostsViaGifts.Title',
      floatingHeader: true,
      footer: true,
      withConfirm: true
    });

    this.construct();
  }

  private _construct() {
    const [count, setCount] = createSignal(0);
    const [expiration, setExpiration] = createSignal(tsNow(true) + 3 * 86400);
    const [peerIds, setPeerIds] = createSignal<PeerId[]>([this.peerId]);
    const [specificPeerIds, setSpecificPeerIds] = createSignal<PeerId[]>([]);
    const [specific, setSpecific] = createSignal(false);
    const [durationForm, setDurationForm] = createSignal<JSX.Element>();
    const [option, setOption] = createSignal<PremiumGiftCodeOption>();
    const [countries, setCountries] = createSignal<string[]>();
    const [onlyNewSubscribers, setOnlyNewSubscribers] = createSignal(false);
    const [additionalPrizes, setAdditionalPrizes] = createSignal(false);
    const [additionalPrize, setAdditionalPrize] = createSignal('');
    const [showPrizes, setShowPrizes] = createSignal(true);
    const boosts = createMemo(() => count() * (this.appConfig.giveaway_boosts_per_premium ?? 1));

    const range: RangeStepsSelector<number> = new RangeStepsSelector({
      generateStep: (value) => ['' + value, value],
      onValue: (value) => {
        setCount(value);
      },
      middleware: this.middlewareHelper.get(),
      noFirstLast: true
    });

    // const stepValues = filterUnique(this.premiumGiftCodeOptions.map((o) => o.users));
    const stepValues = [1, 3, 5, 7, 10, 25, 50, 100].filter((v) => this.premiumGiftCodeOptions.some((o) => o.users === v));
    const focusValue = 10;
    const steps = range.generateSteps(stepValues);
    range.setSteps(steps, stepValues.indexOf(focusValue));

    const radioOptions: ConstructorParameters<typeof CheckboxField>[0] = {
      round: true,
      asRadio: true
    };

    const expirationRow = new Row({
      titleLangKey: 'Ends',
      titleRightSecondary: true,
      clickable: () => {
        const maxDate = new Date(Date.now() + (this.appConfig.giveaway_period_max ?? 604800) * 1000);
        const initDate = new Date(expiration() * 1000);
        const popup = new PopupSchedule({
          initDate,
          onPick: (timestamp) => {
            setExpiration(timestamp);
          },
          btnConfirmLangKey: 'Save',
          maxDate
        });
        popup.show();
      },
      listenerSetter: this.listenerSetter
    });

    expirationRow.titleRight.classList.add('primary');

    createEffect(() => {
      expirationRow.titleRight.replaceChildren(formatFullSentTime(expiration()));
    });

    const updateSpecific = (specific: boolean) => {
      setCount(specific ? specificPeerIds().length : range.value);
      setSpecific(specific);
      this.scrollable.updateThumb();
    };

    let img: HTMLImageElement;

    const createRow = new Row({
      titleLangKey: 'BoostsViaGifts.Create',
      subtitleLangKey: 'BoostsViaGifts.CreateSubtitle',
      clickable: () => {
        updateSpecific(false);
      },
      checkboxField: new CheckboxField({
        ...radioOptions,
        checked: !specific(),
        name: 'giveaway-type'
      }),
      listenerSetter: this.listenerSetter
    });

    const createMedia = createRow.createMedia('abitbigger');
    const createAvatar = AvatarNew({size: 42});
    createAvatar.set({icon: 'gift_premium'});
    createMedia.append(createAvatar.node);

    const createNextIcon = () => Icon('next', 'popup-boosts-specific-next');

    const specificRow = new Row({
      titleLangKey: 'BoostsViaGifts.Specific',
      subtitle: true,
      clickable: (e) => {
        cancelEvent(e);
        const popup = PopupElement.createPopup(
          PopupPickUser,
          {
            peerType: ['channelParticipants'],
            peerId: this.peerId,
            onMultiSelect: (peerIds) => {
              setSpecificPeerIds(peerIds);
              updateSpecific(true);
              specificRow.checkboxField.setValueSilently(true);
            },
            placeholder: 'SearchPlaceholder',
            exceptSelf: true,
            titleLangKey: 'Giveaway.Type.Specific.Modal.SelectUsers',
            initial: specificPeerIds()
          }
        );

        popup.selector.setLimit(this.subscribersLimit, () => {
          toastNew({langPackKey: 'Giveaway.MaximumSubscribers', langPackArguments: [this.subscribersLimit]});
        });
      },
      checkboxField: new CheckboxField({
        ...radioOptions,
        checked: specific(),
        name: 'giveaway-type'
      }),
      listenerSetter: this.listenerSetter
    });

    createEffect(() => {
      const peerIds = specificPeerIds();
      const showTitles = !(!peerIds.length || peerIds.length > 2);
      specificRow.subtitle.classList.toggle('is-flex', !showTitles);
      if(!showTitles) {
        specificRow.subtitle.replaceChildren(
          i18n(peerIds.length > 2 ? 'Recipient' : 'BoostsViaGifts.SpecificSubtitle', [peerIds.length]),
          createNextIcon()
        );
      } else {
        specificRow.subtitle.classList.remove('is-flex');
        const titles = peerIds.map((peerId) => {
          const peerTitle = new PeerTitle({
            peerId
          });

          return peerTitle.element;
        });

        specificRow.subtitle.replaceChildren(...join(titles, false));
      }
    });

    specificRow.subtitle.classList.add('primary');

    const specificMedia = specificRow.createMedia('abitbigger');
    const specificAvatar = AvatarNew({size: 42});
    specificAvatar.set({icon: 'newgroup_filled', color: 'pink'});
    specificMedia.append(specificAvatar.node);

    createRow.container.classList.add('popup-boosts-type');
    specificRow.container.classList.add('popup-boosts-type', 'popup-boosts-specific');

    const premiumPromoAnchor = anchorCallback(() => {
      PopupPremium.show();
    });

    let lastOptionIndex: number;
    createEffect(() => {
      const _count = count();
      const periods = new Map<number, PremiumGiftCodeOption>();
      this.premiumGiftCodeOptions.forEach((option, _, arr) => {
        const months = option.months;
        if(periods.has(months)) {
          return;
        }

        const sorted = arr.filter((o) => o.months === months).sort((a, b) => a.users - b.users);
        const idx = sorted.findIndex((o) => o.users >= _count);
        const nearestOption = sorted[idx] || sorted[sorted.length - 1];
        periods.set(months, nearestOption);
      });

      const options = [...periods.values()].sort((a, b) => b.months - a.months);
      const durationForm = premiumOptionsForm({
        periodOptions: options,
        onOption: (option) => {
          lastOptionIndex = options.indexOf(option);
          setOption(option);
        },
        checked: lastOptionIndex,
        users: _count,
        discountInTitle: true
      });

      setDurationForm(durationForm);
    });

    const addChannelButton = Button('btn btn-primary btn-transparent primary', {
      icon: 'add',
      text: 'AddChannel'
    });

    attachClickEvent(addChannelButton, async() => {
      const toggle = toggleDisability(addChannelButton, true);
      const popup = PopupElement.createPopup(
        PopupPickUser,
        {
          filterPeerTypeBy: ['isBroadcast'],
          onMultiSelect: (peerIds) => {
            setPeerIds([this.peerId, ...peerIds]);
          },
          placeholder: 'SearchPlaceholder',
          titleLangKey: 'AddChannels',
          initial: peerIds().filter((peerId) => peerId !== this.peerId),
          excludePeerIds: new Set([this.peerId])
        }
      );

      popup.selector.setLimit(this.channelsLimit, () => {
        toastNew({langPackKey: 'BoostingSelectUpToWarningChannelsPlural', langPackArguments: [this.channelsLimit]});
      });

      popup.addEventListener('closeAfterTimeout', () => toggle(), {once: true});

      const _add = popup.selector.add.bind(popup.selector);
      let ignorePrivatePeerId: PeerId;
      popup.selector.add = (options) => {
        const peerId = options.key.toPeerId();
        const chat = apiManagerProxy.getChat(peerId.toChatId());
        if(
          !getPeerActiveUsernames(chat)[0] &&
          ignorePrivatePeerId !== peerId &&
          popup.selector.getSelected().length < this.channelsLimit
        ) {
          confirmationPopup({
            titleLangKey: 'BoostingGiveawayPrivateChannel',
            descriptionLangKey: 'BoostingGiveawayPrivateChannelWarning',
            button: {
              langKey: 'Add'
            }
          }).then(() => {
            ignorePrivatePeerId = peerId;
            popup.selector.add({key: peerId});
            popup.selector.toggleElementCheckboxByPeerId(peerId, true);
            ignorePrivatePeerId = undefined;
          });
          return false;
        }

        return _add(options);
      };
    }, {listenerSetter: this.listenerSetter});

    const getCountriesSubtitle = () => {
      return (
        <span class="primary is-flex">
          {i18n(countries() ? 'BoostingFromCountriesCount' : 'BoostingFromAllCountries', [countries()?.length])} {createNextIcon()}
        </span>
      ) as HTMLElement;
    };

    const onCountriesClick = (e: MouseEvent) => {
      const container = findUpClassName(e.target, 'row');
      const checkbox = container.querySelector('.checkbox-field-input') as HTMLInputElement;

      if(!checkbox.checked) {
        return;
      }

      let lastFiltered: Map<string, HelpCountry>;
      const popup = PopupElement.createPopup(
        PopupPickUser,
        {
          peerType: ['custom'],
          renderResultsFunc: (iso2s) => {
            iso2s.forEach((iso2) => {
              const country = lastFiltered.get(iso2 as any as string);
              const emoji = getCountryEmoji(country.iso2);
              const title = document.createDocumentFragment();
              const emojiContainer = document.createElement('span');
              emojiContainer.classList.add('selector-countries-emoji');
              emojiContainer.append(wrapEmojiText(emoji))
              title.append(emojiContainer, ' ', i18n(country.default_name as any));
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
          onMultiSelect: (iso2s) => {
            setCountries(iso2s as any as string[]);
          },
          getMoreCustom: async(q) => {
            const filtered = filterCountries(q, true);
            lastFiltered = new Map();
            return {
              result: filtered.map((country) => {
                lastFiltered.set(country.iso2, country);
                return country.iso2;
              }) as any,
              isEnd: true
            };
          },
          titleLangKey: 'BoostingSelectCountry',
          checkboxSide: 'left',
          noPlaceholder: true
        }
      );

      const _add = popup.selector.add.bind(popup.selector);
      popup.selector.add = ({key, scroll}) => {
        const country = I18n.countriesList.find((country) => country.iso2 === key);
        const ret = _add({
          key: key,
          title: i18n(country.default_name as any),
          scroll
        });
        if(ret !== false) {
          ret.avatar.render({peerTitle: getCountryEmoji(country.iso2)});
        }
        return ret;
      };

      popup.selector.searchSection.container.classList.add('is-countries');
      popup.selector.container.classList.add('is-countries');
      popup.selector.addInitial(countries());
      popup.selector.setLimit(this.countriesLimit, () => {
        toastNew({langPackKey: 'BoostingSelectUpToWarningCountriesPlural', langPackArguments: [this.countriesLimit]});
      });
    };

    const notSpecific = (
      <>
        <Section
          name="BoostsViaGifts.Quantity"
          nameRight={
            <span class="popup-boosts-badge">
              <IconTsx icon="boost" class="popup-boosts-badge-icon" />
              {boosts()}
            </span>
          }
          caption="BoostsViaGifts.QuantitySubtitle"
          captionOld={true}
        >
          {range.container}
        </Section>
        <Section name="BoostsViaGifts.Channels">
          <For each={peerIds()}>{(peerId, idx) => {
            const peerTitle = new PeerTitle();
            peerTitle.update({peerId});
            peerTitle.element.classList.add('text-bold');
            let subtitleElement: HTMLSpanElement;
            (
              <span ref={subtitleElement}>
                {idx() === 0 && i18n('BoostsViaGifts.ChannelSubscription', [boosts()])}
                {idx() !== 0 && getChatMembersString(peerId.toChatId(), undefined, undefined, true) as HTMLElement}
              </span>
            );
            const row = new Row({
              title: peerTitle.element,
              subtitle: subtitleElement,
              ...(peerId !== this.peerId && {
                clickable: (e) => {
                  row.openContextMenu(e);
                },
                contextMenu: {
                  buttons: [{
                    icon: 'delete',
                    danger: true,
                    text: 'Remove',
                    onClick: () => {
                      setPeerIds((peerIds) => peerIds.filter((_peerId) => _peerId !== peerId));
                    }
                  }]
                }
              })
            });
            row.container.classList.add('popup-boosts-channel');
            row.createMedia('abitbigger').append(AvatarNew({peerId, size: 42}).node);
            return row.container;
          }}</For>
          {/* (peerIds().length - 1) < this.channelsLimit &&  */addChannelButton}
        </Section>
        <Section
          name="BoostsViaGifts.Users"
          caption="BoostsViaGifts.UsersSubtitle"
          captionOld={true}
        >
          <form>
            {new Row({
              titleLangKey: 'AllSubscribers',
              clickable: (e) => (setOnlyNewSubscribers(false), onCountriesClick(e)),
              checkboxField: new CheckboxField({
                ...radioOptions,
                checked: true/* !onlyNewSubscribers() */,
                name: 'giveaway-users'
              }),
              subtitle: getCountriesSubtitle(),
              listenerSetter: this.listenerSetter
            }).container}
            {new Row({
              titleLangKey: 'OnlyNewSubscribers',
              clickable: (e) => (setOnlyNewSubscribers(true), onCountriesClick(e)),
              checkboxField: new CheckboxField({
                ...radioOptions,
                // checked: onlyNewSubscribers(),
                name: 'giveaway-users'
              }),
              subtitle: getCountriesSubtitle(),
              listenerSetter: this.listenerSetter
            }).container}
          </form>
        </Section>
      </>
    );

    const additionalPrizeDiv = (
      <div class="popup-boosts-additional-row">
        <div class="popup-boosts-additional-row-count">{count()}</div>
        <input
          ref={(el) => {
            _i18n(el, 'BoostsViaGifts.AdditionalPrizeLabel', undefined, 'placeholder');
          }}
          class="input-clear popup-boosts-additional-row-input"
          onInput={(e) => {
            const target = e.target as HTMLInputElement;
            let value = target.value;
            const isOverflow = value.length > 128;
            if(isOverflow) {
              target.value = value = value.slice(0, 128);
            }

            setAdditionalPrize(value);
            if(isOverflow) {
              shake(target);
            }
          }}
        />
      </div>
    );

    const notSpecific2 = (
      <>
        <Section
          caption={additionalPrizes() ? 'BoostsViaGifts.AdditionalPrizesSubtitle' : 'BoostsViaGifts.AdditionalPrizesSubtitleOff'}
          captionArgs={additionalPrizes() ? [
            i18n(
              additionalPrize() ? 'BoostsViaGifts.AdditionalPrizesDetailedWith' : 'BoostsViaGifts.AdditionalPrizesDetailed',
              [count(), additionalPrize(), formatMonthsDuration(option().months, true)].filter(Boolean)
            )
          ] : undefined}
          captionOld={true}
        >
          {new Row({
            titleLangKey: 'BoostsViaGifts.AdditionalPrizes',
            clickable: () => {
              setAdditionalPrizes((value) => !value);
            },
            checkboxField: new CheckboxField({
              toggle: true,
              checked: untrack(additionalPrizes)
            }),
            listenerSetter: this.listenerSetter
          }).container}
          {additionalPrizes() && additionalPrizeDiv}
        </Section>
        <Section
          caption="BoostsViaGifts.ShowWinnersSubtitle"
          captionOld={true}
        >
          {new Row({
            titleLangKey: 'BoostsViaGifts.ShowWinners',
            clickable: () => {
              setShowPrizes((value) => !value);
            },
            checkboxField: new CheckboxField({
              toggle: true,
              checked: untrack(showPrizes)
            }),
            listenerSetter: this.listenerSetter
          }).container}
        </Section>
        <Section
          name="BoostsViaGifts.End"
          caption="BoostsViaGifts.EndSubtitle"
          captionArgs={[boosts()]}
          captionOld={true}
        >
          {expirationRow.container}
        </Section>
      </>
    );

    const ret = (
      <>
        <Section noDelimiter={true}>
          <div class="popup-boosts-star-container"><img class="popup-boosts-star" ref={img} /></div>
          <div class="popup-boosts-title">{i18n('BoostsViaGifts.Title')}</div>
          <div class="popup-boosts-subtitle">{i18n('BoostsViaGifts.Subtitle')}</div>
          <form>
            {createRow.container}
            {specificRow.container}
          </form>
        </Section>
        {!specific() && notSpecific}
        <Section
          name="BoostsViaGifts.Duration"
          caption="BoostsViaGifts.DurationSubtitle"
          captionArgs={[premiumPromoAnchor]}
          captionOld={true}
        >
          {durationForm()}
        </Section>
        {!specific() && notSpecific2}
      </>
    );

    renderImageFromUrl(img, `assets/img/premiumboostsstar${window.devicePixelRatio > 1 ? '@2x' : ''}.png`);

    let s: HTMLSpanElement, ssss: HTMLSpanElement;
    const ss = (<span ref={s} class="popup-boosts-button-text">{i18n('BoostsViaGifts.Start')}</span>);
    const sss = (<span ref={ssss} class="popup-boosts-button-badge"><IconTsx icon="boost" class="popup-boosts-button-badge-icon" />{boosts()}</span>);
    this.btnConfirm.classList.add('popup-boosts-button');
    this.btnConfirm.append(s, ssss);
    this.footer.append(this.btnConfirm);
    this.body.after(this.footer);
    this.footer.classList.add('abitlarger');

    const createGiveawayStoreInput = async(): Promise<InputStorePaymentPurpose> => {
      const {amount, currency} = option();
      const peers = await Promise.all(peerIds().map((peerId) => this.managers.appPeersManager.getInputPeerById(peerId)));
      return {
        _: 'inputStorePaymentPremiumGiveaway',
        pFlags: {
          only_new_subscribers: onlyNewSubscribers() || undefined,
          winners_are_visible: showPrizes() || undefined
        },
        amount,
        currency,
        boost_peer: peers[0],
        random_id: randomLong(),
        until_date: expiration(),
        additional_peers: peers.length > 1 ? peers.slice(1) : undefined,
        countries_iso2: countries()?.length ? countries() : undefined,
        prize_description: (additionalPrizes() && additionalPrize()) || undefined
      };
    };

    const createSpecificStoreInput = async(): Promise<InputStorePaymentPurpose> => {
      const {amount, currency} = option();
      const users = await Promise.all(specificPeerIds().map((peerId) => this.managers.appUsersManager.getUserInput(peerId.toUserId())));
      return {
        _: 'inputStorePaymentPremiumGiftCode',
        amount,
        currency,
        boost_peer: await this.managers.appPeersManager.getInputPeerById(this.peerId),
        users
      };
    };

    attachClickEvent(this.btnConfirm, async() => {
      const toggle = toggleDisability(this.btnConfirm, true);

      try {
        const purpose = await (specific() ? createSpecificStoreInput : createGiveawayStoreInput)();
        const inputInvoice: InputInvoice.inputInvoicePremiumGiftCode = {
          _: 'inputInvoicePremiumGiftCode',
          purpose,
          option: option()
        };
        const paymentForm = await this.managers.appPaymentsManager.getPaymentForm(inputInvoice);

        const popup = PopupElement.createPopup(PopupPayment, {inputInvoice, paymentForm});
        await new Promise<void>((resolve, reject) => {
          popup.addEventListener('finish', (result) => {
            if(result === 'cancelled' || result === 'failed') {
              reject();
            } else {
              resolve();
            }
          });
        });

        this.hide();
      } catch(err) {
        console.error('boosts via gifts error', err);
        toggle();
      }
    }, {listenerSetter: this.listenerSetter});

    return ret;
  }

  private async construct() {
    const [giftCodeOptions, appConfig] = await Promise.all([
      this.managers.appPaymentsManager.getPremiumGiftCodeOptions(this.peerId),
      this.managers.apiManager.getAppConfig()
    ]);
    this.premiumGiftCodeOptions = giftCodeOptions;
    this.appConfig = appConfig;
    this.subscribersLimit = this.channelsLimit = appConfig.giveaway_add_peers_max ?? 10;
    this.countriesLimit = appConfig.giveaway_countries_max ?? 10;
    const div = document.createElement('div');
    this.scrollable.append(div);
    const dispose = render(() => this._construct(), div);
    this.addEventListener('closeAfterTimeout', dispose);
    this.show();
  }
}
