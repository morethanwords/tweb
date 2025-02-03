import {MOUNT_CLASS_TO} from '../config/debug';
import {getCurrentAccount} from './accounts/getCurrentAccount';
import StateStorage from './stateStorage';


const currentAccount = getCurrentAccount();

const stateStorage = new StateStorage(currentAccount);
MOUNT_CLASS_TO.stateStorage = stateStorage;
export default stateStorage;
