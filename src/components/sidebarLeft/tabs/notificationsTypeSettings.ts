import {createSignal} from 'solid-js';
import {InputNotifyPeer, PeerNotifySettings, Update} from '@layer';
import noop from '@helpers/noop';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import convertKeyToInputKey from '@helpers/string/convertKeyToInputKey';
import rootScope from '@lib/rootScope';

export type InputNotifyKey =
  InputNotifyPeer.inputNotifyUsers['_'] |
  InputNotifyPeer.inputNotifyChats['_'] |
  InputNotifyPeer.inputNotifyBroadcasts['_'];

/**
 * A chat type's settings as the server has them, following every change of them, for the Notifications tab. Once
 * Reset All is through they are none until asked for again (should the reset's own read of them have failed, this
 * asks the server, and should that fail too, they stay none): the switches compose nothing from the ones it cleared
 */
export default function createTypeNotifySettings(inputKey: InputNotifyKey) {
  const [notifySettings, setNotifySettings] = createSignal<PeerNotifySettings>();
  const load = () => {
    const ret = rootScope.managers.appNotificationsManager.getNotifySettings({_: inputKey});
    (ret instanceof Promise ? ret : Promise.resolve(ret)).then((_notifySettings) => {
      if(!notifySettings()) {
        setNotifySettings(_notifySettings);
      }
    }, noop);
  };

  subscribeOn(rootScope)('notify_settings', (update: Update.updateNotifySettings) => {
    if(convertKeyToInputKey(update.peer._) === inputKey) {
      setNotifySettings(update.notify_settings);
    }
  });

  subscribeOn(rootScope)('notify_settings_reset', () => {
    setNotifySettings(undefined);
    load();
  });

  load();
  return notifySettings;
}
