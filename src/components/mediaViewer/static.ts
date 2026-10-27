import EmptyListLoader from '@helpers/emptyListLoader';
import mediaSizes from '@helpers/mediaSizes';
import {Photo, Document} from '@layer';
import AppMediaViewerBase from '@components/mediaViewer/base';
import {ButtonMenuItemOptionsVerifiable} from '@components/buttonMenu';
import AppSharedMediaTab from '@components/sidebarRight/tabs/sharedMediaTab';
import appDownloadManager from '@lib/appDownloadManager';
import {wrapAsyncClickHandler} from '@helpers/wrapAsyncClickHandler';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';


export type AppMediaViewerStaticTargetType = {
  media: Photo.photo | Document.document;
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

  protected setListeners(): void {
    super.setListeners();
    attachClickEvent(this.buttons.forward, this.onForwardClick);
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
    const target = this.target;
    if(target.mid) {
      hotReloadGuard.showForwardPopup({
        [target.peerId]: [target.mid]
      }, undefined, undefined, () => {
        return this.close();
      });
    }
  };

  onAuthorClick = async(e: MouseEvent) => {
    await this.close(e)
    if(mediaSizes.isMobile) {
      const tab = hotReloadGuard.appSidebarRight.getTab(AppSharedMediaTab);
      if(tab) {
        tab.close();
      }
    }

    hotReloadGuard.appImManager.setInnerPeer({
      peerId: this.target.peerId
    });
  };

  onDownloadClick = wrapAsyncClickHandler(async() => {
    await appDownloadManager.downloadToDisc({media: this.target.media, queueId: hotReloadGuard.appImManager.chat.bubbles.lazyLoadQueue.queueId});
  });

  public openMedia({allTargets, index, ...rest}: OpenMediaArgs) {
    const prevTargets = index !== undefined && allTargets ? allTargets.slice(0, index) : undefined;
    const nextTargets = index !== undefined && allTargets ? allTargets.slice(index + 1) : undefined;
    console.log('my-debug rest', rest)
    if(this.isAskedTooLate()) return;

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
