import IS_TOUCH_SUPPORTED from '../../environment/touchSupport';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import handleTabSwipe from '../../helpers/dom/handleTabSwipe';
import safeAssign from '../../helpers/object/safeAssign';
import appDialogsManager from '../../lib/appManagers/appDialogsManager';
import {AppManagers} from '../../lib/appManagers/managers';
import {logger} from '../../lib/logger';
import Icon from '../icon';
import SetTransition from '../singleTransition';
import {SliderSuperTabEventable} from '../sliderTab';
import {AutonomousForumTopicList} from '../autonomousDialogList/forumTopics';
import {Register} from './register';


export class ForumTab extends SliderSuperTabEventable {
  public static register: Register<PeerId, typeof ForumTab> = new Register;


  protected rows: HTMLElement;
  protected subtitle: HTMLElement;

  public peerId: PeerId;
  private firstTime: boolean;

  protected log: ReturnType<typeof logger>;

  public xd: AutonomousForumTopicList;

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

    this.syncInit();

    if(!isFloating) {
      return this.triggerAsyncInit();
    }
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
