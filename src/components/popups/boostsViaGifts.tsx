/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {render} from 'solid-js/web';
import PopupElement from '.';
import {i18n} from '../../lib/langPack';
import Row from '../row';
import CheckboxField from '../checkboxField';
import Section from '../section';
import RangeStepsSelector from '../rangeStepsSelector';
import {For, createEffect, createSignal} from 'solid-js';
import tsNow from '../../helpers/tsNow';
import PopupSchedule from './schedule';
import {formatFullSentTime} from '../../helpers/date';
import renderImageFromUrl from '../../helpers/dom/renderImageFromUrl';
import Icon from '../icon';
import {AvatarNew} from '../avatarNew';
import {IconTsx} from '../stories/viewer';
import Button from '../button';
import wrapPeerTitle from '../wrappers/peerTitle';
import PeerTitle from '../peerTitle';
import {PremiumGiftCodeOption} from '../../layer';

export default class PopupBoostsViaGifts extends PopupElement {
  private premiumGiftCodeOptions: PremiumGiftCodeOption[];

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
    const [expiration, setExpiration] = createSignal(tsNow(true) + 5 * 86400);
    const [peerIds, setPeerIds] = createSignal<PeerId[]>([this.peerId]);

    const range: RangeStepsSelector<number> = new RangeStepsSelector({
      generateStep: (value) => ['' + value, value],
      onValue: (value) => {
        setCount(value);
      },
      middleware: this.middlewareHelper.get(),
      noFirstLast: true
    });

    const stepValues = [1, 3, 5, 7, 10, 25, 50, 100];
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
        const initDate = new Date(expiration() * 1000);
        const popup = new PopupSchedule({
          initDate,
          onPick: (timestamp) => {
            setExpiration(timestamp);
          },
          btnConfirmLangKey: 'Save'
        });
        popup.show();
      },
      listenerSetter: this.listenerSetter
    });

    expirationRow.titleRight.classList.add('primary');

    createEffect(() => {
      expirationRow.titleRight.replaceChildren(formatFullSentTime(expiration()));
    });

    let img: HTMLImageElement;

    const createRow = new Row({
      titleLangKey: 'BoostsViaGifts.Create',
      subtitleLangKey: 'BoostsViaGifts.CreateSubtitle',
      clickable: true,
      checkboxField: new CheckboxField({
        ...radioOptions,
        checked: true,
        name: 'giveaway-type'
      })
    });

    const createMedia = createRow.createMedia('abitbigger');
    const createAvatar = AvatarNew({size: 42});
    createAvatar.set({icon: 'gift_premium'});
    createMedia.append(createAvatar.node);

    const specificRow = new Row({
      titleLangKey: 'BoostsViaGifts.Specific',
      subtitle: i18n('BoostsViaGifts.SpecificSubtitle'),
      clickable: true,
      checkboxField: new CheckboxField({
        ...radioOptions,
        name: 'giveaway-type'
      })
    });

    specificRow.subtitle.classList.add('primary');
    specificRow.subtitle.append(Icon('next', 'popup-boosts-specific-next'));

    const specificMedia = specificRow.createMedia('abitbigger');
    const specificAvatar = AvatarNew({size: 42});
    specificAvatar.set({icon: 'newgroup_filled', color: 'pink'});
    specificMedia.append(specificAvatar.node);

    createRow.container.classList.add('popup-boosts-type');
    specificRow.container.classList.add('popup-boosts-type', 'popup-boosts-specific');

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
        <Section
          name="BoostsViaGifts.Quantity"
          nameRight={<span class="popup-boosts-badge"><IconTsx icon="boost" class="popup-boosts-badge-icon" />{count()}</span>}
          caption="BoostsViaGifts.QuantitySubtitle"
          captionOld={true}
        >
          {range.container}
        </Section>
        <Section name="BoostsViaGifts.Channels">
          <For each={peerIds()}>{(peerId) => {
            const peerTitle = new PeerTitle();
            peerTitle.update({peerId});
            peerTitle.element.classList.add('text-bold');
            let subtitleElement: HTMLSpanElement;
            const subtitle = (<span ref={subtitleElement}>{i18n('BoostsViaGifts.ChannelSubscription', [count() / peerIds().length])}</span>);
            const row = new Row({
              title: peerTitle.element,
              subtitle: subtitleElement,
              clickable: true
            });
            row.container.classList.add('popup-boosts-channel');
            row.createMedia('abitbigger').append(AvatarNew({peerId, size: 42}).node);
            return row.container;
          }}</For>
          {Button('btn btn-primary btn-transparent primary', {
            icon: 'add',
            text: 'AddChannel'
          })}
        </Section>
        <Section name="BoostsViaGifts.Users" caption="BoostsViaGifts.UsersSubtitle" captionOld={true}>
          {new Row({
            titleLangKey: 'AllSubscribers',
            clickable: true,
            checkboxField: new CheckboxField({
              ...radioOptions,
              checked: true,
              name: 'giveaway-users'
            })
          }).container}
          {new Row({
            titleLangKey: 'OnlyNewSubscribers',
            clickable: true,
            checkboxField: new CheckboxField({
              ...radioOptions,
              name: 'giveaway-users'
            })
          }).container}
        </Section>
        <Section name="BoostsViaGifts.End" caption="BoostsViaGifts.EndSubtitle" captionArgs={[count()]} captionOld={true}>
          {expirationRow.container}
        </Section>
        <Section name="BoostsViaGifts.Duration" caption="BoostsViaGifts.DurationSubtitle" captionArgs={[document.createElement('a')]} captionOld={true}>
        </Section>
      </>
    );

    renderImageFromUrl(img, `assets/img/premiumboostsstar${window.devicePixelRatio > 1 ? '@2x' : ''}.png`);

    let s: HTMLSpanElement, ssss: HTMLSpanElement;
    const ss = (<span ref={s} class="popup-boosts-button-text">{i18n('BoostsViaGifts.Start')}</span>);
    const sss = (<span ref={ssss} class="popup-boosts-button-badge"><IconTsx icon="boost" class="popup-boosts-button-badge-icon" />{count()}</span>);
    this.btnConfirm.classList.add('popup-boosts-button');
    this.btnConfirm.append(s, ssss);
    this.footer.append(this.btnConfirm);
    this.body.after(this.footer);
    this.footer.classList.add('abitlarger');

    console.log(this.premiumGiftCodeOptions);

    return ret;
  }

  private async construct() {
    this.premiumGiftCodeOptions = await this.managers.appPaymentsManager.getPremiumGiftCodeOptions(this.peerId);
    const div = document.createElement('div');
    this.scrollable.append(div);
    const dispose = render(() => this._construct(), div);
    this.addEventListener('closeAfterTimeout', dispose);
    this.show();
  }
}
