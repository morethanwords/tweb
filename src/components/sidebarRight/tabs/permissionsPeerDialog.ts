import type SettingSection from '@components/settingSection';
import getUserStatusString from '@components/wrappers/getUserStatusString';
import type {Middleware} from '@helpers/middleware';
import type {User} from '@layer';
import appDialogsManager from '@lib/appDialogsManager';

export default function appendPermissionsPeerDialog(options: {
  section: SettingSection,
  userId: UserId,
  user: User.user,
  middleware: Middleware
}) {
  const container = document.createElement('div');
  container.classList.add('chatlist-container');
  options.section.content.insertBefore(container, options.section.title);

  const list = appDialogsManager.createChatList({new: true});
  container.append(list);

  const {dom} = appDialogsManager.addDialogNew({
    peerId: options.userId.toPeerId(false),
    container: list,
    rippleEnabled: true,
    avatarSize: 'abitbigger',
    meAsSaved: false,
    wrapOptions: {
      middleware: options.middleware
    }
  });

  dom.lastMessageSpan.append(getUserStatusString(options.user));
}
