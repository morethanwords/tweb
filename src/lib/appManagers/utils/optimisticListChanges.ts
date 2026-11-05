import findAndSplice from '@helpers/array/findAndSplice';

type ListItem = {id: unknown};

// * a change of the list: the item put first in it, or taken out of it
export type OptimisticListChange<T extends ListItem> = {
  // * the list it was made on, and that list as it was before it
  list: T[],
  before: T[],
  item: T,
  remove: boolean,
  limit: number,
  // * taken by the server, or nothing to ask it (a reorder by use): never taken out, only made again
  answered?: boolean
};

/**
 * A list of the user's that changes here at once, before the server has answered the change (the faved stickers, the
 * saved GIFs), and its changes in order, from the first the server has yet to answer. tdesktop changes such a list only
 * once the server has taken a change (Api::ToggleFavedSticker, Api::ToggleSavedGif), so one it does not take leaves the
 * list as it was: here it is taken out as if it had not been made.
 */
export default class OptimisticListChanges<T extends ListItem> {
  private changes: OptimisticListChange<T>[] = [];

  /** Puts the item first in the list, or takes it out, the list kept at the limit: says whether that pushed one out */
  public make(list: T[], item: T, remove: boolean, limit: number) {
    const change: OptimisticListChange<T> = {list, before: list.slice(), item, remove, limit};
    this.changes.push(change);
    return {change, limitReached: applyChange(list, change)};
  }

  public answer(change: OptimisticListChange<T>) {
    change.answered = true;
    this.forgetAnswered();
  }

  /**
   * Takes out a change the server did not take: the list it was made on, with the changes made on it since made again,
   * put back in place - and returned, to be shown. A list no longer `current` is left as it is: one put in its place
   * since is the server's, right as it is.
   */
  public revert(change: OptimisticListChange<T>, current: unknown) {
    const changes = this.changes;
    const index = changes.indexOf(change);
    changes.splice(index, 1);

    const {list} = change;
    const reverted = list === current;
    if(reverted) {
      const restored = change.before.slice();
      changes.slice(index).forEach((later) => {
        if(later.list === list) {
          later.before = restored.slice();
          applyChange(restored, later);
        }
      });

      list.splice(0, list.length, ...restored);
    }

    this.forgetAnswered();
    return reverted ? list : undefined;
  }

  // * only a change made after one still unanswered can be made again
  private forgetAnswered() {
    const changes = this.changes;
    while(changes[0]?.answered) {
      changes.shift();
    }
  }
}

function applyChange<T extends ListItem>(list: T[], {item, remove, limit}: OptimisticListChange<T>) {
  findAndSplice(list, (_item) => _item.id === item.id);
  if(remove) {
    return false;
  }

  list.unshift(item);
  return list.splice(limit, list.length - limit).length > 0;
}
