import type {AppDialogsManager} from '../../lib/appManagers/appDialogsManager';
import rootScope from '../../lib/rootScope';
import type {AutonomousMonoforumThreadList} from '../autonomousDialogList/monoforumThreads';
import Scrollable from '../scrollable';
import SortedDialogList from '../sortedDialogList';

if(import.meta.hot) import.meta.hot.accept();


type Args = {
  peerId: PeerId;

  appDialogsManager: AppDialogsManager;
  AutonomousMonoforumThreadList: typeof AutonomousMonoforumThreadList;
};

const createMonoforumDialogsList = ({peerId, appDialogsManager, AutonomousMonoforumThreadList}: Args) => {
  const scrollable = new Scrollable();
  const autonomousList = new AutonomousMonoforumThreadList({peerId, appDialogsManager});
  autonomousList.scrollable = scrollable;
  autonomousList.sortedList = new SortedDialogList({
    itemSize: 72,
    appDialogsManager,
    scrollable: scrollable,
    managers: rootScope.managers,
    requestItemForIdx: autonomousList.requestItemForIdx,
    onListShrinked: autonomousList.onListShrinked,
    indexKey: 'index_0',
    monoforumParentPeerId: peerId
  });

  const list = autonomousList.sortedList.list;
  scrollable.append(list);
  autonomousList.bindScrollable();

  autonomousList.onChatsScroll();

  return autonomousList;
}

export default createMonoforumDialogsList;
