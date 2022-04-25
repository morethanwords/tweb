import { ModifyFunctionsToAsync } from "../../types";
import { ReferenceDatabase } from "../mtproto/referenceDatabase";
import { ApiUpdatesManager } from "./apiUpdatesManager";
import { AppAvatarsManager } from "./appAvatarsManager";
import { AppCallsManager } from "./appCallsManager";
import { AppChatsManager } from "./appChatsManager";
import { AppDocsManager } from "./appDocsManager";
import { AppDraftsManager } from "./appDraftsManager";
import { AppEmojiManager } from "./appEmojiManager";
import { AppGroupCallsManager } from "./appGroupCallsManager";
import { AppInlineBotsManager } from "./appInlineBotsManager";
import { AppMessagesIdsManager } from "./appMessagesIdsManager";
import { AppMessagesManager } from "./appMessagesManager";
import { AppNotificationsManager } from "./appNotificationsManager";
import { AppPeersManager } from "./appPeersManager";
import { AppPhotosManager } from "./appPhotosManager";
import { AppPollsManager } from "./appPollsManager";
import { AppPrivacyManager } from "./appPrivacyManager";
import { AppProfileManager } from "./appProfileManager";
import { AppReactionsManager } from "./appReactionsManager";
import { AppStickersManager } from "./appStickersManager";
import { AppUsersManager } from "./appUsersManager";
import { AppWebPagesManager } from "./appWebPagesManager";

function createProxy<T>(source: T) {
  const proxy = new Proxy({} as ModifyFunctionsToAsync<T>, {
    get: (target, p, receiver) => {
      console.log('get', target, p, receiver);
      return (...args: any[]) => {
        // @ts-ignore
        return Promise.resolve(source[p](...args));
      };
    },
    apply: (target, thisValue, args) => {
      console.log('apply', target, thisValue, args);
    }
  });

  return proxy;
}

function createManagers() {
  const managers = {
    appPeersManager: new AppPeersManager(),
    appChatsManager: new AppChatsManager(),
    appDocsManager: new AppDocsManager(),
    appPhotosManager: new AppPhotosManager,
    appPollsManager: new AppPollsManager(),
    appUsersManager: new AppUsersManager(),
    appWebPagesManager: new AppWebPagesManager(),
    appDraftsManager: new AppDraftsManager(),
    appProfileManager: new AppProfileManager(),
    appNotificationsManager: new AppNotificationsManager(),
    apiUpdatesManager: new ApiUpdatesManager(),
    appAvatarsManager: new AppAvatarsManager(),
    appGroupCallsManager: new AppGroupCallsManager(),
    appCallsManager: new AppCallsManager(),
    appReactionsManager: new AppReactionsManager(),
    appMessagesManager: new AppMessagesManager(),
    appMessagesIdsManager: new AppMessagesIdsManager(),
    appPrivacyManager: new AppPrivacyManager(),
    appInlineBotsManager: new AppInlineBotsManager(),
    appStickersManager: new AppStickersManager(),
    referenceDatabase: new ReferenceDatabase(),
    appEmojiManager: new AppEmojiManager(),
  };

  type T = typeof managers;

  const proxied: {
    [name in keyof T]?: ModifyFunctionsToAsync<T[name]>
  } = {
    
  };

  for(const name in managers) {
    const manager = managers[name as keyof T];
    if(!manager) {
      continue;
    }
    
    if((manager as AppMessagesManager).setManagers) {
      (manager as AppMessagesManager).setManagers(managers as any);
    }

    // @ts-ignore
    proxied[name as keyof T] = createProxy(manager);
  }

  // return proxied/*  as any as T */;
  return managers;
}

let managers: ReturnType<typeof createManagers>;
export default function getManagers() {
  return managers ??= createManagers();
}

(window as any).getManagers = getManagers;


// Each mixin is a traditional ES class
class Jumpable {
  jump() {}
}
 
class Duckable {
  duck() {}
}
 
// Including the base
class Sprite {
  x = 0;
  y = 0;
}
 
// Then you create an interface which merges
// the expected mixins with the same name as your base
interface Sprite extends Jumpable, Duckable {}
// Apply the mixins into the base class via
// the JS at runtime
applyMixins(Sprite, [Jumpable, Duckable]);
 
let player = new Sprite();
player.jump();
console.log(player.x, player.y);
 
// This can live anywhere in your codebase:
function applyMixins(derivedCtor: any, constructors: any[]) {
  constructors.forEach((baseCtor) => {
    Object.getOwnPropertyNames(baseCtor.prototype).forEach((name) => {
      Object.defineProperty(
        derivedCtor.prototype,
        name,
        Object.getOwnPropertyDescriptor(baseCtor.prototype, name) ||
          Object.create(null)
      );
    });
  });
}
