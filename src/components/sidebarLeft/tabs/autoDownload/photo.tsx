import autoDownloadTab from './autoDownloadTab';
import {autoDownloadPeerTypeSection} from './peerTypeSection';

export default autoDownloadTab((tab) => {
  const section = autoDownloadPeerTypeSection('photo', 'AutoDownloadPhotosTitle', tab.listenerSetter);
  tab.scrollable.append(section.container);
});
