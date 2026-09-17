import {Accessor, For, JSX, createEffect, createMemo, createRoot, createSignal, onCleanup, untrack} from 'solid-js';
import {formatFullSentTime} from '@helpers/date';
import anchorCallback from '@helpers/dom/anchorCallback';
import cancelEvent from '@helpers/dom/cancelEvent';
import {MyBoost, PremiumMyBoosts} from '@layer';
import appImManager from '@lib/appImManager';
import {i18n} from '@lib/langPack';
import AppSelectPeers from '@components/appSelectPeers';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import {BoostsConfirmButton} from '@components/popups/boostsViaGifts';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import {getMiddleware} from '@helpers/middleware';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import {AvatarNew} from '@components/avatarNew';
import MediaHeader from '@components/mediaHeader';
import classNames from '@helpers/string/classNames';
import filterUnique from '@helpers/array/filterUnique';
import {resolveElements} from '@solid-primitives/refs';
import liteMode from '@helpers/liteMode';
import {hideToast, toastNew} from '@components/toast';
import tsNow from '@helpers/tsNow';
import {wrapLeftDuration} from '@components/wrappers/wrapDuration';
import {IconTsx} from '@components/iconTsx';
import rootScope from '@lib/rootScope';
import {createListTransition} from '@vendor/createListTransition';

const className = 'popup-boost';

export default async function showReassignBoostPopup(
  peerId: PeerId,
  myBoosts: PremiumMyBoosts,
  appConfig: MTAppConfig
) {
  const middlewareHelper = getMiddleware();
  const middleware = middlewareHelper.get();
  const descriptionPeerTitle = await wrapPeerTitle({peerId});

  const [show, setShow] = createSignal(false);
  const deferredCloseCallbacks: (() => void)[] = [];
  const hideWithCallback = (callback: () => void) => {
    deferredCloseCallbacks.push(callback);
    setShow(false);
  };

  createPopup(() => {
    onCleanup(() => middlewareHelper.destroy());

    const [selected, setSelected] = createSignal<MyBoost[]>([]);
    const [count, setCount] = createSignal(0);
    const [processing, setProcessing] = createSignal(false);
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

      const avatar = createAvatar({peerId, right: true});
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
              <IconTsx icon="boostcircle_filled" class={classNames(`${className}-avatars-avatar-icon`, !diff() && 'is-visible')} />
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

    const leftTimes = new Map<string, Accessor<number>>();

    // the picker owns the popup's scrolling area, so it IS the body
    const body = document.createElement('div');
    body.classList.add('popup-body');

    const selector: AppSelectPeers = new AppSelectPeers({
      middleware,
      appendTo: body,
      onChange: (length) => {
        setSelected(selector.getSelected().map((key) => map.get(key as any as string)));
        setCount(length);
      },
      onFirstRender: () => {
        setShow(true);
      },
      multiSelect: true,
      noSearch: true,
      sectionNameLangPackKey: 'BoostingRemoveBoostFrom',
      avatarSize: 'abitbigger',
      managers: rootScope.managers,
      peerType: [],
      getSubtitleForElement: (key) => {
        const myBoost = map.get(key as any as string);
        return createRoot((dispose) => {
          middleware.onDestroy(() => {
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
          middleware.onDestroy(dispose);
          createEffect(() => {
            dialogElement.container.classList.toggle('is-unavailable', !!leftTime());
          });
        });
      }
    });

    const _add = selector.add.bind(selector);
    selector.add = (...args) => {
      const element = selector.getElementByKey(args[0].key as any);
      if(element.classList.contains('is-unavailable')) {
        toastNew({
          langPackKey: 'Boost.Reassign.Wait',
          langPackArguments: [
            i18n('MoreBoosts', [appConfig.boosts_per_sent_gift ?? 1]),
            anchorCallback(() => {
              hideToast();
              hideWithCallback(() => {
                appImManager.initGifting();
              });
            })
          ]
        });
        return false;
      }

      return _add(...args);
    };

    const keys = myBoosts.my_boosts.map((myBoost) => {
      const boostPeerId = getPeerId(myBoost.peer);
      if(boostPeerId === peerId) {
        return;
      }

      const key = 'S' + myBoost.slot + '_' + boostPeerId;
      map.set(key, myBoost);
      return key;
    }).filter(Boolean);
    selector.scrollable.attachBorderListeners();
    selector.renderResultsFunc(keys as any as number[]);

    const onClick = async(e: MouseEvent) => {
      cancelEvent(e);
      setProcessing(true);
      try {
        const slots = selected().map((myBoost) => myBoost.slot);
        const uniquePeers = filterUnique(selected().map((myBoost) => getPeerId(myBoost.peer)));
        await rootScope.managers.appBoostsManager.applyBoost(peerId, slots);
        setShow(false);
        toastNew({
          langPackKey: 'BoostingReassignedFromPlural',
          langPackArguments: [slots.length, i18n('BoostingFromOtherChannel', [uniquePeers.length])]
        });
      } catch(err) {
        console.error('error replacing boosts', err);
      }
      setProcessing(false);
      return false;
    };

    return (
      <PopupElement
        class={className}
        closable
        show={show()}
        onCloseAfterTimeout={() => deferredCloseCallbacks.splice(0).forEach((callback) => callback())}
      >
        <PopupElement.Header floating>
          <PopupElement.CloseButton />
        </PopupElement.Header>
        {Avatars()}
        <MediaHeader.Title class={`${className}-title`} size={20}>{i18n('Boost.Replace')}</MediaHeader.Title>
        <MediaHeader.Subtitle class={`${className}-description`}>
          {i18n(
            'Boost.Reassign.Description',
            [
              descriptionPeerTitle,
              i18n(
                'Boost.GiftPremium',
                [
                  anchorCallback(() => {
                    hideWithCallback(() => {
                      appImManager.initGifting();
                    });
                  })
                ]
              ),
              i18n('Boost.Additional', [appConfig.boosts_per_sent_gift ?? 1])
            ]
          )}
        </MediaHeader.Subtitle>
        {body}
        <PopupElement.Footer>
          <BoostsConfirmButton
            disabled={!count() || processing()}
            callback={onClick}
            langKey={() => 'Boost.Reassign'}
            langArgs={() => [count() || 1]}
            boosts={count}
          />
        </PopupElement.Footer>
      </PopupElement>
    );
  });
}
