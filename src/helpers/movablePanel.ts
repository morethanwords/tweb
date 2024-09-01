/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import MovableElement, {MovableElementOptions, MovableState} from '../components/movableElement';
import IS_TOUCH_SUPPORTED from '../environment/touchSupport';
import ListenerSetter from './listenerSetter';
import mediaSizes, {ScreenSize} from './mediaSizes';
import safeAssign from './object/safeAssign';

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

    this.toggleMovable(!IS_TOUCH_SUPPORTED);

    this.listenerSetter.add(mediaSizes)('changeScreen', (from, to) => {
      if(to === ScreenSize.mobile || from === ScreenSize.mobile) {
        this.toggleMovable(!IS_TOUCH_SUPPORTED);
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
