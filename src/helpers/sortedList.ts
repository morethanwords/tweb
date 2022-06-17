/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import insertInDescendSortedArray from "./array/insertInDescendSortedArray";
import { getMiddleware } from "./middleware";
import safeAssign from "./object/safeAssign";

export type SortedElementId = PeerId;
export type SortedElementBase = {
  id: SortedElementId, 
  index: number
};

export default class SortedList<SortedElement extends SortedElementBase> {
  protected elements: Map<SortedElementId, SortedElement>;
  protected sorted: Array<SortedElement>;

  protected getIndex: (element: SortedElement) => PromiseLike<number> | number;
  protected onDelete: (element: SortedElement) => void;
  protected onUpdate: (element: SortedElement) => void;
  protected onSort: (element: SortedElement, idx: number) => void;
  protected onElementCreate: (base: SortedElementBase, batch: boolean) => SortedElement;

  protected updateElementWith = (callback: () => void) => callback();
  protected updateListWith = (callback: (canUpdate: boolean | undefined) => void) => callback(true);

  protected middleware = getMiddleware();

  constructor(options: {
    getIndex: SortedList<SortedElement>['getIndex'],
    onDelete?: SortedList<SortedElement>['onDelete'],
    onUpdate?: SortedList<SortedElement>['onUpdate'],
    onSort?: SortedList<SortedElement>['onSort'],
    onElementCreate: SortedList<SortedElement>['onElementCreate'],

    updateElementWith?: SortedList<SortedElement>['updateElementWith'],
    updateListWith?: SortedList<SortedElement>['updateListWith']
  }) {
    safeAssign(this, options);

    this.elements = new Map();
    this.sorted = [];
  }

  public clear() {
    this.middleware.clean();
    this.elements.clear();
    this.sorted.length = 0;
  }

  protected _updateList() {
    this.elements.forEach((element) => {
      this.update(element.id, true);
    });

    if(this.onSort) {
      this.sorted.forEach((element, idx) => {
        this.onSort(element, idx);
      });
    }
  }

  public updateList(callback: (updated: boolean) => void) {
    const middleware = this.middleware.get();
    this.updateListWith((canUpdate) => {
      if(!middleware() || (canUpdate !== undefined && !canUpdate)) {
        return callback(false);
      }

      this._updateList();
  
      callback(true);
    });
  }

  public has(id: SortedElementId) {
    return this.elements.has(id);
  }

  public get(id: SortedElementId) {
    return this.elements.get(id);
  }

  public getAll() {
    return this.elements;
  }

  public add(
    id: SortedElementId, 
    batch = false, 
    updateElementWith?: SortedList<SortedElement>['updateElementWith'], 
    updateBatch = batch
  ) {
    let element = this.get(id);
    if(element) {
      return element;
    }

    const base: SortedElementBase = {
      id,
      index: 0
    };

    element = this.onElementCreate(base, batch);
    this.elements.set(id, element);
    this.update(id, updateBatch, element, updateElementWith);

    return element;
  }

  public delete(id: SortedElementId, noScheduler?: boolean) {
    const element = this.elements.get(id);
    if(!element) {
      return false;
    }
    
    this.elements.delete(id);
    
    const idx = this.sorted.indexOf(element);
    if(idx !== -1) {
      this.sorted.splice(idx, 1);
    }

    if(this.onDelete) {
      if(noScheduler) {
        this.onDelete(element);
      } else {
        const middleware = this.middleware.get();
        this.updateElementWith(() => {
          if(!middleware()) {
            return;
          }

          this.onDelete(element);
        });
      }
    }

    return true;
  }

  public async update(
    id: SortedElementId, 
    batch = false, 
    element = this.get(id), 
    updateElementWith?: SortedList<SortedElement>['updateElementWith']
  ) {
    if(!element) {
      return;
    }

    element.index = await this.getIndex(element);
    this.onUpdate && this.onUpdate(element);

    const idx = insertInDescendSortedArray(this.sorted, element, 'index');
    if(!batch && this.onSort) {
      const middleware = this.middleware.get();
      (updateElementWith || this.updateElementWith)(() => {
        if(!middleware()) {
          return;
        }

        // * в случае пересортировки этого же элемента во время ожидания вызовется вторая такая же. нужно соблюдать последовательность событий
        this.onSort(element, idx);
        /* if(this.get(id) === element) {
          this.onSort(element, this.sorted.indexOf(element));
        } */
      });
    }
  }
}
