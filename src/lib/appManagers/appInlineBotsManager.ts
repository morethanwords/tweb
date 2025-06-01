/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 *
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import type {MyDocument} from './appDocsManager';
import type {MyPhoto} from './appPhotosManager';
import type {MyTopPeer} from './appUsersManager';
import type {AppMessagesManager} from './appMessagesManager';
import {BotInlineResult, GeoPoint, InputGeoPoint, MessageMedia} from '../../layer';
import insertInDescendSortedArray from '../../helpers/array/insertInDescendSortedArray';
import {AppManager} from './manager';
import getPhotoMediaInput from './utils/photos/getPhotoMediaInput';
import getServerMessageId from './utils/messageId/getServerMessageId';
import generateQId from './utils/inlineBots/generateQId';
import getDocumentMediaInput from './utils/docs/getDocumentMediaInput';

export class AppInlineBotsManager extends AppManager {
  private inlineResults: {[queryAndResultIds: string]: BotInlineResult} = {};
  private setHash: {
    [botId: UserId]: {
      peerId: PeerId,
      time: number
    }
  } = {};

  public getGeoInput(geo: GeoPoint): InputGeoPoint {
    return geo._ === 'geoPoint' ? {
      _: 'inputGeoPoint',
      lat: geo.lat,
      long: geo.long,
      accuracy_radius: geo.accuracy_radius
    } : {
      _: 'inputGeoPointEmpty'
    };
  }

  public getInlineResults(peerId: PeerId, botId: BotId, query = '', offset = '', geo?: GeoPoint) {
    return this.apiManager.invokeApi('messages.getInlineBotResults', {
      bot: this.appUsersManager.getUserInput(botId),
      peer: this.appPeersManager.getInputPeerById(peerId),
      query,
      geo_point: geo ? this.getGeoInput(geo) : undefined,
      offset
    }, {/* timeout: 1,  */stopTime: -1, noErrorBox: true}).then((botResults) => {
      const queryId = botResults.query_id;

      /* if(botResults.switch_pm) {
        botResults.switch_pm.rText = wrapRichText(botResults.switch_pm.text, {noLinebreaks: true, noLinks: true});
      } */

      botResults.results.forEach((result) => {
        if(result._ === 'botInlineMediaResult') {
          result.document = this.appDocsManager.saveDoc(result.document);
          result.photo = this.appPhotosManager.savePhoto(result.photo);
        } else {
          result.content = this.appWebDocsManager.saveWebDocument(result.content);
          result.thumb = this.appWebDocsManager.saveWebDocument(result.thumb);
        }

        this.inlineResults[generateQId(queryId, result.id)] = result;
      });

      return botResults;
    });
  }

  private pushPopularBot(botId: BotId) {
    this.appUsersManager.getTopPeers('bots_inline').then((topPeers) => {
      const botPeerId = botId.toPeerId();
      const index = topPeers.findIndex((topPeer) => topPeer.id === botPeerId);
      let topPeer: MyTopPeer;
      if(index !== -1) {
        topPeer = topPeers[index];
      } else {
        topPeer = {
          id: botPeerId,
          rating: 0
        };
      }

      ++topPeer.rating;
      insertInDescendSortedArray(topPeers, topPeer, 'rating');

      this.appStateManager.setKeyValueToStorage('topPeersCache');

      // rootScope.$broadcast('inline_bots_popular')
    });
  }

  public switchToPM(fromPeerId: PeerId, botId: BotId, startParam: string) {
    this.setHash[botId] = {peerId: fromPeerId, time: Date.now()};
    return this.appMessagesManager.startBot(botId, undefined, startParam);
  }

  /*
  function resolveInlineMention (username) {
    return AppPeersManager.resolveUsername(username).then(function (peerId) {
      if (peerId.isUser()) {
        var bot = AppUsersManager.getUser(peerId)
        if (bot.pFlags.bot && bot.bot_inline_placeholder !== undefined) {
          var resolvedBot = {
            username: username,
            id: peerId,
            placeholder: bot.bot_inline_placeholder
          }
          if (bot.pFlags.bot_inline_geo &&
            GeoLocationManager.isAvailable()) {
              return checkGeoLocationAccess(peerId).then(function () {
                return GeoLocationManager.getPosition().then(function (coords) {
                  resolvedBot.geo = coords
                  return qSync.when(resolvedBot)
                })
              })['catch'](function () {
                return qSync.when(resolvedBot)
              })
            }
            return qSync.when(resolvedBot)
          }
        }
        return $q.reject()
      }, function (error) {
        error.handled = true
        return $q.reject(error)
      })
    }

    function regroupWrappedResults (results, rowW, rowH) {
      if (!results ||
        !results[0] ||
        ['photo', 'gif', 'sticker'].indexOf(results[0].type) === -1) {
          return
        }
        var ratios = []
        angular.forEach(results, function (result) {
          var w
          var h, doc
          var photo
          if (result._ === 'botInlineMediaResult') {
            if (doc = result.document) {
              w = result.document.w
              h = result.document.h
            }
            else if (photo = result.photo) {
              var photoSize = (photo.sizes || [])[0]
              w = photoSize && photoSize.w
              h = photoSize && photoSize.h
            }
          }else {
            w = result.w
            h = result.h
          }
          if (!w || !h) {
            w = h = 1
          }
          ratios.push(w / h)
        })

        var rows = []
        var curCnt = 0
        var curW = 0
        angular.forEach(ratios, function (ratio) {
          var w = ratio * rowH
          curW += w
          if (!curCnt || curCnt < 4 && curW < (rowW * 1.1)) {
            curCnt++
          } else {
            rows.push(curCnt)
            curCnt = 1
            curW = w
          }
        })
        if (curCnt) {
          rows.push(curCnt)
        }

        var i = 0
        var thumbs = []
        var lastRowI = rows.length - 1
        angular.forEach(rows, function (rowCnt, rowI) {
          var lastRow = rowI === lastRowI
          var curRatios = ratios.slice(i, i + rowCnt)
          var sumRatios = 0
          angular.forEach(curRatios, function (ratio) {
            sumRatios += ratio
          })
          angular.forEach(curRatios, function (ratio, j) {
            var thumbH = rowH
            var thumbW = rowW * ratio / sumRatios
            var realW = thumbH * ratio
            if (lastRow && thumbW > realW) {
              thumbW = realW
            }
            var result = results[i + j]
            result.thumbW = Math.floor(thumbW) - 2
            result.thumbH = Math.floor(thumbH) - 2
          })

          i += rowCnt
        })
      } */

  public async checkSwitchReturn(botId: BotId) {
    const bot = this.appUsersManager.getUser(botId);
    if(!bot || !bot.pFlags.bot || !bot.bot_inline_placeholder) {
      return;
    }

    const peerData = this.setHash[botId];
    if(peerData) {
      delete this.setHash[botId];
      if((Date.now() - peerData.time) < 3600e3) {
        return peerData.peerId;
      }
    }
  }

  public switchInlineQuery(peerId: PeerId, threadId: number, botId: BotId, query: string) {
    const message = '@' + this.appPeersManager.getPeerUsername(botId.toPeerId()) + ' ' + query;
    this.appDraftsManager.setDraft(peerId, threadId, message);
  }

  public callbackButtonClick(peerId: PeerId, mid: number, button: any) {
    return this.apiManager.invokeApi('messages.getBotCallbackAnswer', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      msg_id: getServerMessageId(mid),
      data: button.data
    }, {/* timeout: 1,  */stopTime: -1, noErrorBox: true});
  }

  /* function gameButtonClick (id) {
    var message = AppMessagesManager.getMessage(id)
    var peerId = AppMessagesManager.getMessagePeer(message)

    return MtpApiManager.invokeApi('messages.getBotCallbackAnswer', {
      peer: AppPeersManager.getInputPeerByID(peerId),
      msg_id: AppMessagesIDsManager.getMessageLocalID(id)
    }, {timeout: 1, stopTime: -1, noErrorBox: true}).then(function (callbackAnswer) {
      if (typeof callbackAnswer.message === 'string' &&
      callbackAnswer.message.length) {
        showCallbackMessage(callbackAnswer.message, callbackAnswer.pFlags.alert)
      }
      else if (typeof callbackAnswer.url === 'string') {
        AppGamesManager.openGame(message.media.game.id, id, callbackAnswer.url)
      }
    })
  } */

  public sendInlineResult(
    peerId: PeerId,
    botId: BotId,
    queryAndResultIds: string,
    options: Parameters<AppMessagesManager['sendOther']>[0] & {
      inlineResult?: BotInlineResult
    } = {}
  ) {
    const inlineResult = options.inlineResult ?? this.inlineResults[queryAndResultIds];
    if(!inlineResult) {
      return;
    }

    this.pushPopularBot(botId);
    const splitted = queryAndResultIds.split('_');
    const queryId = splitted.shift();
    const resultId = splitted.join('_');
    options.viaBotId = botId;
    options.queryId = queryId;
    options.resultId = resultId;
    if(inlineResult.send_message.reply_markup) {
      options.replyMarkup = inlineResult.send_message.reply_markup;
    }

    if(inlineResult.send_message._ === 'botInlineMessageText') {
      this.appMessagesManager.sendText({
        ...options,
        peerId,
        text: inlineResult.send_message.message,
        entities: inlineResult.send_message.entities
      });
    } else {
      let caption = '';
      let inputMedia: Parameters<AppMessagesManager['sendOther']>[0]['inputMedia'], messageMedia: MessageMedia;
      const sendMessage = inlineResult.send_message;
      switch(sendMessage._) {
        case 'botInlineMessageMediaAuto': {
          caption = sendMessage.message;

          if(inlineResult._ === 'botInlineMediaResult') {
            const {document, photo} = inlineResult;
            if(document) {
              inputMedia = getDocumentMediaInput(document as MyDocument);
            } else {
              inputMedia = getPhotoMediaInput(photo as MyPhoto);
            }
          } else {
            const webDocument = inlineResult.content || inlineResult.thumb;

            if(webDocument) {
              if(inlineResult.type === 'photo') {
                inputMedia = {
                  _: 'inputMediaPhotoExternal',
                  pFlags: {},
                  url: webDocument.url
                };
              } else {
                inputMedia = {
                  _: 'inputMediaDocumentExternal',
                  pFlags: {},
                  url: webDocument.url
                };
              }

              options.webDocument = webDocument;
            }
          }

          break;
        }

        case 'botInlineMessageMediaGeo': {
          inputMedia = {
            _: 'inputMediaGeoPoint',
            geo_point: this.getGeoInput(sendMessage.geo)
          };

          options.geoPoint = sendMessage.geo;

          break;
        }

        case 'botInlineMessageMediaVenue': {
          inputMedia = {
            _: 'inputMediaVenue',
            geo_point: this.getGeoInput(sendMessage.geo),
            title: sendMessage.title,
            address: sendMessage.address,
            provider: sendMessage.provider,
            venue_id: sendMessage.venue_id,
            venue_type: sendMessage.venue_type
          };

          options.geoPoint = sendMessage.geo;

          break;
        }

        case 'botInlineMessageMediaContact': {
          inputMedia = {
            _: 'inputMediaContact',
            phone_number: sendMessage.phone_number,
            first_name: sendMessage.first_name,
            last_name: sendMessage.last_name,
            vcard: sendMessage.vcard
          };

          break;
        }

        case 'botInlineMessageMediaInvoice': {
          // const photo = sendMessage.photo;
          // inputMedia = {
          //   _: 'inputMediaInvoice',
          //   description: sendMessage.description,
          //   title: sendMessage.title,
          //   photo: photo && {
          //     _: 'inputWebDocument',
          //     attributes: photo.attributes,
          //     mime_type: photo.mime_type,
          //     size: photo.size,
          //     url: photo.url
          //   },
          //   invoice: undefined,
          //   payload: undefined,
          //   provider: undefined,
          //   provider_data: undefined,
          //   start_param: undefined
          // };

          messageMedia = {
            _: 'messageMediaInvoice',
            title: sendMessage.title,
            description: sendMessage.description,
            photo: sendMessage.photo,
            currency: sendMessage.currency,
            total_amount: sendMessage.total_amount,
            pFlags: {
              shipping_address_requested: sendMessage.pFlags.shipping_address_requested,
              test: sendMessage.pFlags.test
            },
            start_param: undefined
          };

          break;
        }
      }

      if(!inputMedia && messageMedia) {
        inputMedia = {
          _: 'messageMediaPending',
          messageMedia
        };
      }

      this.appMessagesManager.sendOther({...options, peerId, inputMedia});
    }
  }

  /* function checkGeoLocationAccess (botID) {
    var key = 'bot_access_geo' + botID
    return Storage.get(key).then(function (geoAccess) {
      if (geoAccess && geoAccess.granted) {
        return true
      }
      return ErrorService.confirm({
        type: 'BOT_ACCESS_GEO_INLINE'
      }).then(function () {
        var setHash = {}
        setHash[key] = {granted: true, time: tsNow()}
        Storage.set(setHash)
        return true
      }, function () {
        var setHash = {}
        setHash[key] = {denied: true, time: tsNow()}
        Storage.set(setHash)
        return $q.reject()
      })
    })
  } */
}
