/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Accessor, For, JSX, createEffect, createMemo, createRoot, createSignal, onCleanup, untrack} from 'solid-js';
import {formatFullSentTime} from '../../helpers/date';
import anchorCallback from '../../helpers/dom/anchorCallback';
import cancelEvent from '../../helpers/dom/cancelEvent';
import {MyBoost, PremiumMyBoosts} from '../../layer';
import appImManager from '../../lib/appManagers/appImManager';
import {i18n} from '../../lib/langPack';
import {MTAppConfig} from '../../lib/mtproto/appConfig';
import AppSelectPeers from '../appSelectPeers';
import wrapPeerTitle from '../wrappers/peerTitle';
import {BoostsConfirmButton} from './boostsViaGifts';
import PopupPeer from './peer';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId';
import toggleDisability from '../../helpers/dom/toggleDisability';
import {AvatarNew} from '../avatarNew';
import classNames from '../../helpers/string/classNames';
import filterUnique from '../../helpers/array/filterUnique';
import {resolveElements} from '@solid-primitives/refs';
import liteMode from '../../helpers/liteMode';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import {hideToast, toastNew} from '../toast';
import tsNow from '../../helpers/tsNow';
import {wrapLeftDuration} from '../wrappers/wrapDuration';
import {IconTsx} from '../iconTsx';
import {createListTransition} from '../../helpers/solid/createListTransition';

const className = 'popup-boost';

export default class PopupReassignBoost extends PopupPeer {
  private selector: AppSelectPeers;

  constructor(
    private peerId: PeerId,
    private myBoosts: PremiumMyBoosts,
    private appConfig: MTAppConfig
  ) {
    super('popup-forward popup-chatlist-invite ' + className, {
      closable: true,
      overlayClosable: true,
      body: true,
      description: true,
      footer: true,
      withConfirm: true
    });

    this.btnClose.remove();
    this.header.remove();

    createRoot((dispose) => {
      this.middlewareHelper.get().onDestroy(dispose);
      this.construct();
    });
  }

  private async construct() {
    const [selected, setSelected] = createSignal<MyBoost[]>([]);
    const [count, setCount] = createSignal(0);
    const map = new Map<string, MyBoost>();

    const Avatars = () => {
      const createAvatar = (props: {
        peerId: PeerId,
        right?: boolean
      }) => {
        const avatar = untrack(() => {
          return AvatarNew({
            peerId: props.peerId,
            size: 60
          });
        });

        avatar.node.classList.add(`${className}-avatars-avatar`);
        avatar.node.append();
        return avatar;
      };

      const avatar = createAvatar({peerId: this.peerId, right: true});
      const peerIds = createMemo<PeerId[]>((previous) => {
        const previosIndexes: Map<PeerId, number> = new Map();
        previous?.forEach((peerId, index) => {
          previosIndexes.set(peerId, index);
        });
        const current = filterUnique(selected().map((myBoost) => getPeerId(myBoost.peer)).reverse());
        current.sort((a, b) => (previosIndexes.get(a) ?? 0) - (previosIndexes.get(b) ?? 0));
        return current;
      });

      const offset = 26;

      const realList = (
        <For each={peerIds()}>{(peerId, index) => {
          const {element} = createAvatar({peerId});
          const diff = createMemo(() => peerIds().length - index() - 1);
          return (
            <div
              class={`${className}-avatars-avatar-container`}
              style={`--offset: ${diff() * -offset}px`}
            >
              {element}
              <IconTsx icon="boostcircle" class={classNames(`${className}-avatars-avatar-icon`, !diff() && 'is-visible')} />
            </div>
          );
        }}</For>
      );

      const transitionList = createListTransition(resolveElements(() => realList).toArray, {
        exitMethod: 'keep-index',
        onChange: ({added, removed, finishRemoved}) => {
          const options: KeyframeAnimationOptions = {duration: liteMode.isAvailable('animations') ? 200 : 0/* , fill: 'forwards' */, easing: 'ease-in-out'};
          const keyframes: Keyframe[] = [{transform: 'translateX(var(--offset)) scale(0)'}, {transform: 'translateX(var(--offset)) scale(1)'}];
          queueMicrotask(() => {
            for(const element of added) {
              element.animate(keyframes, options);
            }

            const reversedKeyframes = keyframes.slice().reverse();
            const promises: Promise<any>[] = [];
            for(const element of removed) {
              const animation = element.animate(reversedKeyframes, options);
              promises.push(animation.finished);
            }

            Promise.all(promises).then(() => finishRemoved(removed));
          });
        }
      }) as unknown as JSX.Element;

      return (
        <div
          class={classNames(`${className}-avatars`, peerIds().length && 'has-left')}
          style={`transform: translateX(${Math.max(0, peerIds().length - 1) * (offset / 2)}px)`}
        >
          <div class={`${className}-avatars-left`}>
            {transitionList}
          </div>
          <IconTsx icon="next" class={`${className}-avatars-arrow`} />
          <div class={`${className}-avatars-right`}>
            {avatar.element}
          </div>
        </div>
      );
    };

    this.description.before(
      Avatars() as HTMLElement,
      (<div class={`${className}-title`}>{i18n('Boost.Replace')}</div>) as HTMLElement
    );

    const leftTimes = new Map<string, Accessor<number>>();

    this.selector = new AppSelectPeers({
      middleware: this.middlewareHelper.get(),
      appendTo: this.body,
      onChange: (length) => {
        setSelected(this.selector.getSelected().map((key) => map.get(key as any as string)));
        setCount(length);
      },
      onFirstRender: () => {
        this.show();
      },
      multiSelect: true,
      noSearch: true,
      sectionNameLangPackKey: 'BoostingRemoveBoostFrom',
      avatarSize: 'abitbigger',
      managers: this.managers,
      peerType: [],
      getSubtitleForElement: (key) => {
        const myBoost = map.get(key as any as string);
        return createRoot((dispose) => {
          this.middlewareHelper.get().onDestroy(() => {
            dispose();
            clearInterval(interval);
          });

          const expirationSpan = i18n('BoostsExpiration', [1, formatFullSentTime(myBoost.expires, undefined, true)]);

          const [timestamp, setTimestamp] = createSignal(tsNow(true));
          const leftTime = createMemo<number>((prev) => {
            const left = Math.max(0, (myBoost.cooldown_until_date || 0) - timestamp());
            if(!left && prev !== undefined) {
              clearInterval(interval);
            }

            return left;
          });

          leftTimes.set(key as any as string, leftTime);

          const interval: number = leftTime() ? window.setInterval(() => {
            setTimestamp(tsNow(true));
          }, 1e3) : undefined;

          return (
            <span>
              {leftTime() ? i18n('BoostingAvailableIn', [wrapLeftDuration(leftTime())]) : expirationSpan}
            </span>
          );
        }) as HTMLElement;
      },
      getPeerIdFromKey: (key) => (key as any as string).split('_')[1].toPeerId(),
      processElementAfter: (key, dialogElement) => {
        const leftTime = leftTimes.get(key as any as string);
        createRoot((dispose) => {
          this.middlewareHelper.get().onDestroy(dispose);
          createEffect(() => {
            dialogElement.container.classList.toggle('is-unavailable', !!leftTime());
          });
        });
      }
    });

    const _add = this.selector.add.bind(this.selector);
    this.selector.add = (...args) => {
      const element = this.selector.getElementByPeerId(args[0].key as any);
      if(element.classList.contains('is-unavailable')) {
        toastNew({
          langPackKey: 'Boost.Reassign.Wait',
          langPackArguments: [
            i18n('MoreBoosts', [this.appConfig.boosts_per_sent_gift ?? 1]),
            anchorCallback(() => {
              hideToast();
              this.hideWithCallback(() => {
                appImManager.initGifting();
              });
            })
          ]
        });
        return false;
      }

      return _add(...args);
    };

    const keys = this.myBoosts.my_boosts.map((myBoost) => {
      const peerId = getPeerId(myBoost.peer);
      if(peerId === this.peerId) {
        return;
      }

      const key = 'S' + myBoost.slot + '_' + peerId;
      map.set(key, myBoost);
      return key;
    }).filter(Boolean);
    this.scrollable = this.selector.scrollable;
    this.attachScrollableListeners();
    this.selector.renderResultsFunc(keys as any as number[]);

    let processing = false;
    const onClick = async(e: MouseEvent) => {
      cancelEvent(e);
      processing = true;
      const toggle = toggleDisability(this.btnConfirm, true);
      try {
        const slots = selected().map((myBoost) => myBoost.slot);
        const uniquePeers = filterUnique(selected().map((myBoost) => getPeerId(myBoost.peer)));
        await this.managers.appBoostsManager.applyBoost(this.peerId, slots);
        this.hide();
        toastNew({
          langPackKey: 'BoostingReassignedFromPlural',
          langPackArguments: [slots.length, i18n('BoostingFromOtherChannel', [uniquePeers.length])]
        });
      } catch(err) {
        console.error('error replacing boosts', err);
        toggle();
      }
      processing = false;
    };

    attachClickEvent(this.btnConfirm, onClick, {listenerSetter: this.listenerSetter});

    BoostsConfirmButton({
      button: this.btnConfirm,
      langKey: () => 'Boost.Reassign',
      langArgs: () => [count() || 1],
      boosts: count
    });

    createEffect(() => {
      if(processing) {
        return;
      }

      toggleDisability(this.btnConfirm, !count());
    });

    this.description.append(
      i18n(
        'Boost.Reassign.Description',
        [
          await wrapPeerTitle({peerId: this.peerId}),
          i18n(
            'Boost.GiftPremium',
            [
              anchorCallback(() => {
                this.hideWithCallback(() => {
                  appImManager.initGifting();
                });
              })
            ]
          ),
          i18n('Boost.Additional', [this.appConfig.boosts_per_sent_gift ?? 1])
        ]
      )
    );

    this.footer.append(this.btnConfirm);
    this.body.after(this.footer);
  }
}
