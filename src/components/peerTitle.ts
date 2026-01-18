/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import rootScope from '@lib/rootScope';
import {i18n} from '@lib/langPack';
import replaceContent from '@helpers/dom/replaceContent';
import {HIDDEN_PEER_ID, NULL_PEER_ID} from '@appManagers/constants';
import limitSymbols from '@helpers/string/limitSymbols';
import setInnerHTML, {setDirection} from '@helpers/dom/setInnerHTML';
import safeAssign from '@helpers/object/safeAssign';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import getPeerTitle from '@components/wrappers/getPeerTitle';
import generateTitleIcons from '@components/generateTitleIcons';
import {wrapTopicIcon} from '@components/wrappers/messageActionTextNewUnsafe';
import lottieLoader from '@lib/rlottie/lottieLoader';
import {AsAllChatsType} from '@lib/appDialogsManager';
import IS_EMOJI_SUPPORTED from '@environment/emojiSupport';

export type PeerTitleOptions = {
  peerId?: PeerId,
  fromName?: string,
  plainText?: boolean,
  onlyFirstName?: boolean,
  username?: boolean,
  dialog?: boolean,
  limitSymbols?: number,
  withIcons?: boolean,
  withPremiumIcon?: boolean,
  clickableEmojiStatus?: boolean,
  threadId?: number,
  meAsNotes?: boolean,
  iconsColor?: string,
  asAllChats?: AsAllChatsType,
  wrapOptions?: WrapSomethingOptions
};

const weakMap: WeakMap<HTMLElement, PeerTitle> = new WeakMap();

rootScope.addEventListener('peer_title_edit', ({peerId, threadId}) => {
  let query = `.peer-title[data-peer-id="${peerId}"]`;
  if(threadId) {
    query += `[data-thread-id="${threadId}"]`;
  }

  const elements = Array.from(document.querySelectorAll(query)) as HTMLElement[];
  elements.forEach((element) => {
    const peerTitle = weakMap.get(element);
    peerTitle?.update();
  });
});

rootScope.addEventListener('botforum_pending_topic_created', ({peerId, tempId, newId}) => {
  if(!newId) return;

  const query = `.peer-title[data-peer-id="${peerId}"][data-thread-id="${tempId}"]`;

  const elements = Array.from(document.querySelectorAll(query)) as HTMLElement[];

  elements.forEach((element) => {
    const peerTitle = weakMap.get(element);
    peerTitle?.update({...peerTitle.options, threadId: newId});
  });
});

export default class PeerTitle {
  public element: HTMLElement;
  public options: PeerTitleOptions;
  private hasInner: boolean;

  constructor(options?: PeerTitleOptions) {
    this.element = document.createElement('span');
    this.element.classList.add('peer-title');
    setDirection(this.element);

    this.options = {};

    if(options) {
      this.update(options);
    }

    weakMap.set(this.element, this);
  }

  public setOptions(options?: PeerTitleOptions) {
    if(!options) {
      return;
    }

    safeAssign(this.options, options);
    for(const i in options) {
      // @ts-ignore
      const value = options[i];

      if(typeof(value) !== 'object' && typeof(value) !== 'function') {
        // @ts-ignore
        this.element.dataset[i] = value ? '' + (typeof(value) === 'boolean' ? +value : value) : '0';
      }
    }
  }

  private setHasInner(hasInner: boolean) {
    if(this.hasInner !== hasInner) {
      this.hasInner = hasInner;
      this.element.classList.toggle('with-icons', hasInner);
    }
  }

  public async update(options?: PeerTitleOptions) {
    this.setOptions(options);

    let fromName = this.options.fromName;
    if(fromName !== undefined) {
      if(this.options.limitSymbols !== undefined) {
        fromName = limitSymbols(fromName, this.options.limitSymbols, this.options.limitSymbols);
      }

      setInnerHTML(this.element, wrapEmojiText(fromName));
      return;
    }

    this.options.peerId ??= NULL_PEER_ID;

    let hasInner: boolean;
    const {peerId, threadId} = this.options;
    if(this.options.asAllChats === 'topics') {
      const title = i18n('AllMessages');

      const inner = document.createElement('span');
      inner.classList.add('peer-title-inner');
      hasInner = true;
      setInnerHTML(inner, title);

      const fragment = document.createDocumentFragment();
      const emojiText = document.createElement('span');
      /* !IS_EMOJI_SUPPORTED && */ emojiText.classList.add('emoji-topic-icon');
      emojiText.append(wrapEmojiText('💬'));
      fragment.append(emojiText, inner);

      setInnerHTML(this.element, fragment);
    } else if(this.options.asAllChats === 'monoforum') {
      const element = i18n('AllChats');
      replaceContent(this.element, element);
    } else if(peerId === rootScope.myId && this.options.dialog) {
      let element: HTMLElement;
      if(this.options.meAsNotes) {
        element = i18n(this.options.onlyFirstName ? 'MyNotesShort' : 'MyNotes');
      } else {
        element = i18n(this.options.onlyFirstName ? 'Saved' : 'SavedMessages');
      }

      replaceContent(this.element, element);
    } else if(peerId === HIDDEN_PEER_ID) {
      replaceContent(this.element, i18n(this.options.onlyFirstName ? 'AuthorHiddenShort' : 'AuthorHidden'));
    } else {
      if(threadId) {
        const [topic, isForum, isBotforum] = await Promise.all([
          rootScope.managers.dialogsStorage.getForumTopic(peerId, threadId),
          rootScope.managers.appPeersManager.isForum(peerId),
          rootScope.managers.appPeersManager.isBotforum(peerId)
        ]);

        if(!topic && (isForum || isBotforum)) {
          rootScope.managers.dialogsStorage.getForumTopicById(peerId, threadId).then((forumTopic) => {
            if(!forumTopic && this.options.threadId === threadId) {
              this.options.threadId = undefined;
              this.update({threadId: undefined});
              return;
            }

            this.update();
          }, () => {
            if(this.options.threadId === threadId) {
              this.options.threadId = undefined;
              this.update({threadId: undefined});
            }
          });

          setInnerHTML(this.element, i18n('Loading'));
          this.setHasInner(false);
          return;
        }
      }

      const getTopicIconPromise = threadId && this.options.withIcons ?
        rootScope.managers.dialogsStorage.getForumTopic(peerId, threadId).then((topic) => wrapTopicIcon({...(this.options.wrapOptions ?? {}), topic})) :
        undefined;

      const [title, icons, topicIcon] = await Promise.all([
        getPeerTitle(this.options as Required<PeerTitleOptions>),
        (this.options.withIcons && generateTitleIcons({peerId, clickableEmojiStatus: this.options.clickableEmojiStatus, wrapOptions: {...this.options.wrapOptions, textColor: this.options.iconsColor || this.options.wrapOptions?.textColor}})) ||
          (this.options.withPremiumIcon && generateTitleIcons({peerId, wrapOptions: {...this.options.wrapOptions, textColor: this.options.iconsColor || this.options.wrapOptions?.textColor}, noVerifiedIcon: true, noFakeIcon: true})),
        getTopicIconPromise
      ]);

      if(icons?.elements?.length || icons?.botVerification || topicIcon) {
        const inner = document.createElement('span');
        inner.classList.add('peer-title-inner');
        hasInner = true;
        setInnerHTML(inner, title);

        const fragment = document.createDocumentFragment();
        fragment.append(...[icons.botVerification, topicIcon, inner, ...(icons.elements ?? [])].filter(Boolean));

        setInnerHTML(this.element, fragment);
      } else {
        setInnerHTML(this.element, title);
      }
    }

    this.setHasInner(hasInner);
  }
}

export function changeTitleEmojiColor(element: HTMLElement, color: string) {
  const emojiStatus = element.querySelector<HTMLElement>('.emoji-status-text-color');
  const player = emojiStatus && lottieLoader.getAnimation(emojiStatus);
  if(player) {
    player.setColor(color, true);
  }
}
