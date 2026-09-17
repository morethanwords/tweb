import PopupElement, {createPopup} from '@components/popups/indexTsx';
import {ScrollableContextValue} from '@components/scrollable2';
import I18n, {FormatterArguments, LangPackKey, _i18n, i18n, join} from '@lib/langPack';
import CheckboxField from '@components/checkboxField';
import Section from '@components/section';
import RangeStepsSelector from '@components/rangeStepsSelector';
import {Accessor, For, JSX, createEffect, createMemo, createSignal, onCleanup, onMount, untrack} from 'solid-js';
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
import showPremiumPopup from '@components/popups/premium';
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
import {createPaymentPopup} from '@components/popups/payment';
import shake from '@helpers/dom/shake';
import anchorCallback from '@helpers/dom/anchorCallback';
import {IconTsx} from '@components/iconTsx';
import {ROW_SELECTION_CHECKBOX_CLASS, ROW_SELECTION_MEDIA_CLASS, ROW_WITH_CHECKBOX_AND_MEDIA_CLASS} from '@components/rowFieldClasses';
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
  langKey: Accessor<LangPackKey>,
  langArgs?: Accessor<FormatterArguments>,
  boosts: Accessor<number>,
  disabled?: boolean,
  callback: Parameters<typeof PopupElement['FooterButton']>[0]['callback']
}) => {
  return (
    <PopupElement.FooterButton
      class="popup-boosts-button"
      disabled={props.disabled}
      callback={props.callback}
    >
      <span class="popup-boosts-button-text">{i18n(props.langKey(), props.langArgs?.())}</span>
      <span class={classNames('popup-boosts-button-badge', !props.boosts() && 'hide')}><IconTsx icon="boost_filled" class="popup-boosts-button-badge-icon" />{props.boosts()}</span>
    </PopupElement.FooterButton>
  );
};

import {getMiddleware} from '@helpers/middleware';
import rootScope from '@lib/rootScope';
import ListenerSetter from '@helpers/listenerSetter';
import MediaHeader from '@components/mediaHeader';

export default async function showBoostsViaGiftsPopup(
  peerId: PeerId,
  prepaidGiveaway?: PrepaidGiveaway,
  onCreated?: () => void
) {
  const middlewareHelper = getMiddleware();
  const middleware = middlewareHelper.get();
  const listenerSetter = new ListenerSetter();
  const [show, setShow] = createSignal(false);
  const [scrollableRef, setScrollableRef] = createSignal<ScrollableContextValue>();

  const [premiumGiftCodeOptions, appConfig, starsOptions]: [PremiumGiftCodeOption[], MTAppConfig, StarsGiveawayOption[]] = await Promise.all([
    rootScope.managers.appPaymentsManager.getPremiumGiftCodeOptions(peerId),
    rootScope.managers.apiManager.getAppConfig(),
    rootScope.managers.appPaymentsManager.getStarsGiveawayOptions()
  ]);
  const subscribersLimit = appConfig.giveaway_add_peers_max ?? 10;
  const channelsLimit = subscribersLimit;
  const countriesLimit = appConfig.giveaway_countries_max ?? 10;

  const Content = () => {
    const [subscriptionsCount, setSubscriptionsCount] = createSignal(10);
    const [expiration, setExpiration] = createSignal(tsNow(true) + 3 * 86400);
    const [peerIds, setPeerIds] = createSignal<PeerId[]>([peerId]);
    const [specificPeerIds, setSpecificPeerIds] = createSignal<PeerId[]>([]);
    const giveawayState = createBoostsViaGiftsState(
      prepaidGiveaway?._ === 'prepaidStarsGiveaway' ? 'stars' : 'premium'
    );
    const {stars, specific} = giveawayState;
    const [starsOption, setStarsOption] = createSignal<StarsGiveawayOption>(starsOptions?.[0]);
    const [starsWinner, setStarsWinner] = createSignal<StarsGiveawayWinnersOption>(starsOption() && starsOption().winners[0]);
    const [durationForm, setDurationForm] = createSignal<JSX.Element>();
    const [option, setOption] = createSignal<PremiumGiftCodeOption>();
    const [countries, setCountries] = createSignal<string[]>();
    const [onlyNewSubscribers, setOnlyNewSubscribers] = createSignal(false);
    const [additionalPrizes, setAdditionalPrizes] = createSignal(false);
    const [additionalPrize, setAdditionalPrize] = createSignal('');
    const [showPrizes, setShowPrizes] = createSignal(true);
    const isPrepaid = createMemo(() => !!prepaidGiveaway);
    const count = createMemo(() => stars() ? starsWinner().users : subscriptionsCount());
    const boosts = createMemo(() => stars() ? starsOption().yearly_boosts : count() * (appConfig.giveaway_boosts_per_premium ?? 1));

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
        middleware: middleware,
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

        // const stepValues = filterUnique(premiumGiftCodeOptions.map((o) => o.users));
        const stepValues = [1, 3, 5, 7, 10, 25, 50, 100].filter((v) => premiumGiftCodeOptions.some((o) => o.users === v));
        const steps = range.generateSteps(stepValues);
        const focusValue = untrack(subscriptionsCount);
        range.setSteps(steps, Math.max(0, stepValues.indexOf(focusValue)));
      });
    } else {
      setSubscriptionsCount(prepaidGiveaway.quantity);
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
      const maxDate = new Date((now + (appConfig.giveaway_period_max ?? 604800)) * 1000);
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
      scrollableRef()?.onSizeChange();
    };

    const createNextIcon = () => Icon('next', 'popup-boosts-specific-next');
    let img: HTMLImageElement;

    let prepaidRowContainer: JSX.Element, giveawayTypeRows: JSX.Element;
    if(prepaidGiveaway) {
      prepaidRowContainer = (
        <CPrepaidGiveaway
          giveaway={prepaidGiveaway}
          appConfig={appConfig}
        />
      );
    } else {
      // the selection control leads the row and the avatar follows it, like in the peer selector
      const createTypeCheckbox = (checked: boolean) => {
        const field = new CheckboxField({...radioOptions, checked, name: 'giveaway-type'});
        field.label.classList.add(ROW_SELECTION_CHECKBOX_CLASS);
        return field;
      };

      const premiumCheckboxField = createTypeCheckbox(!stars());
      const createAvatar = AvatarNew({size: 42});
      createAvatar.set({icon: 'gift_premium_filled', color: 'premium'});
      const starsCheckboxField = createTypeCheckbox(stars());
      const specificAvatar = AvatarNew({size: 42});
      specificAvatar.set({icon: 'star', color: 'stars'});

      listenerSetter.add(premiumCheckboxField.input)('change', () => {
        giveawayState.selectPremium();
      });
      listenerSetter.add(premiumCheckboxField.input)('click', (e) => {
        if(stars()) {
          return;
        }

        cancelEvent(e);
        const popup = showPickUserPopup({
          peerType: ['channelParticipants'],
          peerId: peerId,
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

        popup.selector.setLimit(subscribersLimit, () => {
          toastNew({langPackKey: 'Giveaway.MaximumSubscribers', langPackArguments: [subscribersLimit]});
        });
      });
      listenerSetter.add(starsCheckboxField.input)('change', () => {
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
          <RowTsx class={`popup-boosts-type popup-boosts-specific ${ROW_WITH_CHECKBOX_AND_MEDIA_CLASS}`}>
            <RowTsx.Title>{i18n('BoostingPremium')}</RowTsx.Title>
            <RowTsx.Subtitle class={specificPeerIds().length === 1 || specificPeerIds().length === 2 ? 'primary' : 'primary is-flex'}>
              {getPremiumSubtitle()}
            </RowTsx.Subtitle>
            <RowTsx.CheckboxField>{premiumCheckboxField.label}</RowTsx.CheckboxField>
            <RowTsx.Media size="abitbigger" class={ROW_SELECTION_MEDIA_CLASS}>{createAvatar.node}</RowTsx.Media>
          </RowTsx>
          <RowTsx class={`popup-boosts-type ${ROW_WITH_CHECKBOX_AND_MEDIA_CLASS}`}>
            <RowTsx.Title>{i18n('BoostingStars')}</RowTsx.Title>
            <RowTsx.Subtitle>{i18n('BoostsViaGifts.CreateSubtitle')}</RowTsx.Subtitle>
            <RowTsx.CheckboxField>{starsCheckboxField.label}</RowTsx.CheckboxField>
            <RowTsx.Media size="abitbigger" class={ROW_SELECTION_MEDIA_CLASS}>{specificAvatar.node}</RowTsx.Media>
          </RowTsx>
        </form>
      );
    }

    const premiumPromoAnchor = anchorCallback(() => {
      showPremiumPopup();
    });

    let lastOptionIndex: number;
    createEffect(() => {
      const _count = subscriptionsCount();
      const periods = new Map<number, PremiumGiftCodeOption>();
      premiumGiftCodeOptions.forEach((option, _, arr) => {
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
          setPeerIds([peerId, ...arr.map(({peerId}) => peerId)]);
        },
        multiSelect: true,
        placeholder: 'SearchPlaceholder',
        titleLangKey: 'AddChannels',
        initial: peerIds().filter((peerId) => peerId !== peerId),
        excludePeerIds: new Set([peerId]),
        onCloseAfterTimeout: () => toggle()
      });

      popup.selector.setLimit(channelsLimit, () => {
        toastNew({langPackKey: 'BoostingSelectUpToWarningChannelsPlural', langPackArguments: [channelsLimit]});
      });

      const _add = popup.selector.add.bind(popup.selector);
      let ignorePrivatePeerId: PeerId;
      popup.selector.add = (options) => {
        const peerId = options.key.toPeerId();
        const chat = apiManagerProxy.getChat(peerId.toChatId());
        if(
          !getPeerActiveUsernames(chat)[0] &&
          ignorePrivatePeerId !== peerId &&
          popup.selector.getSelected().length < channelsLimit
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
    }, {listenerSetter: listenerSetter});

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
        limit: countriesLimit,
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
    listenerSetter.add(allSubscribersCheckboxField.input)('click', () => {
      onSubscriberTypeClick(false);
    });
    listenerSetter.add(newSubscribersCheckboxField.input)('click', () => {
      onSubscriberTypeClick(true);
    });

    const notSpecific = (
      <>
        {!isPrepaid() && stars() && (
          <Section
            name="BoostingStarsOptions"
            caption="BoostingStarsOptionsInfo"
          >
            <form>
              <For each={starsOptions}>
                {(option) => {
                  const checkboxField = new CheckboxField({
                    ...radioOptions,
                    checked: starsOption() === option,
                    name: 'giveaway-stars-quantity'
                  });
                  listenerSetter.add(checkboxField.input)('change', () => {
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
            const contextMenu = peerId !== peerId ? {
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
          {/* (peerIds().length - 1) < channelsLimit &&  */addChannelButton}
        </Section>
        <Section
          name="BoostsViaGifts.Users"
          caption="BoostsViaGifts.UsersSubtitle"
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
        <MediaHeader marginTop marginBottom>
          <div class="popup-boosts-star-container"><img class="popup-boosts-star" ref={img} /></div>
          <MediaHeader.Title size={20}>{i18n('BoostsViaGifts.Title')}</MediaHeader.Title>
          <MediaHeader.Subtitle>{i18n(isPrepaid() && prepaidGiveaway._ === 'prepaidGiveaway' ? 'BoostingGetMoreBoosts' : 'BoostingGetMoreBoosts2')}</MediaHeader.Subtitle>
        </MediaHeader>
        <Section>
          {isPrepaid() && prepaidRowContainer}
          {!isPrepaid() && giveawayTypeRows}
        </Section>
        {!specific() && notSpecific}
        {!isPrepaid() && !stars() && (
          <Section
            name="BoostsViaGifts.Duration"
            caption="BoostsViaGifts.DurationSubtitle"
            captionArgs={[premiumPromoAnchor]}
          >
            {durationForm()}
          </Section>
        )}
        {!specific() && notSpecific2}
      </>
    );

    // after mount: `decode()` on an image still being moved into the tree rejects as "broken"
    onMount(() => {
      renderImageFromUrl(img, `assets/img/premiumboostsstar${window.devicePixelRatio > 1 ? '@2x' : ''}.png`);
    });

    const createGiveawayStoreInput = async(): Promise<InputStorePaymentPurpose> => {
      const peers = await Promise.all(peerIds().map((peerId) => rootScope.managers.appPeersManager.getInputPeerById(peerId)));

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
      const users = await Promise.all(specificPeerIds().map((peerId) => rootScope.managers.appUsersManager.getUserInput(peerId.toUserId())));
      return {
        _: 'inputStorePaymentPremiumGiftCode',
        amount,
        currency,
        boost_peer: await rootScope.managers.appPeersManager.getInputPeerById(peerId),
        users
      };
    };

    const continueWithPrepaid = async(purpose: InputStorePaymentPurpose) => {
      await confirmationPopup({
        titleLangKey: 'BoostingStartGiveawayConfirmTitle',
        descriptionLangKey: 'BoostingStartGiveawayConfirmText',
        button: {langKey: 'Start'}
      });

      return rootScope.managers.appPaymentsManager.launchPrepaidGiveaway(
        peerId,
        prepaidGiveaway.id,
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

      const popup = await createPaymentPopup({inputInvoice});
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

    // the footer's button reads this component's state, so the whole shell is rendered from here
    return (
      <>
        <PopupElement.Header floating>
          <PopupElement.CloseButton />
          <PopupElement.Title title="BoostsViaGifts.Title" />
        </PopupElement.Header>
        <PopupElement.Scrollable contextRef={setScrollableRef}>
          <PopupElement.Body>
            {ret}
          </PopupElement.Body>
        </PopupElement.Scrollable>
        <PopupElement.Footer>
          <BoostsConfirmButton
            langKey={() => 'BoostsViaGifts.Start'}
            boosts={boosts}
            callback={async() => {
              if(!specific()) {
                const now = tsNow(true);
                const periodMax = appConfig.giveaway_period_max ?? 604800;
                if(!isGiveawayUntilDateValid(expiration(), now, periodMax)) {
                  toastNew({langPackKey: 'BoostsViaGifts.InvalidEndDate'});
                  shake(expirationRow);
                  return false;
                }
              }

              try {
                const purpose = await giveawayState.getPurposeFactory({
                  giveaway: createGiveawayStoreInput,
                  specific: createSpecificStoreInput
                })();
                const promise = isPrepaid() ?
                  continueWithPrepaid(purpose) :
                  continueWithCreating(purpose);

                await promise;

                onCreated?.();
                setShow(false);
              } catch(err) {
                console.error('boosts via gifts error', err);
              }

              // the popup closes through `show`, never on the button resolving
              return false;
            }}
          />
        </PopupElement.Footer>
      </>
    );
  };

  createPopup(() => {
    onCleanup(() => {
      listenerSetter.removeAll();
      middlewareHelper.destroy();
    });

    return (
      <PopupElement class="popup-boosts" closable show={show()}>
        <Content />
      </PopupElement>
    );
  });

  setShow(true);
}
