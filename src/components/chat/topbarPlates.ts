/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

/**
 * Single place where every topbar floating plate (except the per-peer
 * `pinnedMessage` plate) is constructed, mounted, and torn down. Topbar
 * holds one `plates` field, lists/peers/destroy go through here.
 *
 * The pinned-message plate is excluded because it is recreated per peer
 * (its prepare/reveal lifecycle is driven from `topbar.setupPinnedMessageForPeer`).
 */

import type Chat from '@components/chat/chat';
import type ChatTopbar from '@components/chat/topbar';
import {AppManagers} from '@lib/managers';
import IS_LIVE_STREAM_SUPPORTED from '@environment/liveStreamSupport';
import createChatRequestsPlate, {ChatRequestsPlate} from '@components/chat/requests';
import createChatActionsPlate, {ChatActionsPlate} from '@components/chat/actions';
import createChatRemoveFeePlate, {ChatRemoveFeePlate} from '@components/chat/removeFee';
import createChatLivePlate, {ChatLivePlate} from '@components/chat/topbarLive/container';
import createChatTranslationPlate, {ChatTranslationPlate} from '@components/chat/translation';
import createChatSponsoredPlate, {ChatSponsoredPlate} from '@components/chat/topbarSponsored';
import {TopbarPlateController} from '@components/chat/topbarPlate';

export type TopbarPlates = {
  requests: ChatRequestsPlate,
  actions: ChatActionsPlate,
  removeFee: ChatRemoveFeePlate,
  live: ChatLivePlate | undefined,
  translation: ChatTranslationPlate,
  sponsored: ChatSponsoredPlate,
  /** Ordered list of all constructed plates. Used by `topbar.setFloating`. */
  all: TopbarPlateController[],
  /** Mount every plate's container into the given host. */
  mount: (host: HTMLElement) => void,
  destroy: () => void
};

export function createTopbarPlates(
  topbar: ChatTopbar,
  chat: Chat,
  managers: AppManagers
): TopbarPlates {
  const requests = createChatRequestsPlate(topbar, chat, managers);
  const actions = createChatActionsPlate(topbar, chat, managers);
  const live = IS_LIVE_STREAM_SUPPORTED ? createChatLivePlate(topbar, chat, managers) : undefined;
  const translation = createChatTranslationPlate(topbar, chat, managers);
  const removeFee = createChatRemoveFeePlate(topbar, chat, managers);
  const sponsored = createChatSponsoredPlate(topbar, chat, managers);

  // Order matches the visual stack inside `floatingPlatesWrapper`.
  const all = [requests, actions, live, translation, removeFee, sponsored].filter(Boolean);

  return {
    requests,
    actions,
    removeFee,
    live,
    translation,
    sponsored,
    all,
    mount: (host) => host.append(...all.map((plate) => plate.container)),
    destroy: () => all.forEach((plate) => plate.destroy())
  };
}
