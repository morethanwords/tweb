/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from '.';
import I18n, {FormatterArguments, LangPackKey, _i18n, i18n, join} from '../../lib/langPack';
import Row from '../row';
import CheckboxField from '../checkboxField';
import Section from '../section';
import RangeStepsSelector from '../rangeStepsSelector';
import {Accessor, For, JSX, createEffect, createMemo, createSignal, untrack} from 'solid-js';
import tsNow from '../../helpers/tsNow';
import PopupSchedule from './schedule';
import {formatFullSentTime, formatMonthsDuration} from '../../helpers/date';
import renderImageFromUrl from '../../helpers/dom/renderImageFromUrl';
import Icon from '../icon';
import {AvatarNew} from '../avatarNew';
import Button from '../button';
import PeerTitle from '../peerTitle';
import {HelpCountry, InputInvoice, InputStorePaymentPurpose, PremiumGiftCodeOption, PrepaidGiveaway, StarsGiveawayOption, StarsGiveawayWinnersOption} from '../../layer';
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
import {IconTsx} from '../iconTsx';
import {CPrepaidGiveaway} from '../sidebarRight/tabs/boosts';
import isObject from '../../helpers/object/isObject';
import classNames from '../../helpers/string/classNames';
import RowTsx from '../rowTsx';
import {StarsStackedStars} from './stars';
import numberThousandSplitter, {numberThousandSplitterForStars} from '../../helpers/number/numberThousandSplitter';
import paymentsWrapCurrencyAmount from '../../helpers/paymentsWrapCurrencyAmount';
import flatten from '../../helpers/array/flatten';

export const BoostsBadge = (props: {boosts: number}) => {
  return (
    <span class="popup-boosts-badge">
      <IconTsx icon="boost" class="popup-boosts-badge-icon" />
      {props.boosts}
    </span>
  );
};

export const BoostsConfirmButton = (props: {
  button: HTMLElement,
  langKey: Accessor<LangPackKey>,
  langArgs?: Accessor<FormatterArguments>,
  boosts: Accessor<number>
}) => {
  let s: HTMLSpanElement, ssss: HTMLSpanElement;
  const ss = (<span ref={s} class="popup-boosts-button-text">{i18n(props.langKey(), props.langArgs?.())}</span>);
  const sss = (<span ref={ssss} class={classNames('popup-boosts-button-badge', !props.boosts() && 'hide')}><IconTsx icon="boost" class="popup-boosts-button-badge-icon" />{props.boosts()}</span>);
  props.button.classList.add('popup-boosts-button');
  props.button.append(s, ssss);
};

export default class PopupBoostsViaGifts extends PopupElement {
  private premiumGiftCodeOptions: PremiumGiftCodeOption[];
  private starsOptions: StarsGiveawayOption[];
  private appConfig: MTAppConfig;
  private channelsLimit: number;
  private subscribersLimit: number;
  private countriesLimit: number;

  constructor(
    private peerId: PeerId,
    private prepaidGiveaway?: PrepaidGiveaway,
    private onCreated?: () => void
  ) {
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
    const [subscriptionsCount, setSubscriptionsCount] = createSignal(10);
    const [expiration, setExpiration] = createSignal(tsNow(true) + 3 * 86400);
    const [peerIds, setPeerIds] = createSignal<PeerId[]>([this.peerId]);
    const [specificPeerIds, setSpecificPeerIds] = createSignal<PeerId[]>([]);
    const [stars, setStars] = createSignal(this.prepaidGiveaway?._ === 'prepaidStarsGiveaway');
    const [starsOption, setStarsOption] = createSignal<StarsGiveawayOption>(this.starsOptions?.[0]);
    const [starsWinner, setStarsWinner] = createSignal<StarsGiveawayWinnersOption>(starsOption() && starsOption().winners[0]);
    const [specific, setSpecific] = createSignal(false);
    const [durationForm, setDurationForm] = createSignal<JSX.Element>();
    const [option, setOption] = createSignal<PremiumGiftCodeOption>();
    const [countries, setCountries] = createSignal<string[]>();
    const [onlyNewSubscribers, setOnlyNewSubscribers] = createSignal(false);
    const [additionalPrizes, setAdditionalPrizes] = createSignal(false);
    const [additionalPrize, setAdditionalPrize] = createSignal('');
    const [showPrizes, setShowPrizes] = createSignal(true);
    const isPrepaid = createMemo(() => !!this.prepaidGiveaway);
    const count = createMemo(() => stars() ? starsWinner().users : subscriptionsCount());
    const boosts = createMemo(() => stars() ? starsOption().yearly_boosts : count() * (this.appConfig.giveaway_boosts_per_premium ?? 1));

    let range: RangeStepsSelector<number>;
    if(!isPrepaid()) {
      range = new RangeStepsSelector({
        generateStep: (value) => ['' + value, value],
        onValue: (value) => {
          if(stars()) {
            setStarsWinner(starsOption().winners.find((winner) => winner.users === value));
          } else {
            setSubscriptionsCount(value);
          }
        },
        middleware: this.middlewareHelper.get(),
        noFirstLast: true
      });

      createEffect(() => {
        if(stars()) {
          const stepValues = starsOption().winners.map((winner) => winner.users);
          const steps = range.generateSteps(stepValues);
          const winner = untrack(starsWinner);
          let index = stepValues.findIndex((v) => v >= winner.users);
          if(index === -1) {
            index = stepValues.length - 1;
          } else if(stepValues[index] !== winner.users) {
            index = Math.max(0, index - 1);
          }
          range.setSteps(steps, index);
          return;
        }

        // const stepValues = filterUnique(this.premiumGiftCodeOptions.map((o) => o.users));
        const stepValues = [1, 3, 5, 7, 10, 25, 50, 100].filter((v) => this.premiumGiftCodeOptions.some((o) => o.users === v));
        const steps = range.generateSteps(stepValues);
        const focusValue = untrack(subscriptionsCount);
        range.setSteps(steps, stepValues.indexOf(focusValue));
      });
    } else {
      setSubscriptionsCount(this.prepaidGiveaway.quantity);
    }

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
      setSubscriptionsCount(specific ? specificPeerIds().length : range?.value);
      setSpecific(specific);
      this.scrollable.updateThumb();
    };

    let img: HTMLImageElement;

    let prepaidRowContainer: HTMLElement,
      createRowContainer: HTMLElement,
      starsRowContainer: HTMLElement;
    if(this.prepaidGiveaway) {
      prepaidRowContainer = CPrepaidGiveaway({
        giveaway: this.prepaidGiveaway,
        appConfig: this.appConfig
      });
    } else {
      const createRow = new Row({
        titleLangKey: 'BoostingPremium',
        subtitle: true,
        clickable: (e) => {
          if(stars()) {
            setStars(false);
            return;
          }

          cancelEvent(e);
          const popup = PopupElement.createPopup(
            PopupPickUser,
            {
              peerType: ['channelParticipants'],
              peerId: this.peerId,
              onMultiSelect: (peerIds) => {
                setSpecificPeerIds(peerIds);
                updateSpecific(true);
                starsRow.checkboxField.setValueSilently(true);
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
          checked: !stars(),
          name: 'giveaway-type'
        }),
        listenerSetter: this.listenerSetter
      });

      const createMedia = createRow.createMedia('abitbigger');
      const createAvatar = AvatarNew({size: 42});
      createAvatar.set({icon: 'gift_premium', color: 'premium'});
      createMedia.append(createAvatar.node);
      createRowContainer = createRow.container;

      const starsRow = new Row({
        titleLangKey: 'BoostingStars',
        subtitleLangKey: 'BoostsViaGifts.CreateSubtitle',
        clickable: (e) => {
          setStars(true);
        },
        checkboxField: new CheckboxField({
          ...radioOptions,
          checked: stars(),
          name: 'giveaway-type'
        }),
        listenerSetter: this.listenerSetter
      });

      createEffect(() => {
        const peerIds = specificPeerIds();
        const showTitles = !(!peerIds.length || peerIds.length > 2);
        createRow.subtitle.classList.toggle('is-flex', !showTitles);
        if(!showTitles) {
          createRow.subtitle.replaceChildren(
            i18n(peerIds.length > 2 ? 'Recipient' : 'BoostsViaGifts.CreateSubtitle', [peerIds.length]),
            createNextIcon()
          );
        } else {
          createRow.subtitle.classList.remove('is-flex');
          const titles = peerIds.map((peerId) => {
            const peerTitle = new PeerTitle({
              peerId
            });

            return peerTitle.element;
          });

          createRow.subtitle.replaceChildren(...join(titles, false));
        }
      });

      createRow.subtitle.classList.add('primary');

      const specificMedia = starsRow.createMedia('abitbigger');
      const specificAvatar = AvatarNew({size: 42});
      specificAvatar.set({icon: 'star', color: 'stars'});
      specificMedia.append(specificAvatar.node);
      starsRowContainer = starsRow.container;

      starsRowContainer.classList.add('popup-boosts-type');
      createRowContainer.classList.add('popup-boosts-type', 'popup-boosts-specific');
    }

    const createNextIcon = () => Icon('next', 'popup-boosts-specific-next');

    const premiumPromoAnchor = anchorCallback(() => {
      PopupPremium.show();
    });

    let lastOptionIndex: number;
    createEffect(() => {
      const _count = subscriptionsCount();
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
        if(isObject(ret)) {
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
        {!isPrepaid() && stars() && (
          <Section
            name="BoostingStarsOptions"
            caption="BoostingStarsOptionsInfo"
            captionOld={true}
          >
            <form>
              <For each={this.starsOptions}>
                {(option) => {
                  const checkboxField = new CheckboxField({
                    ...radioOptions,
                    checked: starsOption() === option,
                    name: 'giveaway-stars-quantity'
                  });

                  const subtitle = createMemo(() => {
                    const winner = option.winners.find((winner) => winner.users === starsWinner().users);
                    if(!winner) {
                      return;
                    }

                    return i18n('BoostingStarOptionPerUser', [numberThousandSplitterForStars(+winner.per_user_stars)]);
                  });

                  return (
                    <RowTsx
                      classList={{'popup-boosts-stars-row': true}}
                      title={
                        <span class="popup-boosts-stars-amount text-bold">
                          <StarsStackedStars stars={+option.stars} size={18} />
                          {' '}
                          {i18n('Stars', [numberThousandSplitterForStars(+option.stars)])}
                        </span>
                      }
                      subtitle={subtitle()}
                      rightContent={paymentsWrapCurrencyAmount(option.amount, option.currency)}
                      checkboxField={checkboxField.label}
                      noRipple
                      clickable={() => {
                        setStarsOption(option);
                      }}
                    />
                  );
                }}
              </For>
            </form>
          </Section>
        )}
        {!isPrepaid() && (
          <Section
            name={stars() ? 'BoostingStarsQuantityPrizes' : 'BoostsViaGifts.Quantity'}
            nameRight={!stars() && <BoostsBadge boosts={boosts()} />}
            caption={stars() ? 'BoostingStarsQuantityPrizesInfo' : 'BoostsViaGifts.QuantitySubtitle'}
            captionOld={true}
          >
            {range.container}
          </Section>
        )}
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
          caption={additionalPrizes() ? 'BoostsViaGifts.AdditionalPrizesSubtitle' : (stars() ? 'BoostingStarsGiveawayAdditionPrizeHint' : 'BoostsViaGifts.AdditionalPrizesSubtitleOff')}
          captionArgs={additionalPrizes() ? (stars () ? [
            i18n(
              additionalPrize() ? 'BoostsViaGifts.AdditionalStarsPrizesDetailedWith' : 'BoostsViaGifts.AdditionalStarsPrizesDetailed',
              [starsOption().stars, count(), additionalPrize()].filter(Boolean)
            )
          ] : [
            i18n(
              additionalPrize() ? 'BoostsViaGifts.AdditionalPrizesDetailedWith' : 'BoostsViaGifts.AdditionalPrizesDetailed',
              [subscriptionsCount(), additionalPrize(), formatMonthsDuration(option().months, true)].filter(Boolean)
            )
          ]) : undefined}
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
          caption={stars() ? 'BoostsViaGifts.Stars.EndSubtitle' : 'BoostsViaGifts.EndSubtitle'}
          captionArgs={[count()]}
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
          <div class="popup-boosts-subtitle">{i18n(isPrepaid() && this.prepaidGiveaway._ === 'prepaidGiveaway' ? 'BoostingGetMoreBoosts' : 'BoostingGetMoreBoosts2')}</div>
          {isPrepaid() && prepaidRowContainer}
          {!isPrepaid() && (
            <form>
              {createRowContainer}
              {starsRowContainer}
            </form>
          )}
        </Section>
        {!specific() && notSpecific}
        {!isPrepaid() && !stars() && (
          <Section
            name="BoostsViaGifts.Duration"
            caption="BoostsViaGifts.DurationSubtitle"
            captionArgs={[premiumPromoAnchor]}
            captionOld={true}
          >
            {durationForm()}
          </Section>
        )}
        {!specific() && notSpecific2}
      </>
    );

    renderImageFromUrl(img, `assets/img/premiumboostsstar${window.devicePixelRatio > 1 ? '@2x' : ''}.png`);

    BoostsConfirmButton({
      button: this.btnConfirm,
      langKey: () => 'BoostsViaGifts.Start',
      boosts
    });
    this.footer.append(this.btnConfirm);
    this.body.after(this.footer);
    this.footer.classList.add('abitlarger');

    const createGiveawayStoreInput = async(): Promise<InputStorePaymentPurpose> => {
      const peers = await Promise.all(peerIds().map((peerId) => this.managers.appPeersManager.getInputPeerById(peerId)));

      const common = {
        pFlags: {
          only_new_subscribers: onlyNewSubscribers() || undefined,
          winners_are_visible: showPrizes() || undefined
        },
        boost_peer: peers[0],
        random_id: randomLong(),
        until_date: expiration(),
        additional_peers: peers.length > 1 ? peers.slice(1) : undefined,
        countries_iso2: countries()?.length ? countries() : undefined,
        prize_description: (additionalPrizes() && additionalPrize()) || undefined
      };

      if(stars()) {
        return {
          ...starsOption(),
          ...common,
          _: 'inputStorePaymentStarsGiveaway',
          users: starsWinner().users
        };
      }

      return {
        ...option(),
        ...common,
        _: 'inputStorePaymentPremiumGiveaway'
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

    const continueWithPrepaid = async(purpose: InputStorePaymentPurpose) => {
      await confirmationPopup({
        titleLangKey: 'BoostingStartGiveawayConfirmTitle',
        descriptionLangKey: 'BoostingStartGiveawayConfirmText',
        button: {langKey: 'Start'}
      });

      return this.managers.appPaymentsManager.launchPrepaidGiveaway(
        this.peerId,
        this.prepaidGiveaway.id,
        purpose
      );
    };

    const continueWithCreating = async(purpose: InputStorePaymentPurpose) => {
      const inputInvoice: InputInvoice = purpose._ === 'inputStorePaymentStarsGiveaway' ? {
        _: 'inputInvoiceStars',
        purpose
      } : {
        _: 'inputInvoicePremiumGiftCode',
        purpose,
        option: option()
      };

      const popup = await PopupPayment.create({inputInvoice});
      await new Promise<void>((resolve, reject) => {
        popup.addEventListener('finish', (result) => {
          if(result === 'cancelled' || result === 'failed') {
            reject();
          } else {
            resolve();
          }
        });
      });
    };

    attachClickEvent(this.btnConfirm, async() => {
      const toggle = toggleDisability(this.btnConfirm, true);

      try {
        const purpose = await (specific() ? createSpecificStoreInput : createGiveawayStoreInput)();
        let promise: Promise<any>;
        if(isPrepaid()) {
          promise = continueWithPrepaid(purpose);
        } else {
          promise = continueWithCreating(purpose);
        }

        await promise;

        this.onCreated?.();
        this.hide();
      } catch(err) {
        console.error('boosts via gifts error', err);
        toggle();
      }
    }, {listenerSetter: this.listenerSetter});

    return ret;
  }

  private async construct() {
    const [giftCodeOptions, appConfig, starsOptions] = await Promise.all([
      this.managers.appPaymentsManager.getPremiumGiftCodeOptions(this.peerId),
      this.managers.apiManager.getAppConfig(),
      this.managers.appPaymentsManager.getStarsGiveawayOptions()
    ]);
    this.premiumGiftCodeOptions = giftCodeOptions;
    this.appConfig = appConfig;
    this.starsOptions = starsOptions;
    this.subscribersLimit = this.channelsLimit = appConfig.giveaway_add_peers_max ?? 10;
    this.countriesLimit = appConfig.giveaway_countries_max ?? 10;
    this.appendSolid(() => this._construct());
    this.show();
  }
}
