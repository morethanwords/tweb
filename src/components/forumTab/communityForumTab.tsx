import {createEffect, createRoot} from 'solid-js';
import {render} from 'solid-js/web';
import appDialogsManager from '@lib/appDialogsManager';
import appImManager from '@lib/appImManager';
import {AppManagers} from '@lib/managers';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import {
  AutonomousCommunityDialogList
} from '@components/autonomousDialogList/communityDialogs';
import appSidebarLeft from '@components/sidebarLeft';
import ButtonMenuToggle from '@components/buttonMenuToggle';
import {i18n} from '@lib/langPack';
import {toast} from '@components/toast';
import CommunityChats, {
  CommunityLinkedChatKind
} from '@components/forumTab/communityChats';
import {
  shouldCloseCommunityForum
} from '@components/forumTab/communityChatsModel';
import {ForumTab} from '@components/forumTab/forumTab';
import {
  AppAddChatToCommunityTab,
  AppEditCommunityTab
} from '@components/solidJsTabs/tabs';
import {
  useCommunity,
  useCommunityDialog,
  useJoinedCommunities
} from '@stores/communities';
import openCommunityPendingRequests
from '@components/communities/openCommunityPendingRequests';
import openCommunityLinkedChat
from '@components/communities/openCommunityLinkedChat';


export class CommunityForumTab extends ForumTab {
  public xd: AutonomousCommunityDialogList;

  private dispose?: () => void;
  private membershipDispose?: () => void;
  private membershipCloseRequested = false;
  private pendingRequestsPromise?: Promise<void>;
  private joiningPeerIds = new Set<PeerId>();

  protected syncInit(): void {
    super.syncInit();
    this.container.classList.add('community-forum-tab');

    this.xd = new AutonomousCommunityDialogList({
      appDialogsManager,
      communityId: this.peerId.toChatId(),
      middleware: this.middlewareHelper.get()
    });

    const mount = document.createElement('div');
    this.scrollable.append(mount);
    this.dispose = render(() => (
      <SolidJSHotReloadGuardProvider>
        <CommunityChats tab={this} />
      </SolidJSHotReloadGuardProvider>
    ), mount);

    const communityId = this.peerId.toChatId();
    this.membershipDispose = createRoot((dispose) => {
      const community = useCommunity(() => communityId);
      const communityDialog = useCommunityDialog(() => communityId);
      const joinedCommunities = useJoinedCommunities();
      let hadCommunityDialog = !!communityDialog();

      createEffect(() => {
        const currentDialog = communityDialog();
        hadCommunityDialog ||= !!currentDialog;
        if(
          !this.membershipCloseRequested &&
          shouldCloseCommunityForum({
            communityId,
            community: community(),
            communityDialog: currentDialog,
            joinedCommunities: joinedCommunities(),
            hadCommunityDialog
          })
        ) {
          this.membershipCloseRequested = true;
          queueMicrotask(this._close);
        }
      });

      return dispose;
    });
  }

  public init(options: {
    peerId: PeerId,
    managers: AppManagers
  }) {
    const result = super.init(options);

    const menu = ButtonMenuToggle({
      listenerSetter: this.listenerSetter,
      direction: 'bottom-left',
      buttons: [{
        icon: 'edit',
        text: 'Community.Edit',
        onClick: this.openEdit,
        verify: this.canEditCommunity
      }]
    });

    this.header.append(menu);
    return result;
  }

  protected async asyncInit(): Promise<void> {
    await super.asyncInit();
  }

  public openLinkedChat = async(options: {
    peerId: PeerId,
    kind: CommunityLinkedChatKind,
    visible?: boolean
  }) => {
    return openCommunityLinkedChat({
      ...options,
      communityId: this.peerId.toChatId(),
      managers: this.managers,
      joiningPeerIds: this.joiningPeerIds,
      openPeer: this.openChat
    });
  };

  public loadPendingRequests = () => {
    if(this.pendingRequestsPromise) {
      return this.pendingRequestsPromise;
    }

    const promise = this.managers.appCommunitiesManager
    .getPeerLinkRequests({
      communityId: this.peerId.toChatId(),
      limit: 100
    })
    .then<void>(() => {})
    .finally(() => {
      if(this.pendingRequestsPromise === promise) {
        this.pendingRequestsPromise = undefined;
      }
    });
    this.pendingRequestsPromise = promise;
    return promise;
  };

  public openPendingRequests = () => {
    void openCommunityPendingRequests({
      slider: appSidebarLeft,
      communityId: this.peerId.toChatId()
    });
  };

  public openAddChat = () => {
    appSidebarLeft.createTab(AppAddChatToCommunityTab).open({
      communityId: this.peerId.toChatId()
    });
  };

  private openChat = async(peerId: PeerId) => {
    await appImManager.setPeer({peerId});
  };

  public toggleAsOne = async(collapsed: boolean) => {
    try {
      await this.managers.appCommunitiesManager.toggleCollapsedInDialogs(
        this.peerId.toChatId(),
        collapsed
      );
    } catch(error) {
      toast((error as ApiError)?.type || i18n('Error.AnError'));
    }
  };

  private canEditCommunity = () => {
    return this.managers.appCommunitiesManager.canEditCommunity(
      this.peerId.toChatId()
    );
  };

  private openEdit = async() => {
    if(!await this.canEditCommunity()) {
      return;
    }

    appSidebarLeft.createTab(AppEditCommunityTab).open({
      communityId: this.peerId.toChatId()
    });
  };

  public onCloseAfterTimeout() {
    this.membershipDispose?.();
    this.membershipDispose = undefined;
    this.dispose?.();
    this.dispose = undefined;
    super.onCloseAfterTimeout();
  }
}
