/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import assumeType from '../../helpers/assumeType';
import callbackify from '../../helpers/callbackify';
import {ChatFull, Message, MessagesMessages, PublicForward, StatsBroadcastStats, StatsGraph, StatsPublicForwards} from '../../layer';
import {DcId, InvokeApiOptions} from '../../types';
import {AppManager} from './manager';
import getServerMessageId from './utils/messageId/getServerMessageId';

type GetStatsParams = {
  peerId: PeerId,
  mid?: number,
  storyId?: number,
  dark?: boolean,
  dcId?: DcId
};

export default class AppStatisticsManager extends AppManager {
  private async getInvokeOptions({peerId, dcId}: GetStatsParams) {
    const options: InvokeApiOptions = {};
    if(peerId.isUser()) {
      return options;
    }

    dcId ??= await callbackify(this.appProfileManager.getChatFull(peerId.toChatId()), async(chatFull) => {
      let dcId = (chatFull as ChatFull.channelFull).stats_dc;
      if(dcId === undefined) {
        dcId = await this.apiManager.getBaseDcId();
      }

      return dcId;
    });

    options.dcId = dcId;
    return options;
  }

  private processPublicForwards = (statsPublicForwards: StatsPublicForwards) => {
    this.appPeersManager.saveApiPeers(statsPublicForwards);
    statsPublicForwards.forwards.forEach((publicForward) => {
      (publicForward as PublicForward.publicForwardMessage).message = this.appMessagesManager.saveMessage((publicForward as PublicForward.publicForwardMessage).message);
      (publicForward as PublicForward.publicForwardStory).story = (publicForward as PublicForward.publicForwardStory).story && this.appStoriesManager.saveStoryItem(
        (publicForward as PublicForward.publicForwardStory).story,
        this.appStoriesManager.getPeerStoriesCache(this.appPeersManager.getPeerId((publicForward as PublicForward.publicForwardStory).peer))
      );
    });
    return statsPublicForwards;
  };

  public async getBroadcastStats(params: GetStatsParams): Promise<{stats: StatsBroadcastStats, dcId: DcId}> {
    const options = await this.getInvokeOptions(params);
    return this.apiManager.invokeApiSingleProcess({
      method: 'stats.getBroadcastStats',
      params: {
        channel: this.appChatsManager.getChannelInput(params.peerId.toChatId()),
        dark: params.dark
      },
      processResult: (stats) => {
        stats.recent_posts_interactions.forEach((postInteractionCounters) => {
          if(postInteractionCounters._ === 'postInteractionCountersMessage') {
            postInteractionCounters.msg_id = this.appMessagesIdsManager.generateMessageId(postInteractionCounters.msg_id, params.peerId.toChatId());
          }
        });

        return {
          stats,
          dcId: options.dcId
        };
      },
      options
    });
  }

  public loadAsyncGraph(token: string, x?: Long, dcId?: DcId): Promise<Exclude<StatsGraph, StatsGraph.statsGraphAsync>> {
    return this.apiManager.invokeApiSingleProcess({
      method: 'stats.loadAsyncGraph',
      params: {
        token,
        x
      },
      options: {dcId}
    });
  }

  public async getMegagroupStats(params: GetStatsParams) {
    const options = await this.getInvokeOptions(params);
    return this.apiManager.invokeApiSingleProcess({
      method: 'stats.getMegagroupStats',
      params: {
        channel: this.appChatsManager.getChannelInput(params.peerId.toChatId()),
        dark: params.dark
      },
      processResult: (stats) => {
        this.appPeersManager.saveApiPeers(stats);

        return {
          stats,
          dcId: options.dcId
        };
      },
      options
    });
  }

  public async getMessagePublicForwards(params: {
    peerId: PeerId,
    mid: number,
    limit: number,
    offset?: string
  }) {
    const options = await this.getInvokeOptions(params);
    return this.apiManager.invokeApiSingleProcess({
      method: 'stats.getMessagePublicForwards',
      params: {
        channel: this.appChatsManager.getChannelInput(params.peerId.toChatId()),
        msg_id: getServerMessageId(params.mid),
        offset: params.offset,
        limit: params.limit
      },
      processResult: this.processPublicForwards,
      options
    });
  }

  public async getMessageStats(params: GetStatsParams) {
    const options = await this.getInvokeOptions(params);
    return this.apiManager.invokeApiSingleProcess({
      method: 'stats.getMessageStats',
      params: {
        channel: this.appChatsManager.getChannelInput(params.peerId.toChatId()),
        dark: params.dark,
        msg_id: getServerMessageId(params.mid)
      },
      processResult: (stats) => {
        return {
          stats,
          dcId: options.dcId
        };
      },
      options
    });
  }

  public async getStoryStats(params: GetStatsParams) {
    const options = await this.getInvokeOptions(params);
    return this.apiManager.invokeApiSingleProcess({
      method: 'stats.getStoryStats',
      params: {
        peer: this.appPeersManager.getInputPeerById(params.peerId),
        dark: params.dark,
        id: params.storyId
      },
      processResult: (stats) => {
        return {
          stats,
          dcId: options.dcId
        };
      },
      options
    });
  }

  public async getStoryPublicForwards(params: {
    peerId: PeerId,
    id: number,
    limit: number,
    offset?: string
  }) {
    const options = await this.getInvokeOptions(params);
    return this.apiManager.invokeApiSingleProcess({
      method: 'stats.getStoryPublicForwards',
      params: {
        peer: this.appPeersManager.getInputPeerById(params.peerId),
        id: params.id,
        limit: params.limit,
        offset: params.offset
      },
      processResult: this.processPublicForwards,
      options
    });
  }
}
