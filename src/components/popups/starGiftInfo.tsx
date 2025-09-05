import {createMemo, createSignal, JSX, onMount, Show} from 'solid-js';
import PopupElement from '.';
import {InputSavedStarGift, Peer, SavedStarGift, StarGift} from '../../layer';
import {MyDocument} from '../../lib/appManagers/appDocsManager';
import {StickerTsx} from '../wrappers/sticker';
import {i18n, LangPackKey} from '../../lib/langPack';
import {StarsStar} from './stars';
import {PeerTitleTsx} from '../peerTitleTsx';
import Button from '../buttonTsx';
import {formatDate, formatFullSentTime, formatTime} from '../../helpers/date';
import appImManager from '../../lib/appManagers/appImManager';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import wrapRichText from '../../lib/richTextProcessor/wrapRichText';
import {MyStarGift} from '../../lib/appManagers/appGiftsManager';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId';
import numberThousandSplitter from '../../helpers/number/numberThousandSplitter';
import PopupSendGift from './sendGift';
import Table, {TableButton, TablePeer, TableRow} from '../table';
import {NULL_PEER_ID, STARS_CURRENCY, TON_CURRENCY} from '../../lib/mtproto/mtproto_config';
import rootScope from '../../lib/rootScope';
import {toastNew} from '../toast';
import PopupStarGiftUpgrade from './starGiftUpgrade';
import {ButtonIconTsx} from '../buttonIconTsx';
import {StarGiftBackdrop} from '../stargifts/stargiftBackdrop';
import {ButtonMenuToggleTsx} from '../buttonMenuToggleTsx';
import {copyTextToClipboard} from '../../helpers/clipboard';
import PopupPickUser from './pickUser';
import {I18nTsx} from '../../helpers/solid/i18n';
import showTooltip from '../tooltip';
import {wearStarGift} from './wearStarGift';
import tsNow from '../../helpers/tsNow';
import {useAppState} from '../../stores/appState';
import transferStarGift from './transferStarGift';
import safeAssign from '../../helpers/object/safeAssign';
import paymentsWrapCurrencyAmount from '../../helpers/paymentsWrapCurrencyAmount';
import PopupBuyResaleGift from './buyResaleGift';
import wrapPeerTitle from '../wrappers/peerTitle';
import {wrapFormattedDuration} from '../wrappers/wrapDuration';
import formatDuration from '../../helpers/formatDuration';
import PopupSellStarGift from './sellStarGift';
import {inputStarGiftEquals} from '../../lib/appManagers/utils/gifts/inputStarGiftEquals';
import confirmationPopup from '../confirmationPopup';
import {getCollectibleName} from '../../lib/appManagers/utils/gifts/getCollectibleName';
import {updateStarGift} from '../../lib/appManagers/utils/gifts/updateStarGift';
import {wrapEmojiTextWithEntities} from '../../lib/richTextProcessor/wrapEmojiText';
import wrapMessageEntities from '../../lib/richTextProcessor/wrapMessageEntities';

function AttributeTableButton(props: { permille: number }) {
  return (
    <TableButton
      onClick={(evt) => {
        showTooltip({
          element: evt.target as HTMLElement,
          vertical: 'top',
          container: document.body,
          class: 'popup-star-gift-info-tooltip',
          textElement: i18n('StarGiftAttributeTooltip', [`${props.permille / 10}%`])
        })
      }}
    >
      {props.permille / 10}%
    </TableButton>
  );
}

export default class PopupStarGiftInfo extends PopupElement {
  private gift: MyStarGift;
  private resaleRecipient?: PeerId;
  private onClickAway?: () => void;

  private isResale: boolean

  constructor(options: {
    gift: MyStarGift,
    onClickAway?: () => void,
    resaleRecipient?: PeerId
  }) {
    super('popup-star-gift-info', {
      closable: true,
      overlayClosable: true,
      body: true,
      footer: true,
      withConfirm: 'OK',
      withFooterConfirm: true
    });

    safeAssign(this, options);
    this.isResale = this.gift.resellPriceStars !== undefined && getPeerId((this.gift.raw as StarGift.starGiftUnique).owner_id) !== rootScope.myId;

    this.construct();
  }

  private _construct() {
    const {
      saved,
      raw: gift,
      sticker,
      isIncoming,
      isConverted,
      collectibleAttributes
    } = this.gift;

    const isUnavailable = !saved && (gift as StarGift.starGift).availability_remains === 0;
    const fromId = saved ? getPeerId(saved.from_id) : NULL_PEER_ID;
    const date = saved ? new Date(saved.date * 1000) : null;
    const firstSaleDate = (gift as StarGift.starGift).first_sale_date ? (new Date((gift as StarGift.starGift).first_sale_date * 1000)) : null;
    const lastSaleDate = (gift as StarGift.starGift).last_sale_date ? (new Date((gift as StarGift.starGift).last_sale_date * 1000)) : null;
    const starsValue = (gift as StarGift.starGift).stars;

    const isOwnedUniqueGift = gift._ === 'starGiftUnique' && getPeerId(gift.owner_id) === rootScope.myId
    const canSave = gift._ === 'starGift' && isIncoming && !isConverted || (isOwnedUniqueGift && saved !== undefined)
    let input = this.gift.input;
    if(!input && gift._ === 'starGiftUnique') {
      input = {_: 'inputSavedStarGiftSlug', slug: gift.slug}
    }

    const [isListed, setIsListed] = createSignal((gift as StarGift.starGiftUnique).resell_amount !== undefined);
    const [resellOnlyTon, setResellOnlyTon] = createSignal(this.gift.resellOnlyTon);
    const [resellPriceTon, setResellPriceTon] = createSignal(this.gift.resellPriceTon);
    const [resellPriceStars, setResellPriceStars] = createSignal(this.gift.resellPriceStars);

    this.listenerSetter.add(rootScope)('star_gift_update', (event) => {
      if(event.resalePrice && inputStarGiftEquals(input, this.gift.input)) {
        setIsListed(event.resalePrice.length > 0);
        updateStarGift(this.gift, event);
        setResellOnlyTon(this.gift.resellOnlyTon);
        setResellPriceTon(this.gift.resellPriceTon);
        setResellPriceStars(this.gift.resellPriceStars);
      }
    })

    if(canSave) {
      this.btnConfirm.replaceChildren(i18n(saved.pFlags.unsaved ? 'StarGiftDisplayOnMyPage' : 'StarGiftHideFromMyPage'));
      let loading = false;
      attachClickEvent(this.btnConfirm, () => {
        if(loading) return;
        loading = true;
        this.managers.appGiftsManager.toggleGiftHidden(input, !saved.pFlags.unsaved).then(() => {
          this.hide();
        });
      });
    } else if(this.isResale) {
      attachClickEvent(this.btnConfirm, () => {
        const recipientId = this.resaleRecipient ?? rootScope.myId;
        const popup = PopupElement.createPopup(PopupBuyResaleGift, {
          recipientId,
          gift: this.gift
        })
        const giftUnique = this.gift.raw as StarGift.starGiftUnique;
        popup.show()
        popup.addEventListener('finish', async(bought) => {
          if(bought) {
            this.hide();

            const isSelf = recipientId === rootScope.myId;
            if(isSelf) {
              toastNew({
                langPackKey: 'StarGiftResaleBoughtSelf',
                langPackArguments: [`${giftUnique.title} #${numberThousandSplitter(giftUnique.num, ',')}`]
              })
            } else {
              toastNew({
                langPackKey: 'StarGiftResaleBoughtOther',
                langPackArguments: [await wrapPeerTitle({peerId: recipientId, onlyFirstName: true})]
              })
            }
          }
        })
      });
    } else {
      attachClickEvent(this.btnConfirm, () => this.hide());
    }

    const tableContent = createMemo(() => {
      const rows: TableRow[] = [];

      if(gift._ === 'starGiftUnique') {
        if(gift.owner_id) {
          rows.push([
            'StarGiftOwner',
            <TablePeer
              peerId={getPeerId(gift.owner_id)}
              onClick={() => {
                appImManager.setInnerPeer({peerId: getPeerId(gift.owner_id)})
                this.onClickAway?.()
                this.hide()
              }}
            />
          ]);
        } else if(gift.owner_name) {
          rows.push([
            'StarGiftOwner',
            gift.owner_name
          ]);
        }

        rows.push([
          'StarGiftModel',
          <>
            {collectibleAttributes.model.name}
            <AttributeTableButton permille={collectibleAttributes.model.rarity_permille} />
          </>
        ]);

        rows.push([
          'StarGiftBackdrop',
          <>
            {collectibleAttributes.backdrop.name}
            <AttributeTableButton permille={collectibleAttributes.backdrop.rarity_permille} />
          </>
        ]);

        rows.push([
          'StarGiftPattern',
          <>
            {collectibleAttributes.pattern.name}
            <AttributeTableButton permille={collectibleAttributes.pattern.rarity_permille} />
          </>
        ]);

        rows.push([
          'StarGiftAvailability',
          i18n('StarGiftAvailabilityIssued', [
            numberThousandSplitter(gift.availability_issued),
            numberThousandSplitter(gift.availability_total)
          ])
        ]);

        // todo need layer 213
        // if(...) {
        //   rows.push([
        //     'StarGiftValue',
        //     `~${paymentsWrapCurrencyAmount(
        //       Number(formatNanoton(this.gift.resellPriceTon, 2, false)) * appConfig.ton_usd_rate * 100,
        //       'USD'
        //     )}`
        //   ]);
        // }

        return rows;
      }

      if(fromId !== NULL_PEER_ID) {
        rows.push([
          'StarGiftFromShort',
          <>
            <TablePeer peerId={fromId} />
            <TableButton
              text="StarGiftSendInline"
              onClick={() => {
                this.hide();
                PopupElement.createPopup(PopupSendGift, fromId);
              }}
            />
          </>
        ]);
      }

      if(date) {
        rows.push([
          'StarGiftDate',
          <span>{formatFullSentTime(date.getTime() / 1000 | 0)}</span>
        ]);
      }

      if(isUnavailable) {
        if(firstSaleDate) {
          rows.push([
            'StarGiftUnavailableFirstSale',
            <span>{formatFullSentTime(firstSaleDate.getTime() / 1000 | 0)}</span>
          ]);
        }

        if(lastSaleDate) {
          rows.push([
            'StarGiftUnavailableLastSale',
            <span>{formatFullSentTime(lastSaleDate.getTime() / 1000 | 0)}</span>
          ]);
        }
      }

      const canConvert = saved?.convert_stars &&
        isIncoming &&
        !isConverted &&
        (tsNow(true) - (date.getTime() / 1000 | 0)) < useAppState()[0].appConfig.stargifts_convert_period_max;
      rows.push([
        'StarGiftValue',
        <>
          <StarsStar />
          {starsValue}
          {canConvert && (
            <TableButton
              text="StarGiftConvertButton"
              textArgs={[saved.convert_stars]}
              onClick={() => {
                rootScope.managers.appGiftsManager.convertGift(input)
                .then(() => {
                  this.hide()
                }).catch(() => {
                  toastNew({langPackKey: 'Error.AnError'})
                })
              }}
            />
          )}
        </>
      ]);

      if(gift.availability_total > 0) {
        rows.push([
          'StarGiftAvailability',
          i18n('StarGiftAvailabilityValue2', [
            numberThousandSplitter((gift as StarGift.starGift).availability_remains ?? 0),
            numberThousandSplitter(gift.availability_total)
          ])
        ]);
      }

      if(gift._ === 'starGift' && saved?.pFlags.can_upgrade) {
        rows.push([
          'StarGiftStatus',
          <>
            {i18n('StarGiftStatusNonUnique')}
            {isIncoming && (
              <TableButton
                text="StarGiftStatusUpgrade"
                onClick={() => PopupStarGiftUpgrade.create(this.gift).then(() => this.hide())}
              />
            )}
          </>
        ]);
      }

      return rows;
    })

    const tableFooter = () => {
      if(collectibleAttributes?.original) {
        const wrapPeer = (peer: Peer) => {
          const peerId = getPeerId(peer);
          return (
            <PeerTitleTsx
              peerId={peerId}
              onlyFirstName
              onClick={() => {
                appImManager.setInnerPeer({peerId})
                this.hide()
              }}
            />
          );
        };

        let key: LangPackKey;
        const args: JSX.Element[] = [];

        if(collectibleAttributes.original.sender_id) {
          key = collectibleAttributes.original.message ? 'StarGiftOriginalDetailsSenderComment' : 'StarGiftOriginalDetailsSender';
          args.push(wrapPeer(collectibleAttributes.original.sender_id));
        } else {
          key = collectibleAttributes.original.message ? 'StarGiftOriginalDetailsComment' : 'StarGiftOriginalDetailsBasic';
        }

        args.push(wrapPeer(collectibleAttributes.original.recipient_id));
        args.push(formatDate(new Date(collectibleAttributes.original.date * 1000)));

        if(collectibleAttributes.original.message) {
          const span = document.createElement('span');
          const wrapped = wrapMessageEntities(collectibleAttributes.original.message.text, collectibleAttributes.original.message.entities)
          span.append(wrapRichText(wrapped.message, {entities: wrapped.totalEntities}));
          args.push(span);
        }

        return <I18nTsx class="popup-star-gift-info-original" key={key} args={args} />;
      }

      if(saved?.message) {
        return wrapRichText(saved.message.text, {entities: saved.message.entities});
      }
    }

    const handleShare = () => {
      PopupPickUser.createSharingPicker2().then((peerId) => {
        rootScope.managers.appMessagesManager.sendText({peerId, text: 'https://t.me/nft/' + (gift as StarGift.starGiftUnique).slug});
        appImManager.setInnerPeer({peerId});
        this.hide();
      });
    }

    const handleSell = async(changePrice = false) => {
      if(isListed() && !changePrice) {
        await confirmationPopup({
          titleLangKey: 'StarGiftUnlistTitle',
          titleLangArgs: [getCollectibleName(gift as StarGift.starGiftUnique)],
          descriptionLangKey: 'StarGiftUnlistText',
          button: {
            langKey: 'StarGiftUnlistConfirm'
          }
        });
        await this.managers.appGiftsManager.updateResalePrice(input, null);
        return
      }

      const now = tsNow(true);
      if(saved.can_resell_at !== undefined && saved.can_resell_at > now) {
        toastNew({
          langPackKey: 'StarGiftResaleCooldown',
          langPackArguments: [wrapFormattedDuration(formatDuration(saved.can_resell_at - now, 2))]
        });
        return
      }

      PopupElement.createPopup(PopupSellStarGift, {gift: this.gift})
    }

    onMount(() => {
      if(isOwnedUniqueGift) {
        // ! preload options for resale floor price
        this.managers.appGiftsManager.getStarGiftOptions().catch(() => {})
      }
    })

    return (
      <div class={`popup-star-gift-info-container ${gift._ === 'starGiftUnique' ? 'is-collectible' : ''}`}>
        <div class="popup-star-gift-info-header">
          {gift._ === 'starGiftUnique' && (
            <StarGiftBackdrop
              class="popup-star-gift-info-backdrop"
              backdrop={collectibleAttributes.backdrop}
              patternEmoji={collectibleAttributes.pattern.document as MyDocument}
            />
          )}
          <ButtonIconTsx
            class="popup-star-gift-info-close"
            icon="close"
            onClick={() => this.hide()}
          />
          <ButtonMenuToggleTsx
            class="popup-star-gift-info-menu-toggle"
            icon="more"
            direction="bottom-left"
            buttons={[
              {
                icon: saved?.pFlags.pinned_to_top ? 'unpin' : 'pin',
                text: saved?.pFlags.pinned_to_top ? 'StarGiftUnpin' : 'StarGiftPin',
                verify: () => isOwnedUniqueGift,
                onClick: () => {
                  this.managers.appGiftsManager.togglePinnedGift(input).then(() => {
                    this.hide();
                  });
                }
              },
              {
                icon: 'tag_alt',
                text: 'StarGiftChangePrice',
                verify: () => isOwnedUniqueGift && isListed(),
                onClick: () => handleSell(true)
              },
              {
                icon: 'tag_alt_crossed',
                text: 'StarGiftUnlistTitle',
                verify: () => isOwnedUniqueGift && isListed(),
                onClick: () => handleSell()
              },
              {
                icon: 'forward',
                text: 'ShareFile',
                onClick: handleShare
              },
              {
                icon: 'link',
                text: 'CopyLink',
                onClick: () => {
                  copyTextToClipboard('https://t.me/nft/' + (gift as StarGift.starGiftUnique).slug);
                  toastNew({langPackKey: 'LinkCopied'});
                }
              }
            ]}
          />

          <StickerTsx
            class="popup-star-gift-info-sticker"
            sticker={sticker}
            width={120}
            height={120}
            extraOptions={{play: true, loop: false}}
          />

          <div class="popup-star-gift-info-title">
            {gift._ === 'starGift' ?
              i18n(isUnavailable ? 'StarGiftUnavailableTitle' : isIncoming ? 'StarGiftReceivedTitle' : 'StarGiftTitle') :
              gift.title
            }
          </div>

          <Show when={gift._ ==='starGift'}>
            {isUnavailable ? (
            <div class="popup-star-gift-info-subtitle-unavailable">
              {i18n('StarGiftUnavailableSubtitle')}
            </div>
          ) : (
            <div class="popup-star-gift-info-price">
              <StarsStar />
              {starsValue}
            </div>
          )}
            {isIncoming && !isConverted && (
              <div class="popup-star-gift-info-subtitle">
                {i18n('StarGiftReceivedSubtitle', [saved.convert_stars])}
                {' '}
                <a href="https://telegram.org/blog/telegram-stars" target="_blank">
                  {i18n('StarGiftReceivedSubtitleLink')}
                </a>
              </div>
            )}
          </Show>

          {gift._ === 'starGiftUnique' && (
            <div class="popup-star-gift-info-subtitle">
              {
                gift.released_by ?
                  <I18nTsx
                    key="StarGiftCollectibleNumWithAuthor"
                    args={[
                      numberThousandSplitter(gift.num, ','),
                      <PeerTitleTsx
                        peerId={getPeerId(gift.released_by)}
                        username
                        onClick={() => {
                          appImManager.setInnerPeer({peerId: getPeerId(gift.released_by)})
                          this.hide()
                        }}
                      />
                    ]}
                  /> :
                  <I18nTsx
                    key="StarGiftCollectibleNum"
                    args={[numberThousandSplitter(gift.num, ',')]}
                  />
              }
            </div>
          )}

          {isOwnedUniqueGift && (
            <div class="popup-star-gift-info-actions">
              <Button
                class="popup-star-gift-info-action"
                icon="gem_transfer"
                text="StarGiftTransfer"
                onClick={() => transferStarGift(this.gift).then((ok) => {
                  if(ok) {
                    this.hide();
                  }
                })}
              />
              <Button
                class="popup-star-gift-info-action"
                icon="crown"
                text="StarGiftWear"
                onClick={() => {
                  wearStarGift(gift.id).then((ok) => {
                    if(ok) {
                      this.hide();
                    }
                  })
                }}
              />
              {isListed() ? (
                <button class="popup-star-gift-info-action is-change-price" onClick={() => handleSell(true)}>
                  {resellOnlyTon() ?
                    paymentsWrapCurrencyAmount(resellPriceTon(), TON_CURRENCY) :
                    paymentsWrapCurrencyAmount(resellPriceStars(), STARS_CURRENCY)}
                  <I18nTsx key="StarGiftChangePriceButton" />
                </button>
              ) : (
                <Button
                  class="popup-star-gift-info-action"
                  icon="tag_alt"
                  text="StarGiftSell"
                  onClick={() => handleSell()}
                />
              )}
            </div>
          )}
        </div>

        <div class="popup-star-gift-info-table">
          <Table
            content={tableContent()}
            footer={tableFooter()}
            cellClass="popup-star-gift-info-table-cell"
            footerClass={gift._ === 'starGiftUnique' ? 'popup-star-gift-info-footer-unique' : undefined}
          />
        </div>

        {canSave && (
          <div class="popup-star-gift-info-hint">
            {saved.pFlags.unsaved ? i18n('StarGiftHiddenHint') : (
              <>
                {i18n('StarGiftVisibleHint')}
                {' '}
                <a href="#">
                  {i18n('StarGiftVisibleHintLink')}
                </a>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  private async construct() {
    this.header.remove();
    this.appendSolid(() => this._construct());

    if(this.isResale) {
      this.btnConfirm.classList.add('popup-star-gift-info-resale-button');
      this.btnConfirm.replaceChildren(
        i18n(this.resaleRecipient ? 'StarGiftResaleSend' : 'StarGiftResaleBuy', [
          this.gift.resellOnlyTon ?
            paymentsWrapCurrencyAmount(this.gift.resellPriceTon, TON_CURRENCY) :
            paymentsWrapCurrencyAmount(this.gift.resellPriceStars, STARS_CURRENCY)
        ])
      )

      if(this.gift.resellOnlyTon) {
        this.btnConfirm.classList.add('popup-star-gift-info-resale-button-twoline');
        const span = i18n('StarGiftResaleStarsAmount', [
          paymentsWrapCurrencyAmount(this.gift.resellPriceStars, STARS_CURRENCY)
        ])
        span.classList.add('popup-star-gift-info-resale-stars-amount');
        this.btnConfirm.append(span);
      }
    }

    this.show();
  }
}
