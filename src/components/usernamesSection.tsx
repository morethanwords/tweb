import {createMemo, createSignal, For, onCleanup} from 'solid-js';
import placeCaretAtEnd from '@helpers/dom/placeCaretAtEnd';
import ListenerSetter from '@helpers/listenerSetter';
import noop from '@helpers/noop';
import {Chat, User, Username} from '@layer';
import {i18n, LangPackKey} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import confirmationPopup from '@components/confirmationPopup';
import Section from '@components/section';
import UsernameRow from '@components/usernameRow';
import {UsernameInputField} from '@components/usernameInputField';
import {createSortableList} from '@helpers/solid/createSortableList';

const cloneUsernames = (usernames: Username[] = []) => usernames.map((username) => ({
  ...username,
  pFlags: {...username.pFlags}
}) as Username);

export default function UsernamesSection(props: {
  peerId: PeerId,
  peer: Chat.channel | User.user,
  usernameInputField: UsernameInputField
}) {
  const managers = rootScope.managers;
  const channelId = props.peerId.isUser() ? undefined : props.peerId.toChatId();
  const botId = (props.peer as User.user).pFlags.bot ? props.peerId.toUserId() : undefined;
  const [usernames, setUsernames] = createSignal(cloneUsernames(props.peer.usernames));
  const activeUsernames = createMemo(() => usernames().filter((username) => username.pFlags.active));
  const listenerSetter = new ListenerSetter();
  let list: HTMLDivElement;

  listenerSetter.add(rootScope)('peer_title_edit', async({peerId}) => {
    if(peerId !== props.peerId) return;

    const peer = await managers.appPeersManager.getPeer(props.peerId);
    setUsernames(cloneUsernames((peer as User.user).usernames));
  });

  const sortable = createSortableList({
    container: () => list,
    items: activeUsernames,
    getId: (username) => username.username,
    onReorder: (nextActiveUsernames) => {
      const inactiveUsernames = usernames().filter((username) => !username.pFlags.active);
      setUsernames([...nextActiveUsernames, ...inactiveUsernames]);
      managers.appUsernamesManager.reorderUsernames({
        peerId: props.peerId,
        order: nextActiveUsernames.map((username) => username.username)
      });
    }
  });

  onCleanup(() => listenerSetter.removeAll());

  const onUsernameClick = async(username: Username) => {
    if(username.pFlags.editable) {
      if(!botId) placeCaretAtEnd(props.usernameInputField.input, true, true);
      return;
    }

    const active = !!username.pFlags.active;
    let titleLangKey: LangPackKey, descriptionLangKey: LangPackKey;
    if(active) {
      titleLangKey = 'UsernameDeactivateLink';
      descriptionLangKey = botId ?
        'UsernameDeactivateLinkBotMessage' :
        (channelId ? 'UsernameDeactivateLinkChannelMessage' : 'UsernameDeactivateLinkProfileMessage');
    } else {
      titleLangKey = 'UsernameActivateLink';
      descriptionLangKey = botId ?
        'UsernameActivateLinkBotMessage' :
        (channelId ? 'UsernameActivateLinkChannelMessage' : 'UsernameActivateLinkProfileMessage');
    }

    try {
      await confirmationPopup({
        titleLangKey,
        descriptionLangKey,
        button: {langKey: active ? 'Hide' : 'Show'}
      });
    } catch(err) {
      return;
    }

    managers.appUsernamesManager.toggleUsername({
      peerId: props.peerId,
      username: username.username,
      active: !active
    }).catch((err: ApiError) => {
      if(err.type === 'USERNAMES_ACTIVE_TOO_MUCH') {
        confirmationPopup({
          titleLangKey: 'UsernameActivateErrorTitle',
          descriptionLangKey: 'UsernameActivateErrorMessage',
          button: {langKey: 'OK', isCancel: true}
        }).catch(noop);
      } else {
        console.error('turn username error', err);
      }
    });
  };

  return (
    <Section
      classList={{hide: !usernames().length}}
      name="UsernamesProfileHeader"
      caption={botId ?
        'UsernamesBotHelp' :
        (!props.peerId.isUser() ? 'UsernamesChannelHelp' : 'UsernamesProfileHelp')}
    >
      <div ref={list} class="usernames">
        <For each={usernames()}>{(username) => {
          const active = !!username.pFlags.active;
          const editable = !!username.pFlags.editable;
          const sortId = username.username;
          return (
            <UsernameRow
              ref={active ? sortable.itemRef(sortId) : undefined}
              active={active}
              sortable
              sortingEnabled={active}
              dragging={sortable.draggingId() === sortId}
              sortHandlePointerDown={active ? sortable.dragHandleProps(sortId).onPointerDown : undefined}
              style={active ? sortable.itemStyle(sortId) : undefined}
              title={'@' + username.username}
              subtitle={i18n(editable ?
                (botId ? 'UsernameLinkBotUsername' : 'UsernameLinkEditable') :
                (active ? 'UsernameLinkActive' : 'UsernameLinkInactive'))}
              clickable={() => onUsernameClick(username)}
            />
          );
        }}</For>
      </div>
    </Section>
  );
}
