import autoDownloadTab from './autoDownloadTab';
import {autoDownloadPeerTypeSection} from './peerTypeSection';

export default autoDownloadTab((tab) => {
  const section = autoDownloadPeerTypeSection('video', 'AutoDownloadVideosTitle', tab.middlewareHelper.get());
  tab.scrollable.append(section.container);
});
