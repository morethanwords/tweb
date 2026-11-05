/*
 * Who a video chat shows us as: the account, or a channel we may speak as there.
 *
 * tdesktop's ChooseJoinAsProcess (calls/group/calls_choose_join_as.cpp): the list comes from
 * phone.getGroupCallJoinAs, the chat's saved choice is preselected, and the question is asked only
 * when there is one to ask — before joining ("Join Video Chat as..."), before starting a call
 * ("Start Video Chat as...") and from the call's settings ("Display me as...").
 */

import showPickUserPopup from '@components/popups/pickUser';
import PeerTitle from '@components/peerTitle';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import confirmationPopup from '@components/confirmationPopup';
import {toastNew} from '@components/toast';
import {i18n, LangPackKey} from '@lib/langPack';
import type {GroupCallJoinAsOptions} from '@appManagers/appGroupCallsManager';
import type {AppManagers} from '@lib/managers';
import type {ActiveAccountNumber} from '@lib/accounts/types';
import type GroupCallInstance from '@lib/calls/groupCallInstance';
import groupCallsController from '@lib/calls/groupCallsController';
import {CallAccount, showCallAccount} from '@lib/calls/callAccount';

export type GroupCallJoinAsContext = 'join' | 'create' | 'switch';

const TITLES: {[context in GroupCallJoinAsContext]: [group: LangPackKey, channel: LangPackKey]} = {
  join: ['VoipGroupJoinAs', 'VoipChannelJoinAs'],
  create: ['VoiceChat.StartAs', 'VoiceChat.StartAs.Channel'],
  switch: ['VoipGroupDisplayAs', 'VoipGroupDisplayAs']
};

/**
 * Whether to ask before joining (ChooseJoinAsProcess::processList): not when the account is all we
 * can be, nor when the chat's running call is joined again as whoever was chosen for it before.
 */
export function shouldAskGroupCallJoinAs(options: GroupCallJoinAsOptions, myId: PeerId, hasCall: boolean) {
  const {peerIds} = options;
  if(!peerIds.length) {
    return false;
  }

  const onlyByMe = peerIds.length === 1 && peerIds[0] === myId;
  const byAlreadyUsed = options.savedPeerId !== undefined && hasCall;
  return !onlyByMe && !byAlreadyUsed;
}

/** Whether the call's settings offer "Display me as..." (tdesktop GroupCall::showChooseJoinAs). */
export function canSwitchGroupCallJoinAs(options: GroupCallJoinAsOptions, myId: PeerId) {
  const {peerIds} = options;
  return peerIds.length > 1 || (peerIds.length === 1 && peerIds[0] !== myId);
}

/**
 * The question itself: a row per peer, the preselected one on top — the picker marks no choice of
 * its own — and a click answers it. `undefined` when it was dismissed.
 */
export function pickGroupCallJoinAs(options: {
  joinAs: GroupCallJoinAsOptions,
  selected: PeerId,
  context: GroupCallJoinAsContext,
  isBroadcast: boolean,
  myId: PeerId
}): Promise<PeerId | undefined> {
  const {joinAs, selected, myId} = options;
  const peerIds = [selected, ...joinAs.peerIds.filter((peerId) => peerId !== selected)];
  return new Promise((resolve) => {
    let chosen: PeerId;
    showPickUserPopup({
      titleLangKey: TITLES[options.context][options.isBroadcast ? 1 : 0],
      peerType: ['custom'],
      getMoreCustom: async() => ({result: peerIds, isEnd: true}),
      noSearch: true,
      // ourselves by name, not as Saved Messages
      meAsSaved: false,
      sectionCaption: 'VoipGroupStartAsInfo',
      getSubtitleForElement: (peerId) => peerId === myId ? i18n('VoipGroupPersonalAccount') : undefined,
      onSelect: (picked) => {
        chosen = picked[0]?.peerId;
      },
      onClose: () => resolve(chosen)
    });
  });
}

/** Keep a choice as the chat's default, which the next join preselects (iOS updateGroupCallJoinAsPeer). */
export function saveGroupCallJoinAs(
  managers: AppManagers,
  peerId: PeerId,
  joinAsPeerId: PeerId,
  options: GroupCallJoinAsOptions
) {
  if(joinAsPeerId === options.savedPeerId) {
    return;
  }

  managers.appGroupCallsManager.saveDefaultGroupCallJoinAs(peerId, joinAsPeerId).catch((err) => {
    console.error('save default group call join-as failed', err);
  });
}

/**
 * Whether to join the chat's running call at all: asked before a link puts us there (tdesktop's
 * JoinWithConfirm, CreateOrJoinConfirmation), naming the call by its title, or the chat when it has none — a
 * video chat, or a channel's live stream. `false` when declined.
 */
export async function showGroupCallJoinConfirmation(options: {
  peerId: PeerId,
  isBroadcast: boolean,
  accountNumber?: ActiveAccountNumber,
  callTitle?: string
}): Promise<boolean> {
  const {peerId, accountNumber, callTitle} = options;
  const title = await wrapPeerTitle({peerId, accountNumber, fromName: callTitle || undefined});
  try {
    await confirmationPopup({
      descriptionLangKey: options.isBroadcast ? 'VoiceChat.JoinConfirm.Channel' : 'VoiceChat.JoinConfirm',
      descriptionLangArgs: [title],
      button: {langKey: 'VoiceChat.Topbar.Join'}
    });
  } catch{
    return false;
  }

  return true;
}

/** The same question, about the call of the account it is joined on, and shown on that account. */
export async function confirmGroupCallJoin(account: CallAccount, peerId: PeerId, callTitle?: string): Promise<boolean> {
  const {accountNumber, managers} = account;
  const isBroadcast = await managers.appChatsManager.isBroadcast(peerId.toChatId());
  await showCallAccount(accountNumber);
  return showGroupCallJoinConfirmation({peerId, isBroadcast, accountNumber, callTitle});
}

/**
 * Who to join the video chat of `peerId` as, asking only when there is a choice to make.
 * `undefined` when the question was dismissed, the account when the list cannot be had.
 * `confirm` (a link's call): with no choice to make, whether to join at all is asked instead, naming the call by
 * `callTitle` when it has one.
 */
export async function chooseGroupCallJoinAs(options: {
  account: CallAccount,
  peerId: PeerId,
  hasCall: boolean,
  confirm?: boolean,
  callTitle?: string
}): Promise<PeerId | undefined> {
  const {account, peerId, hasCall} = options;
  const {accountNumber, managers, myId} = account;
  // * a link's call: with no one to choose to be, the one question is whether to join at all
  const confirmed = async(joinAsPeerId: PeerId) => {
    return !options.confirm || await confirmGroupCallJoin(account, peerId, options.callTitle) ? joinAsPeerId : undefined;
  };

  let joinAs: GroupCallJoinAsOptions;
  try {
    joinAs = await managers.appGroupCallsManager.getGroupCallJoinAs(peerId);
  } catch(err) {
    // tdesktop requestList: a failed request joins as the account
    console.error('group call join-as list failed', err);
    return confirmed(myId);
  }

  if(!shouldAskGroupCallJoinAs(joinAs, myId, hasCall)) {
    return confirmed(joinAs.peerIds.length ? joinAs.defaultPeerId : myId);
  }

  const isBroadcast = await managers.appChatsManager.isBroadcast(peerId.toChatId());
  // * the peers to pick are the joining account's, whichever the tab went to while the list loaded
  await showCallAccount(accountNumber);
  const chosen = await pickGroupCallJoinAs({
    joinAs,
    selected: joinAs.defaultPeerId,
    context: hasCall ? 'join' : 'create',
    isBroadcast,
    myId
  });

  if(chosen !== undefined) {
    saveGroupCallJoinAs(managers, peerId, chosen, joinAs);
  }

  return chosen;
}

/**
 * "Display me as..." in a running video chat: pick, then join again as the pick (tdesktop
 * Panel::chooseJoinAs → GroupCall::rejoinAs) and say who the others see now (Toasts::setupJoinAsChanged).
 */
export async function switchGroupCallJoinAs(options: {
  instance: GroupCallInstance,
  joinAs: GroupCallJoinAsOptions,
  isBroadcast: boolean
}): Promise<void> {
  const {instance, joinAs, isBroadcast} = options;
  const {accountNumber, managers} = instance;
  const isAlive = () => groupCallsController.isCurrentGroupCall(instance);
  const current = instance.selfPeerId;

  // * the peers to pick are the call's account's
  await showCallAccount(accountNumber);
  if(!isAlive()) {
    return;
  }

  const chosen = await pickGroupCallJoinAs({
    joinAs,
    selected: current,
    context: 'switch',
    isBroadcast,
    myId: instance.myId
  });
  if(chosen === undefined || chosen === current || !isAlive()) {
    return;
  }

  saveGroupCallJoinAs(managers, instance.chatId.toPeerId(true), chosen, joinAs);
  try {
    await groupCallsController.changeGroupCallJoinAs(instance, chosen);
  } catch(err) {
    console.error('switch group call join-as failed', err);
    if(isAlive()) {
      toastNew({langPackKey: 'Error.AnError'});
    }

    return;
  }

  if(isAlive()) {
    toastNew({
      langPackKey: isBroadcast ? 'VoipChannelUserChanged' : 'VoipGroupUserChanged',
      langPackArguments: [new PeerTitle({peerId: chosen, accountNumber}).element]
    });
  }
}
