import {Component, createSignal, onMount, Show} from 'solid-js';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import findUpTag from '@helpers/dom/findUpTag';
import replaceContent from '@helpers/dom/replaceContent';
import ScrollableLoader from '@helpers/scrollableLoader';
import {ChannelParticipant, Chat, ChatBannedRights, ChatFull} from '@layer';
import appDialogsManager, {DialogDom, DIALOG_LIST_ELEMENT_TAG} from '@lib/appDialogsManager';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import {i18n, join, LangPackKey} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import showPickUserPopup from '@components/popups/pickUser';
import Row from '@components/row';
import Section from '@components/section';
import {openUserPermissionsTab} from '@components/solidJsTabs/tabs';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import apiManagerProxy from '@lib/apiManagerProxy';
import RangeStepsSelector from '@components/rangeStepsSelector';
import formatDuration from '@helpers/formatDuration';
import {wrapFormattedDuration} from '@components/wrappers/wrapDuration';
import {handleChannelsTooMuch} from '@components/popups/channelsTooMuch';
import createDoNotRestrictBoostersSection from '@components/sidebarRight/tabs/groupPermissions/doNotRestrictBoostersSection';
import showConvertToGigagroupPopup from '@components/popups/convertToGigagroup';
import {ChatPermissions, createSolidTabState} from './sharedPermissions';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import type {AppGroupPermissionsTab} from '@components/solidJsTabs/tabs';

const GroupPermissions: Component = () => {
  const [tab] = useSuperTab<typeof AppGroupPermissionsTab>();
  const promiseCollector = usePromiseCollector();
  const {HotReloadGuard} = useHotReloadGuard();

  let chatId = tab.payload.chatId;

  const saveCallbacks: Array<() => any> = [];
  const participants: Map<PeerId, ChannelParticipant.channelParticipantBanned> = new Map();

  const solidState = createSolidTabState<{
    rights?: ChatBannedRights.chatBannedRights,
    stars?: number,
    slowModeSeconds?: number,
    boostsUnrestrict?: number
  }>({
    tab,
    save: async() => {
      for(const callback of saveCallbacks) {
        await callback();
      }
    },
    unsavedConfirmationProps: {
      descriptionLangKey: 'UnsavedChangesDescription.Group'
    }
  });

  let permissionsContent!: HTMLDivElement;
  let slowmodeContent!: HTMLDivElement;
  let exceptionsAdd!: HTMLDivElement;
  let exceptionsList!: HTMLDivElement;
  const [chargeElement, setChargeElement] = createSignal<HTMLElement>();
  const [boostersElement, setBoostersElement] = createSignal<HTMLElement>();
  const [convertRow, setConvertRow] = createSignal<HTMLElement>();
  const [slowmodeCaption, setSlowmodeCaption] = createSignal<HTMLElement>();

  const build = async() => {
    const chat = apiManagerProxy.getChat(chatId);
    const isChannel = chat._ === 'channel';

    const chatPermissions = new ChatPermissions({
      chatId: chatId,
      listenerSetter: tab.listenerSetter,
      appendTo: permissionsContent,
      forChat: true,
      onSomethingChanged: () => {
        solidState.set({rights: chatPermissions.takeOut()});
      }
    }, tab.managers);

    solidState.setInitial({rights: chatPermissions.takeOut()});

    saveCallbacks.push(() => {
      return tab.managers.appChatsManager.editChatDefaultBannedRights(chatId, chatPermissions.takeOut());
    });

    if(isChannel) {
      const {default: createChargeForMessagesSection} = await import('./chargeForMessasgesSection');

      const initialStars = +chat.send_paid_messages_stars || 0;
      solidState.setInitial({stars: initialStars});

      const {element, dispose, promise} = createChargeForMessagesSection(
        {
          initialStars,
          onStarsChange: (stars) => void solidState.set({stars})
        },
        HotReloadGuard
      );

      await promise;

      setChargeElement(element);

      tab.middlewareHelper.get().onDestroy(() => void dispose());

      saveCallbacks.push(() => {
        const {stars} = solidState.store;

        if(initialStars === stars) return;
        return tab.managers.appChatsManager.updateChannelPaidMessagesPrice(chat.id, stars);
      });
    }

    const chatFull = await tab.managers.appProfileManager.getChatFull(chatId);

    {
      let lastValue: number;
      const range: RangeStepsSelector<number> = new RangeStepsSelector({
        generateStep: (value) => {
          let t: HTMLElement;
          if(!value) {
            t = i18n('SlowmodeOff');
          } else {
            const hours = Math.floor(value / 3600);
            const minutes = Math.floor(value / 60) % 60;
            const seconds = value % 60;
            if(hours) {
              t = i18n('SlowmodeHours', [hours]);
            } else if(minutes) {
              t = i18n('SlowmodeMinutes', [minutes]);
            } else {
              t = i18n('SlowmodeSeconds', [seconds]);
            }
          }

          return [t, value];
        },
        onValue: (value) => {
          if(lastValue === value) {
            return;
          }

          solidState.set({slowModeSeconds: value});

          lastValue = value;
          setSlowmodeCaption(value ?
            i18n('SlowmodeInfoSelected', [wrapFormattedDuration(formatDuration(value, 1))]) :
            i18n('SlowmodeInfoOff'));
        },
        middleware: tab.middlewareHelper.get()
      });

      const values = [0, 5, 10, 30, 60, 300, 900, 3600];
      const steps = range.generateSteps(values);
      const initialValue = (chatFull as ChatFull.channelFull).slowmode_seconds || 0;

      solidState.setInitial({slowModeSeconds: initialValue});
      range.setSteps(steps, values.indexOf(initialValue));

      slowmodeContent.append(range.container);

      saveCallbacks.push(() => {
        const {value} = range;
        if(value !== initialValue) {
          return handleChannelsTooMuch(() => {
            return tab.managers.appChatsManager.toggleSlowMode(chatId, value);
          });
        }
      });
    }

    if(isChannel) {
      const initialBoosts = (chatFull as ChatFull.channelFull).boosts_unrestrict;
      const {element, dispose} = createDoNotRestrictBoostersSection({
        initialBoosts,
        onChange: (value) => {
          solidState.set({boostsUnrestrict: value});
        },
        show: () => !!solidState.store.slowModeSeconds
      });
      solidState.setInitial({boostsUnrestrict: initialBoosts});
      tab.middlewareHelper.get().onDestroy(dispose);
      setBoostersElement(element);

      saveCallbacks.push(() => {
        const {boostsUnrestrict} = solidState.store;
        if(initialBoosts === boostsUnrestrict) {
          return;
        }

        return tab.managers.appChatsManager.setBoostsToUnblockRestrictions(
          chatId,
          boostsUnrestrict
        );
      });
    }

    if(isChannel) {
      const channel = chat as Chat.channel;
      const flags = channel.pFlags;
      if(flags.creator && flags.megagroup && !flags.gigagroup) {
        const config = await tab.managers.apiManager.getConfig();
        const participantsCount = (chatFull as ChatFull.channelFull).participants_count ||
          channel.participants_count || 0;
        if(participantsCount >= config.megagroup_size_max - 1000) {
          const row = new Row({
            titleLangKey: 'BroadcastGroupConvert',
            icon: 'newgroup_filled',
            clickable: () => {
              showConvertToGigagroupPopup(chatId);
            },
            listenerSetter: tab.listenerSetter
          });

          setConvertRow(row.container);
        }
      }
    }

    {
      const addExceptionRow = new Row({
        titleLangKey: 'ChannelAddException',
        subtitleLangKey: 'Loading',
        icon: 'adduser',
        clickable: () => {
          showPickUserPopup({
            titleLangKey: 'Exceptions',
            peerType: ['channelParticipants'],
            onSelect: (chosen) => {
              setTimeout(() => {
                openPermissions(chosen[0].peerId);
              }, 0);
            },
            placeholder: 'ExceptionModal.Search.Placeholder',
            peerId: -chatId,
            exceptSelf: true
          });
        },
        listenerSetter: tab.listenerSetter
      });

      const openPermissions = async(peerId: PeerId) => {
        let participant = participants.get(peerId);
        if(!participant) {
          try {
            participant = await tab.managers.appProfileManager.getParticipant(chatId, peerId) as typeof participant;
          } catch(err) {
            return;
          }
        }

        openUserPermissionsTab(tab.slider, chatId, participant);
      };

      exceptionsAdd.append(addExceptionRow.container);

      const list = appDialogsManager.createChatList({new: true});
      exceptionsList.append(list);

      attachClickEvent(list, (e) => {
        const target = findUpTag(e.target, DIALOG_LIST_ELEMENT_TAG);
        if(!target) return;

        const peerId = target.dataset.peerId.toPeerId();
        openPermissions(peerId);
      }, {listenerSetter: tab.listenerSetter});

      const setSubtitle = async(dom: DialogDom, participant: ChannelParticipant.channelParticipantBanned) => {
        const bannedRights = participant.banned_rights;
        const defaultBannedRights = ((await tab.managers.appChatsManager.getChat(chatId)) as Chat.channel).default_banned_rights;

        const cantWhat: LangPackKey[] = [];
        chatPermissions.fields.forEach((info) => {
          const mainFlag = info.flags[0];
          // @ts-ignore
          if(bannedRights.pFlags[mainFlag] && !defaultBannedRights.pFlags[mainFlag]) {
            cantWhat.push(info.exceptionText);
          // @ts-ignore
          }
        });

        const el = dom.lastMessageSpan as HTMLElement;

        if(cantWhat.length) {
          el.replaceChildren(...join(cantWhat.map((t) => i18n(t)), false));
          el.classList.toggle('hide', !cantWhat.length);
        } else {
          el.replaceChildren(i18n('UserRestrictionsBy', [await wrapPeerTitle({peerId: participant.kicked_by.toPeerId(false)})]));
          el.classList.remove('hide');
        }
      };

      const add = (participant: ChannelParticipant.channelParticipantBanned, append: boolean) => {
        const peerId = getPeerId(participant.peer);
        const dialogElement = appDialogsManager.addDialogNew({
          peerId,
          container: list,
          rippleEnabled: true,
          avatarSize: 'abitbigger',
          append,
          wrapOptions: {
            middleware: tab.middlewareHelper.get()
          }
        });

        participants.set(peerId, participant);

        (dialogElement.dom.listEl as any).dialogElement = dialogElement;

        setSubtitle(dialogElement.dom, participant);
      };

      tab.listenerSetter.add(rootScope)('chat_participant', (update) => {
        const newParticipant = update.new_participant as ChannelParticipant.channelParticipantBanned;
        const prevParticipant = update.prev_participant;
        const peerId = update.user_id.toPeerId(false);
        const needAdd = newParticipant?._ === 'channelParticipantBanned' &&
          !newParticipant.banned_rights.pFlags.view_messages;

        if(newParticipant) {
          participants.set(peerId, newParticipant);
        } else {
          participants.delete(peerId);
        }

        const li = list.querySelector(`[data-peer-id="${peerId}"]`);
        if(needAdd) {
          if(!li) {
            add(newParticipant, false);
          } else {
            setSubtitle((li as any).dialogElement.dom, newParticipant);
          }

          if(prevParticipant?._ !== 'channelParticipantBanned') {
            ++exceptionsCount;
          }
        } else {
          if(li) {
            (li as any).dialogElement.remove();
          }

          if(prevParticipant?._ === 'channelParticipantBanned') {
            --exceptionsCount;
          }
        }

        setLength();
      });

      const setLength = () => {
        const el = i18n(exceptionsCount ? 'Permissions.ExceptionsCount' : 'Permissions.NoExceptions', [exceptionsCount]);
        replaceContent(addExceptionRow.subtitle, el);
      };

      let exceptionsCount = 0;
      let loader: ScrollableLoader;
      const setLoader = () => {
        const LOAD_COUNT = 50;
        loader = new ScrollableLoader({
          scrollable: tab.scrollable,
          getPromise: () => {
            return tab.managers.appProfileManager.getChannelParticipants({
              id: chatId,
              filter: {_: 'channelParticipantsBanned', q: ''},
              limit: LOAD_COUNT,
              offset: list.childElementCount
            }).then((res) => {
              for(const participant of res.participants) {
                add(participant as ChannelParticipant.channelParticipantBanned, true);
              }

              exceptionsCount = res.count;
              setLength();

              return res.participants.length < LOAD_COUNT || res.count === list.childElementCount;
            });
          }
        });

        return loader.load();
      };

      if(await tab.managers.appChatsManager.isChannel(chatId)) {
        await setLoader();
      } else {
        setLength();

        tab.listenerSetter.add(rootScope)('dialog_migrate', ({migrateFrom, migrateTo}) => {
          if(chatId === migrateFrom) {
            chatId = migrateTo;
            setLoader();
          }
        });
      }
    }
  };

  onMount(() => {
    tab.container.classList.add('edit-peer-container', 'group-permissions-container');
    tab.header.append(solidState.saveIcon());
    promiseCollector.collect(build());
  });

  return (
    <>
      <Section name="ChannelPermissionsHeader">
        <div ref={permissionsContent} />
      </Section>
      {chargeElement()}
      <Section name="Slowmode" caption={slowmodeCaption()}>
        <div ref={slowmodeContent} />
      </Section>
      {boostersElement()}
      <Show when={convertRow()}>
        <Section name="BroadcastGroup" caption="BroadcastGroupConvertInfo">
          {convertRow()}
        </Section>
      </Show>
      <Section name="PrivacyExceptions">
        <div ref={exceptionsAdd} />
        <div ref={exceptionsList} class="chatlist-container" />
      </Section>
    </>
  );
};

export default GroupPermissions;
