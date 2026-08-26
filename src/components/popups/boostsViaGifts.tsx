import PopupElement from '.';
import I18n, {FormatterArguments, LangPackKey, _i18n, i18n, join} from '@lib/langPack';
import CheckboxField from '@components/checkboxField';
import Section from '@components/section';
import RangeStepsSelector from '@components/rangeStepsSelector';
import {Accessor, For, JSX, createEffect, createMemo, createSignal, untrack} from 'solid-js';
import tsNow from '@helpers/tsNow';
import showDatePickerPopup from '@components/popups/datePicker';
import {formatFullSentTime, formatMonthsDuration} from '@helpers/date';
import renderImageFromUrl from '@helpers/dom/renderImageFromUrl';
import Icon from '@components/icon';
import {AvatarNew} from '@components/avatarNew';
import Button from '@components/button';
import PeerTitle from '@components/peerTitle';
import {InputInvoice, InputStorePaymentPurpose, PremiumGiftCodeOption, PrepaidGiveaway, StarsGiveawayOption, StarsGiveawayWinnersOption} from '@layer';
import cancelEvent from '@helpers/dom/cancelEvent';
import PopupPremium from '@components/popups/premium';
import PremiumOptionsForm from '@components/premium/premiumOptionsForm';
import showPickUserPopup from '@components/popups/pickUser';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import toggleDisability from '@helpers/dom/toggleDisability';
import getChatMembersString from '@components/wrappers/getChatMembersString';
import {toastNew} from '@components/toast';
import apiManagerProxy from '@lib/apiManagerProxy';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import confirmationPopup from '@components/confirmationPopup';
import {randomLong} from '@helpers/random';
import PopupPayment from '@components/popups/payment';
import shake from '@helpers/dom/shake';
import anchorCallback from '@helpers/dom/anchorCallback';
import {IconTsx} from '@components/iconTsx';
import {CPrepaidGiveaway} from '@components/sidebarRight/tabs/boosts';
import classNames from '@helpers/string/classNames';
import RowTsx from '@components/rowTsx';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import {StarsStackedStars} from '@components/popups/stars';
import numberThousandSplitter, {numberThousandSplitterForStars} from '@helpers/number/numberThousandSplitter';
import paymentsWrapCurrencyAmount from '@helpers/paymentsWrapCurrencyAmount';
import flatten from '@helpers/array/flatten';
import isGiveawayUntilDateValid from '@helpers/giveaway/isGiveawayUntilDateValid';
import showPickCountryPopup from '@components/popups/pickCountry';
import createBoostsViaGiftsState from '@components/popups/boostsViaGiftsState';

export const BoostsBadge = (props: {boosts: number}) => {
  return (
    <span class="popup-boosts-badge">
      <IconTsx icon="boost_filled" class="popup-boosts-badge-icon" />
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
  const sss = (<span ref={ssss} class={classNames('popup-boosts-button-badge', !props.boosts() && 'hide')}><IconTsx icon="boost_filled" class="popup-boosts-button-badge-icon" />{props.boosts()}</span>);
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
    const giveawayState = createBoostsViaGiftsState(
      this.prepaidGiveaway?._ === 'prepaidStarsGiveaway' ? 'stars' : 'premium'
    );
    const {stars, specific} = giveawayState;
    const [starsOption, setStarsOption] = createSignal<StarsGiveawayOption>(this.starsOptions?.[0]);
    const [starsWinner, setStarsWinner] = createSignal<StarsGiveawayWinnersOption>(starsOption() && starsOption().winners[0]);
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

    let expirationRow: HTMLElement;
    const onExpirationClick = () => {
      const now = tsNow(true);
      const minTimeDate = new Date(now * 1000);
      const minDate = new Date(minTimeDate);
      minDate.setHours(0, 0, 0, 0);
      const maxDate = new Date((now + (this.appConfig.giveaway_period_max ?? 604800)) * 1000);
      const initDate = new Date(expiration() * 1000);
      showDatePickerPopup({
        initDate,
        withTime: true,
        minDate,
        minTimeDate,
        onPick: (timestamp) => {
          setExpiration(timestamp);
        },
        btnConfirmLangKey: 'Save',
        maxDate
      });
    };

    const selectSpecific = () => {
      setSubscriptionsCount(specificPeerIds().length);
      giveawayState.selectSpecific();
      this.scrollable.updateThumb();
    };

    const createNextIcon = () => Icon('next', 'popup-boosts-specific-next');
    let img: HTMLImageElement;

    let prepaidRowContainer: JSX.Element, giveawayTypeRows: JSX.Element;
    if(this.prepaidGiveaway) {
      prepaidRowContainer = (
        <CPrepaidGiveaway
          giveaway={this.prepaidGiveaway}
          appConfig={this.appConfig}
        />
      );
    } else {
      const premiumCheckboxField = new CheckboxField({
        ...radioOptions,
        checked: !stars(),
        name: 'giveaway-type'
      });
      const createAvatar = AvatarNew({size: 42});
      createAvatar.set({icon: 'gift_premium_filled', color: 'premium'});
      const starsCheckboxField = new CheckboxField({
        ...radioOptions,
        checked: stars(),
        name: 'giveaway-type'
      });
      const specificAvatar = AvatarNew({size: 42});
      specificAvatar.set({icon: 'star', color: 'stars'});

      this.listenerSetter.add(premiumCheckboxField.input)('change', () => {
        giveawayState.selectPremium();
      });
      this.listenerSetter.add(premiumCheckboxField.input)('click', (e) => {
        if(stars()) {
          return;
        }

        cancelEvent(e);
        const popup = showPickUserPopup({
          peerType: ['channelParticipants'],
          peerId: this.peerId,
          onSelect: (arr) => {
            setSpecificPeerIds(arr.map(({peerId}) => peerId));
            selectSpecific();
          },
          multiSelect: true,
          placeholder: 'SearchPlaceholder',
          exceptSelf: true,
          titleLangKey: 'Giveaway.Type.Specific.Modal.SelectUsers',
          initial: specificPeerIds()
        });

        popup.selector.setLimit(this.subscribersLimit, () => {
          toastNew({langPackKey: 'Giveaway.MaximumSubscribers', langPackArguments: [this.subscribersLimit]});
        });
      });
      this.listenerSetter.add(starsCheckboxField.input)('change', () => {
        giveawayState.selectStars();
      });

      const getPremiumSubtitle = () => {
        const peerIds = specificPeerIds();
        const showTitles = !(!peerIds.length || peerIds.length > 2);
        if(!showTitles) {
          return (
            <>
              {i18n(peerIds.length > 2 ? 'Recipient' : 'BoostsViaGifts.CreateSubtitle', [peerIds.length])}
              {createNextIcon()}
            </>
          );
        }

        const titles = peerIds.map((peerId) => new PeerTitle({peerId}).element);
        return join(titles, false);
      };

      giveawayTypeRows = (
        <form>
          <RowTsx class="popup-boosts-type popup-boosts-specific">
            <RowTsx.Title>{i18n('BoostingPremium')}</RowTsx.Title>
            <RowTsx.Subtitle class={specificPeerIds().length === 1 || specificPeerIds().length === 2 ? 'primary' : 'primary is-flex'}>
              {getPremiumSubtitle()}
            </RowTsx.Subtitle>
            <RowTsx.CheckboxField>{premiumCheckboxField.label}</RowTsx.CheckboxField>
            <RowTsx.Media size="abitbigger">{createAvatar.node}</RowTsx.Media>
          </RowTsx>
          <RowTsx class="popup-boosts-type">
            <RowTsx.Title>{i18n('BoostingStars')}</RowTsx.Title>
            <RowTsx.Subtitle>{i18n('BoostsViaGifts.CreateSubtitle')}</RowTsx.Subtitle>
            <RowTsx.CheckboxField>{starsCheckboxField.label}</RowTsx.CheckboxField>
            <RowTsx.Media size="abitbigger">{specificAvatar.node}</RowTsx.Media>
          </RowTsx>
        </form>
      );
    }

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
      const durationForm = (
        <PremiumOptionsForm
          periodOptions={options}
          onOption={(option) => {
            lastOptionIndex = options.indexOf(option);
            setOption(option);
          }}
          checked={lastOptionIndex}
          users={_count}
          discountInTitle
        />
      );

      setDurationForm(() => durationForm);
    });

    const addChannelButton = Button('btn btn-primary btn-transparent primary', {
      icon: 'add',
      text: 'AddChannel'
    });

    attachClickEvent(addChannelButton, async() => {
      const toggle = toggleDisability(addChannelButton, true);
      const popup = showPickUserPopup({
        filterPeerTypeBy: ['isBroadcast'],
        onSelect: (arr) => {
          setPeerIds([this.peerId, ...arr.map(({peerId}) => peerId)]);
        },
        multiSelect: true,
        placeholder: 'SearchPlaceholder',
        titleLangKey: 'AddChannels',
        initial: peerIds().filter((peerId) => peerId !== this.peerId),
        excludePeerIds: new Set([this.peerId]),
        onCloseAfterTimeout: () => toggle()
      });

      popup.selector.setLimit(this.channelsLimit, () => {
        toastNew({langPackKey: 'BoostingSelectUpToWarningChannelsPlural', langPackArguments: [this.channelsLimit]});
      });

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
            popup.selector.toggleElementCheckboxByKey(peerId, true);
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

    const onSubscriberTypeClick = (onlyNew: boolean) => {
      const wasSelected = onlyNewSubscribers() === onlyNew;
      setOnlyNewSubscribers(onlyNew);
      if(!wasSelected) {
        return;
      }

      showPickCountryPopup({
        excludeVirtual: true,
        initial: countries(),
        limit: this.countriesLimit,
        limitReachedLangKey: 'BoostingSelectUpToWarningCountriesPlural',
        onSelect: setCountries,
        titleLangKey: 'BoostingSelectCountry'
      });
    };

    const allSubscribersCheckboxField = new CheckboxField({
      ...radioOptions,
      checked: true,
      name: 'giveaway-users'
    });
    const newSubscribersCheckboxField = new CheckboxField({
      ...radioOptions,
      name: 'giveaway-users'
    });
    this.listenerSetter.add(allSubscribersCheckboxField.input)('click', () => {
      onSubscriberTypeClick(false);
    });
    this.listenerSetter.add(newSubscribersCheckboxField.input)('click', () => {
      onSubscriberTypeClick(true);
    });

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
                  this.listenerSetter.add(checkboxField.input)('change', () => {
                    setStarsOption(option);
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
                      class="popup-boosts-stars-row"
                      noRipple
                    >
                      <RowTsx.Title>
                        <span class="popup-boosts-stars-amount text-bold">
                          <StarsStackedStars stars={+option.stars} size={18} />
                          {' '}
                          {i18n('Stars', [numberThousandSplitterForStars(+option.stars)])}
                        </span>
                      </RowTsx.Title>
                      <RowTsx.Subtitle>{subtitle()}</RowTsx.Subtitle>
                      <RowTsx.RightContent>{paymentsWrapCurrencyAmount(option.amount, option.currency)}</RowTsx.RightContent>
                      <RowTsx.CheckboxField>{checkboxField.label}</RowTsx.CheckboxField>
                    </RowTsx>
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
            const contextMenu = peerId !== this.peerId ? {
              buttons: [{
                icon: 'delete' as Icon,
                danger: true,
                text: 'Remove' as LangPackKey,
                onClick: () => {
                  setPeerIds((peerIds) => peerIds.filter((_peerId) => _peerId !== peerId));
                }
              }]
            } : undefined;
            return (
              <RowTsx class="popup-boosts-channel" contextMenu={contextMenu}>
                <RowTsx.Title>{peerTitle.element}</RowTsx.Title>
                <RowTsx.Subtitle>{subtitleElement}</RowTsx.Subtitle>
                <RowTsx.Media size="abitbigger">{AvatarNew({peerId, size: 42}).node}</RowTsx.Media>
              </RowTsx>
            );
          }}</For>
          {/* (peerIds().length - 1) < this.channelsLimit &&  */addChannelButton}
        </Section>
        <Section
          name="BoostsViaGifts.Users"
          caption="BoostsViaGifts.UsersSubtitle"
          captionOld={true}
        >
          <form>
            <RowTsx>
              <RowTsx.Title>{i18n('AllSubscribers')}</RowTsx.Title>
              <RowTsx.Subtitle>{getCountriesSubtitle()}</RowTsx.Subtitle>
              <RowTsx.CheckboxField>{allSubscribersCheckboxField.label}</RowTsx.CheckboxField>
            </RowTsx>
            <RowTsx>
              <RowTsx.Title>{i18n('OnlyNewSubscribers')}</RowTsx.Title>
              <RowTsx.Subtitle>{getCountriesSubtitle()}</RowTsx.Subtitle>
              <RowTsx.CheckboxField>{newSubscribersCheckboxField.label}</RowTsx.CheckboxField>
            </RowTsx>
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
          <RowTsx>
            <RowTsx.CheckboxFieldToggle>
              <CheckboxFieldTsx signal={[additionalPrizes, setAdditionalPrizes]} toggle />
            </RowTsx.CheckboxFieldToggle>
            <RowTsx.Title>{i18n('BoostsViaGifts.AdditionalPrizes')}</RowTsx.Title>
          </RowTsx>
          {additionalPrizes() && additionalPrizeDiv}
        </Section>
        <Section
          caption="BoostsViaGifts.ShowWinnersSubtitle"
          captionOld={true}
        >
          <RowTsx>
            <RowTsx.CheckboxFieldToggle>
              <CheckboxFieldTsx signal={[showPrizes, setShowPrizes]} toggle />
            </RowTsx.CheckboxFieldToggle>
            <RowTsx.Title>{i18n('BoostsViaGifts.ShowWinners')}</RowTsx.Title>
          </RowTsx>
        </Section>
        <Section
          name="BoostsViaGifts.End"
          caption={stars() ? 'BoostsViaGifts.Stars.EndSubtitle' : 'BoostsViaGifts.EndSubtitle'}
          captionArgs={[count()]}
          captionOld={true}
        >
          <RowTsx ref={expirationRow} clickable={onExpirationClick}>
            <RowTsx.Title
              titleRight={formatFullSentTime(expiration())}
              titleRightClass="primary"
              titleRightSecondary
            >
              {i18n('Ends')}
            </RowTsx.Title>
          </RowTsx>
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
          {!isPrepaid() && giveawayTypeRows}
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

      if(!specific()) {
        const now = tsNow(true);
        const periodMax = this.appConfig.giveaway_period_max ?? 604800;
        if(!isGiveawayUntilDateValid(expiration(), now, periodMax)) {
          toggle();
          toastNew({langPackKey: 'BoostsViaGifts.InvalidEndDate'});
          shake(expirationRow);
          return;
        }
      }

      try {
        const purpose = await giveawayState.getPurposeFactory({
          giveaway: createGiveawayStoreInput,
          specific: createSpecificStoreInput
        })();
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
