import {SliderSuperTabEventable} from '@components/sliderTab';
import {autoDownloadPeerTypeSection} from '@components/sidebarLeft/tabs/autoDownload/photo';

export default class AppAutoDownloadVideoTab extends SliderSuperTabEventable {
  public init() {
    this.setTitle('AutoDownloadVideos');

    const section = autoDownloadPeerTypeSection('video', 'AutoDownloadVideosTitle', this.listenerSetter);
    this.scrollable.append(section.container);
  }
}
