/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 * 
 * Originally from:
 * https://github.com/evgeny-nadymov/telegram-react
 * Copyright (C) 2018 Evgeny Nadymov
 * https://github.com/evgeny-nadymov/telegram-react/blob/master/LICENSE
 */

import { MOUNT_CLASS_TO } from "../../config/debug";
import { logger } from "../logger";

export class AppCallsManager {
  private log: ReturnType<typeof logger>;

  constructor() {
    this.log = logger('CALLS');

    
  }
}

const appCallsManager = new AppCallsManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appCallsManager = appCallsManager);
export default appCallsManager;
