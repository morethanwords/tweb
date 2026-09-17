import PopupElement, {createPopup} from '@components/popups/indexTsx';
import {StarGift} from '@layer';
import {MyDocument} from '@appManagers/appDocsManager';
import {MyStarGift} from '@appManagers/appGiftsManager';
import rootScope from '@lib/rootScope';
import {toastNew} from '@components/toast';
import {ButtonIconTsx} from '@components/buttonIconTsx';
import {StarGiftBackdrop} from '@components/stargifts/stargiftBackdrop';
import {I18nTsx} from '@helpers/solid/i18n';
import {createSignal} from 'solid-js';

import styles from '@components/popups/starGiftWear.module.scss';
import {AvatarNewTsx} from '@components/avatarNew';
import FeatureRows from '@components/featureRows';
import MediaHeader from '@components/mediaHeader';
import showPremiumPopup from '@components/popups/premium';
import {getCollectibleName} from '@appManagers/utils/gifts/getCollectibleName';
import {PeerTitleTsx} from '@components/peerTitleTsx';
import classNames from '@helpers/string/classNames';
import {StickerTsx} from '@components/wrappers/sticker';
import showBoostPopup from './boost';

export default function showStarGiftWearPopup(options: {
  gift: MyStarGift,
  peerId?: PeerId
}) {
  const gift$ = options.gift;
  const peerId = options.peerId || rootScope.myId;
  const {collectibleAttributes} = gift$;
  const gift = gift$.raw as StarGift.starGiftUnique;
  const [show, setShow] = createSignal(true);

  const onWear = async() => {
    const promise = peerId === rootScope.myId ?
      rootScope.managers.appUsersManager.updateEmojiStatus({
        _: 'inputEmojiStatusCollectible',
        collectible_id: gift$.raw.id
      }) :
      rootScope.managers.apiManager.invokeApiSingleProcess({
        method: 'channels.updateEmojiStatus',
        params: {
          channel: await rootScope.managers.appChatsManager.getChannelInput(peerId.toChatId()),
          emoji_status: {
            _: 'inputEmojiStatusCollectible',
            collectible_id: gift$.raw.id
          }
        }
      }).then((updates) => {
        rootScope.managers.apiUpdatesManager.processUpdateMessage(updates);
      });

    promise.then(() => {
      setShow(false);
    }).catch((err: ApiError) => {
      if(err.type === 'BOOSTS_REQUIRED') {
        showBoostPopup(peerId);
        return;
      }
      toastNew({langPackKey: 'Error.AnError'});
    });
  };

  createPopup(() => (
    <PopupElement class={styles.popup} closable show={show()} old>
      <PopupElement.Header floating>
        <PopupElement.CloseButton class={/* @once */ styles.close} />
      </PopupElement.Header>
      <PopupElement.Body>
        <div class={/* @once */ styles.container}>
          <div class={/* @once */ classNames(styles.header, 'profile-container need-white is-collapsed')}>
            {gift._ === 'starGiftUnique' && (
              <StarGiftBackdrop
                class={/* @once */ styles.backdrop}
                backdrop={collectibleAttributes.backdrop}
                patternEmoji={collectibleAttributes.pattern.document as MyDocument}
              />
            )}

            <AvatarNewTsx
              class={/* @once */ styles.avatar}
              peerId={peerId}
              size={120}
            />

            <div class="profile-avatars-info">
              <div class="profile-name">
                <PeerTitleTsx peerId={peerId} withIcons />
                <StickerTsx
                  class="emoji-status"
                  sticker={gift$.sticker}
                  width={24}
                  height={24}
                  extraOptions={{play: true, loop: false}}
                />
              </div>
              <div class="profile-subtitle">
                <span class="online"><I18nTsx key="Online" /></span>
              </div>
            </div>
          </div>

          <div class={/* @once */ styles.body}>
            <MediaHeader marginBottom>
              <MediaHeader.Title size={20}>
                <I18nTsx key="StarGiftWearTitle" args={[getCollectibleName(gift)]} />
              </MediaHeader.Title>
              <MediaHeader.Subtitle>
                <I18nTsx key="StarGiftWearSubtitle" />
              </MediaHeader.Subtitle>
            </MediaHeader>
            <FeatureRows rows={/* @once */ [
              {
                icon: 'menu_feature_unique',
                title: <I18nTsx key="StarGiftWearBenefit1Title" />,
                subtitle: <I18nTsx key="StarGiftWearBenefit1Text" />
              },
              {
                icon: 'menu_feature_cover',
                title: <I18nTsx key="StarGiftWearBenefit2Title" />,
                subtitle: <I18nTsx key="StarGiftWearBenefit2Text" />
              },
              {
                icon: 'menu_verification',
                title: <I18nTsx key="StarGiftWearBenefit3Title" />,
                subtitle: <I18nTsx key="StarGiftWearBenefit3Text" />
              }
            ]} />
          </div>
        </div>
      </PopupElement.Body>
      <PopupElement.Footer>
        <PopupElement.FooterButton
          langKey="StarGiftWearStart"
          callback={() => {
            onWear();
            return false;
          }}
        />
      </PopupElement.Footer>
    </PopupElement>
  ));
}

export function openStarGiftWear(gift: MyStarGift, peerId?: PeerId) {
  if(!rootScope.premium) {
    showPremiumPopup();
    return false;
  }

  showStarGiftWearPopup({gift, peerId});
}
