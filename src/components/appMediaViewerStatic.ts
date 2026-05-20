import EmptyListLoader from '@helpers/emptyListLoader';
import mediaSizes from '@helpers/mediaSizes';
import {Photo} from '@layer';
import appImManager from '@lib/appImManager';
import AppMediaViewerBase from './appMediaViewerBase';
import {ButtonMenuItemOptionsVerifiable} from './buttonMenu';
import PopupElement from './popups';
import PopupForward from './popups/forward';
import appSidebarRight from './sidebarRight';
import AppSharedMediaTab from './sidebarRight/tabs/sharedMedia';
import appDownloadManager from '@lib/appDownloadManager';
import {wrapAsyncClickHandler} from '@helpers/wrapAsyncClickHandler';


export type AppMediaViewerStaticTargetType = {
  media: Photo.photo;
  element: HTMLElement;
  fromId: PeerId
  timestamp: number;
  peerId: PeerId;
  mid?: number;
};

type OpenMediaArgs = AppMediaViewerStaticTargetType & {
  allTargets?: AppMediaViewerStaticTargetType[];
  index?: number;
  fromRight: number;
};

export default class AppMediaViewerStatic extends AppMediaViewerBase<never, 'forward', AppMediaViewerStaticTargetType> {
  constructor() {
    super(new EmptyListLoader, ['forward']);

    const buttons: ButtonMenuItemOptionsVerifiable[] = [
      {
        icon: 'forward',
        text: 'Forward',
        onClick: this.onForwardClick
      }, {
        icon: 'download',
        text: 'MediaViewer.Context.Download',
        onClick: this.onDownloadClick
      }
    ];

    this.setBtnMenuToggle(buttons);

    this.setListeners();
  }

  onPrevClick = (target: AppMediaViewerStaticTargetType) => {
    this.openMedia({
      ...target,
      fromRight: -1
    });
  };

  onNextClick = (target: AppMediaViewerStaticTargetType) => {
    this.openMedia({
      ...target,
      fromRight: 1
    });
  };

  onForwardClick = () => {
    // const target = this.target;
    // if(target.mid) {
    //   // appSidebarRight.forwardTab.open([target.mid]);
    //   PopupElement.createPopup(PopupForward, {
    //     [target.peerId]: [target.mid]
    //   }, () => {
    //     return this.close();
    //   });
    // }
  };

  onAuthorClick = async(e: MouseEvent) => {
    await this.close(e)
    if(mediaSizes.isMobile) {
      const tab = appSidebarRight.getTab(AppSharedMediaTab);
      if(tab) {
        tab.close();
      }
    }

    appImManager.setInnerPeer({
      peerId: this.target.peerId
    });
  };

  onDownloadClick = wrapAsyncClickHandler(async() => {
    await appDownloadManager.downloadToDisc({media: this.target.media, queueId: appImManager.chat.bubbles.lazyLoadQueue.queueId});
  });

  public openMedia({allTargets, index, ...rest}: OpenMediaArgs) {
    const prevTargets = index !== undefined && allTargets ? allTargets.slice(0, index) : undefined;
    const nextTargets = index !== undefined && allTargets ? allTargets.slice(index + 1) : undefined;
    console.log('my-debug rest', rest)

    this._openMedia({
      prevTargets,
      nextTargets,
      target: rest.element,
      ...rest
    });
    Object.assign(this.target, {
      media: rest.media,
      element: rest.element,
      fromId: rest.fromId,
      timestamp: rest.timestamp,
      peerId: rest.peerId,
      mid: rest.mid
    });
  }
}
