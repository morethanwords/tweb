/**
 * Whether a menu item stays in its menu. A `verify` that throws or rejects (a request the server refused,
 * a flood wait) leaves out its own item only: every menu filters its items through here, so one failing
 * check can never keep the whole menu from opening. A flow the tab has left (the account switched away,
 * the screen gone) still stops the menu, as it stops anything else.
 */
export default async function verifyMenuItem(item: {verify?: () => boolean | Promise<boolean>}) {
  if(!item?.verify) {
    return true;
  }

  try {
    return !!(await item.verify());
  } catch(err) {
    if((err as ApiError)?.type === 'MIDDLEWARE') {
      throw err;
    }

    return false;
  }
}
