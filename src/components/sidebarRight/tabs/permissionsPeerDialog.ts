import getUserStatusString from '@components/wrappers/getUserStatusString';
import type {Middleware} from '@helpers/middleware';
import type {User} from '@layer';
import appDialogsManager from '@lib/appDialogsManager';

export default function appendPermissionsPeerDialog(options: {
  /** The section's content element … */
  content: HTMLElement,
  /** … and its title, which the peer row is placed above. */
  title: HTMLElement,
  userId: UserId,
  user: User.user,
  middleware: Middleware
}) {
  const container = document.createElement('div');
  container.classList.add('chatlist-container');
  options.content.insertBefore(container, options.title);

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
