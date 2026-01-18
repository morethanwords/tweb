import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import handleTabSwipe from '@helpers/dom/handleTabSwipe';
import liteMode from '@helpers/liteMode';
import safeAssign from '@helpers/object/safeAssign';
import pause from '@helpers/schedulers/pause';
import appDialogsManager from '@lib/appDialogsManager';
import {AppManagers} from '@lib/managers';
import {logger} from '@lib/logger';
import {AutonomousDialogListBase} from '@components/autonomousDialogList/base';
import ButtonIcon from '@components/buttonIcon';
import Icon from '@components/icon';
import appSidebarLeft from '@components/sidebarLeft';
import {MAX_SIDEBAR_WIDTH} from '@components/sidebarLeft/constants';
import SetTransition from '@components/singleTransition';
import {SliderSuperTabEventable} from '@components/sliderTab';
import {Register} from '@components/forumTab/register';


export class ForumTab extends SliderSuperTabEventable {
  public static register: Register<PeerId, typeof ForumTab> = new Register;


  protected rows: HTMLElement;
  protected subtitle: HTMLElement;

  public peerId: PeerId;
  private firstTime: boolean;

  protected log: ReturnType<typeof logger>;

  public xd: AutonomousDialogListBase;

  public async toggle(value: boolean) {
    if(this.triggerAsyncInit) {
      await this.triggerAsyncInit();
    }

    SetTransition({
      element: this.container,
      className: 'is-visible',
      forwards: value,
      duration: 300,
      onTransitionEnd: !value ? () => {
        this.onCloseAfterTimeout();
      } : undefined,
      useRafs: this.firstTime ? (this.firstTime = undefined, 2) : undefined
    });
  }

  protected _close = () => {
    if(!this.slider) {
      appDialogsManager.toggleForumTab(undefined, this);
    } else {
      this.close();
    }
  };

  protected syncInit(): void {
  }

  protected async asyncInit(): Promise<void> {
    this.xd.onChatsScroll();
  }

  public init(options: {
    peerId: PeerId,
    managers: AppManagers
  }) {
    safeAssign(this, options);

    this.log = logger('FORUM');
    this.firstTime = true;
    this.container.classList.add('topics-container');

    const isFloating = !this.slider;
    if(isFloating) {
      this.closeBtn.replaceChildren(Icon('close'));
      this.container.classList.add('active', 'is-floating');

      attachClickEvent(this.closeBtn, this._close, {listenerSetter: this.listenerSetter});
    }

    this.rows = document.createElement('div');
    this.rows.classList.add('sidebar-header__rows');

    this.subtitle = document.createElement('div');
    this.subtitle.classList.add('sidebar-header__subtitle');

    this.title.replaceWith(this.rows);
    this.rows.append(this.title, this.subtitle);

    if(IS_TOUCH_SUPPORTED) {
      handleTabSwipe({
        element: this.container,
        onSwipe: () => {
          appDialogsManager.toggleForumTab(undefined, this);
        },
        middleware: this.middlewareHelper.get()
      });
    }

    const searchButton = ButtonIcon('search');
    attachClickEvent(searchButton, async() => {
      appSidebarLeft.closeEverythingInside();
      if(liteMode.isAvailable('animations')) await pause(400);
      appSidebarLeft.initSearch().openWithPeerId(this.peerId);
    });

    this.header.append(searchButton);

    this.syncInit();

    this.xd.getRectFromForPlaceholder = this.getRectFromForPlaceholder;

    if(!isFloating) {
      return this.triggerAsyncInit();
    }
  }

  protected getRectFromForPlaceholder = () => {
    const isFloating = !this.slider;

    return (): DOMRectEditable => {
      const sidebarRect = appSidebarLeft.rect;
      const paddingY = 56;
      const paddingX = isFloating ? 80 : 0;
      const isCollapsed = appSidebarLeft.isCollapsed();
      const originalWidth = isCollapsed ? MAX_SIDEBAR_WIDTH : sidebarRect.width;
      const width = isFloating ? originalWidth - paddingX : originalWidth;

      return {
        top: paddingY,
        right: sidebarRect.right,
        bottom: 0,
        left: paddingX,
        width,
        height: sidebarRect.height - paddingY
      };
    };
  }

  public async triggerAsyncInit() {
    this.triggerAsyncInit = undefined;

    return this.asyncInit();
  }

  public onCloseAfterTimeout() {
    super.onCloseAfterTimeout();
    this.xd.destroy();
  }
}
