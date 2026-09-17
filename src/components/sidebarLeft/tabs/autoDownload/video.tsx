import autoDownloadTab from './autoDownloadTab';
import {autoDownloadPeerTypeSection} from './peerTypeSection';

export default autoDownloadTab((tab) => {
  tab.scrollable.append(autoDownloadPeerTypeSection('video', 'AutoDownloadVideosTitle', tab.middlewareHelper.get()));
});
