import MovableElement, {MovableElementOptions, MovableState} from '@components/movableElement';
import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import ListenerSetter from '@helpers/listenerSetter';
import mediaSizes, {ScreenSize} from '@helpers/mediaSizes';
import safeAssign from '@helpers/object/safeAssign';

/**
 * Whether a panel is draggable here at all (not with touch). A popup's class attribute belongs to
 * Solid, which drops the `movable-element` class MovableElement adds the next time it renders it —
 * so a popup hosting a panel lists that class itself when this holds.
 */
export const IS_MOVABLE_PANEL = !IS_TOUCH_SUPPORTED;

export default class MovablePanel {
  #movable: MovableElement;
  private listenerSetter: ListenerSetter;
  private previousState: MovableState;
  private onResize: () => void;
  private movableOptions: MovableElementOptions;

  constructor(options: {
    listenerSetter: ListenerSetter,
    previousState: MovableState,
    onResize?: (state: MovableState) => void,
    movableOptions: MovableElementOptions
  }) {
    safeAssign(this, options);

    this.toggleMovable(IS_MOVABLE_PANEL);

    this.listenerSetter.add(mediaSizes)('changeScreen', (from, to) => {
      if(to === ScreenSize.mobile || from === ScreenSize.mobile) {
        this.toggleMovable(IS_MOVABLE_PANEL);
      }
    });
  }

  public destroy() {
    const movable = this.movable;
    if(movable) {
      movable.destroy();
    }
  }

  public get movable() {
    return this.#movable;
  }

  public get state() {
    return this.movable ? this.movable.state : this.previousState;
  }

  public set state(state: MovableState) {
    this.previousState = state;
  }

  private toggleMovable(enabled: boolean) {
    let {movable} = this;
    if(enabled) {
      if(movable) {
        return;
      }

      movable = this.#movable = new MovableElement(this.movableOptions);

      movable.state = this.previousState;
      if(this.previousState.top === undefined) {
        movable.setPositionToCenter();
      }

      if(this.onResize) {
        this.listenerSetter.add(movable)('resize', this.onResize);
      }
    } else {
      if(!movable) {
        return;
      }

      this.previousState = movable.state;
      movable.destroyElements();
      movable.destroy();
      this.#movable = undefined;
    }
  }
}
