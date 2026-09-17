import autoDownloadTab from './autoDownloadTab';
import {autoDownloadPeerTypeSection} from './peerTypeSection';

export default autoDownloadTab((tab) => {
  tab.scrollable.append(autoDownloadPeerTypeSection('photo', 'AutoDownloadPhotosTitle', tab.middlewareHelper.get()));
});
