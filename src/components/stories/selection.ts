import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import ListenerSetter from '@helpers/listenerSetter';
import {AppManagers} from '@lib/managers';
import {toastNew} from '@components/toast';
import confirmationPopup from '@components/confirmationPopup';
import {AppSelection} from '@components/chat/selection';
import {createSignal} from 'solid-js';
import {LangPackKey} from '../../lib/langPack';

export function toastStoryPinnedToProfile(managers: AppManagers, peerId: PeerId, pin: boolean) {
  if(peerId.isUser()) {
    return toastNew({langPackKey: pin ? 'StoryPinnedToProfile' : 'StoryArchivedFromProfile'});
  } else {
    managers.appChatsManager.isBroadcast(peerId.toChatId()).then((isBroadcast) => {
      let key: LangPackKey;
      if(isBroadcast) {
        key = pin ? 'StoryPinnedToChannel' : 'StoryArchivedFromChannel';
      } else {
        key = pin ? 'StoryPinnedToGroup' : 'StoryArchivedFromGroup';
      }

      toastNew({langPackKey: key});
    })
  }
}

export class StoriesSelection extends AppSelection {
  public isStoriesArchive: boolean;

  private mainContainer: HTMLElement;

  private readonly _setSelecting: (v: boolean) => void;
  private readonly _setCount: (v: number) => void;
  private readonly _setCantPin: (v: boolean) => void;
  private readonly _setCantDelete: (v: boolean) => void;

  public readonly selecting: () => boolean;
  public readonly count: () => number;
  public readonly cantPin: () => boolean;
  public readonly cantDelete: () => boolean;

  public forPicker: boolean;

  constructor(options: {
    container: HTMLElement,
    managers: AppManagers,
    chatId?: ChatId,
    listenerSetter: ListenerSetter,
    isArchive?: boolean,
    forPicker?: boolean
  }) {
    super({
      managers: options.managers,
      verifyTarget: (e, target) => !!target && this.isSelecting,
      getElementFromTarget: (target) => {
        let el: HTMLElement = target;
        while(el && !el.classList.contains('search-super-item')) {
          el = el.parentElement;
        }
        return el;
      },
      targetLookupClassName: 'search-super-item',
      lookupBetweenParentClassName: 'tabs-tab',
      lookupBetweenElementsQuery: '.search-super-item'
    });

    this.isStoriesArchive = options.isArchive;
    this.forPicker = options.forPicker;
    this.mainContainer = options.container;

    const [selecting, setSelecting] = createSignal(false);
    const [count, setCount] = createSignal(0);
    const [cantPin, setCantPin] = createSignal(true);
    const [cantDelete, setCantDelete] = createSignal(true);

    this.selecting = selecting;
    this._setSelecting = setSelecting;
    this.count = count;
    this._setCount = setCount;
    this.cantPin = cantPin;
    this._setCantPin = setCantPin;
    this.cantDelete = cantDelete;
    this._setCantDelete = setCantDelete;

    !IS_TOUCH_SUPPORTED && this.attachListeners(options.container, options.listenerSetter);
  }

  private getSelectedStoriesPeerId() {
    return [...this.selectedMids.keys()][0];
  }

  protected async updateContainer(forceSelection = false) {
    const size = this.selectedMids.size;
    if(!size && !forceSelection) return;

    const peerId = this.selectedMids.keys().next().value;
    const r = await this.managers.appStoriesManager.cantPinDeleteStories(peerId, Array.from(this.selectedMids.get(peerId)));
    this._setCount(this.length());
    this._setCantPin(r.cantPin);
    this._setCantDelete(r.cantDelete);
  }

  public toggleSelection(toggleCheckboxes = true, forceSelection = false) {
    const ret = super.toggleSelection(toggleCheckboxes, forceSelection || this.forPicker);

    if(ret && toggleCheckboxes) {
      const elements = Array.from(this.mainContainer.querySelectorAll('.search-super-item')) as HTMLElement[];
      elements.forEach((element) => {
        this.toggleElementCheckbox(element, this.isSelecting);
      });
    }

    return ret;
  }

  public toggleByElement = (element: HTMLElement) => {
    const mid = +element.dataset.mid;
    const peerId = element.dataset.peerId.toPeerId();

    if(!this.toggleMid(peerId, mid)) {
      return;
    }

    this.updateElementSelection(element, this.isMidSelected(peerId, mid));
  };

  public getSelectedStoryIds(peerId: PeerId) {
    const mids = this.selectedMids.get(peerId);
    if(mids?.size) {
      return [...mids];
    }

    return [];
  }

  public onDeleteStoriesClick = async(ids?: number[], peerId?: PeerId) => {
    peerId ??= this.getSelectedStoriesPeerId();
    ids ||= [...this.selectedMids.get(peerId)];
    await confirmationPopup({
      titleLangKey: ids.length === 1 ? 'DeleteStoryTitle' : 'DeleteStoriesTitle',
      descriptionLangKey: ids.length === 1 ? 'DeleteStorySubtitle' : 'DeleteStoriesSubtitle',
      descriptionLangArgs: [ids.length],
      button: {
        langKey: 'Delete',
        isDanger: true
      }
    });
    this.cancelSelection();
    this.managers.appStoriesManager.deleteStories(peerId, ids);
  };

  public onPinStoriesClick = (ids: number[], pin: boolean, peerId?: PeerId) => {
    peerId ??= this.getSelectedStoriesPeerId();
    ids ||= [...this.selectedMids.get(peerId)];
    const promise = this.managers.appStoriesManager.togglePinned(peerId, ids, pin);
    this.cancelSelection();
    promise.then(async() => {
      if(ids.length === 1) {
        toastStoryPinnedToProfile(this.managers, peerId, pin);
      } else {
        let key: LangPackKey;
        if(peerId.isUser()) {
          key = pin ? 'StorySavedTitle' : 'StoryArchived';
        } else {
          const isBroadcast = await this.managers.appChatsManager.isBroadcast(peerId.toChatId());
          if(isBroadcast) {
            key = pin ? 'StorySavedChannelTitle' : 'StoryChannelArchived';
          } else {
            key = pin ? 'StorySavedGroupTitle' : 'StoryGroupArchived';
          }
        }

        toastNew({langPackKey: key, langPackArguments: [ids.length]});
      }
    });
  };

  public onPinStoriesToTopClick = (ids?: number[], pin: boolean = true, peerId?: PeerId) => {
    peerId ??= this.getSelectedStoriesPeerId();
    ids ||= [...this.selectedMids.get(peerId)];
    const promise = this.managers.appStoriesManager.togglePinnedToTop(peerId, ids, pin);
    this.cancelSelection();
    promise.catch((err: ApiError) => {
      if(err.type === 'STORY_ID_TOO_MANY') {
        toastNew({langPackKey: 'StoriesPinLimit', langPackArguments: [+err.message]});
      }
    });
  };

  protected onToggleSelection = (forwards: boolean, animate: boolean) => {
    this._setSelecting(forwards);

    this.mainContainer.classList.toggle('is-selecting', forwards);
    if(!forwards) {
      this.selectedText = undefined;
    }
  };
}
