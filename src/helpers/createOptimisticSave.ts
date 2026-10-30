/**
 * Saves of a setting the screen shows at once, before the server has taken it. `save` is the manager's,
 * which sends a setting's values one after another in the order it is given them and answers in that
 * order — whichever screen or tab gave them. So each value is handed on at once: held back here, it
 * could be overtaken by another screen's. One that fails with a newer save sent from here behind it
 * changes nothing: that one decides. One that fails as the last gets `revert` with what the server holds:
 * - with `reload`, the manager's value asked once it has answered everything sent before — another screen
 *   or tab may have changed it since this one last knew; `undefined` when that cannot be had either: not
 *   known, so the screen offers nothing to change until it asks again;
 * - without it, the value the server last took from this screen (not the one shown before the refused
 *   save, which may have been refused as well).
 */
export default function createOptimisticSave<T>(
  save: (value: T) => Promise<unknown>,
  revert: (value: T) => void,
  reload?: () => Promise<T>
) {
  let pending = 0;
  let sent = 0;
  let confirmed: T;

  /** `shown` is what the screen showed before `value`: the server's own while nothing is on its way */
  return (value: T, shown: T) => {
    if(!pending++) confirmed = shown;
    const order = ++sent;
    new Promise((resolve) => resolve(save(value))).then(() => {
      --pending;
      confirmed = value;
    }, () => {
      if(--pending) return;
      if(!reload) {
        revert(confirmed);
        return;
      }

      // * a save sent from here meanwhile decides instead
      const onReload = (value: T) => order === sent && revert(value);
      new Promise<T>((resolve) => resolve(reload())).then(onReload, () => onReload(undefined));
    });
  };
}
