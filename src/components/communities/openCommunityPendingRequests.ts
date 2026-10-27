import SidebarSlider from '@components/slider';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';

export default function openCommunityPendingRequests(options: {
  slider: SidebarSlider,
  communityId: ChatId
}) {
  const {slider, communityId} = options;
  const history = slider.getHistory();
  for(let i = history.length - 1; i >= 0; --i) {
    const existingTab = history[i];
    if(
      existingTab instanceof hotReloadGuard.tabs.AppCommunityPendingRequestsTab &&
      existingTab.payload.communityId === communityId
    ) {
      return slider.closeTabsUntilTab(existingTab);
    }
  }

  return slider.createTab(hotReloadGuard.tabs.AppCommunityPendingRequestsTab).open({communityId});
}
