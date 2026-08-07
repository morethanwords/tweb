import SidebarSlider from '@components/slider';
import {AppCommunityPendingRequestsTab} from '@components/solidJsTabs/tabs';

export default function openCommunityPendingRequests(options: {
  slider: SidebarSlider,
  communityId: ChatId
}) {
  const {slider, communityId} = options;
  const history = slider.getHistory();
  for(let i = history.length - 1; i >= 0; --i) {
    const existingTab = history[i];
    if(
      existingTab instanceof AppCommunityPendingRequestsTab &&
      existingTab.payload.communityId === communityId
    ) {
      return slider.closeTabsUntilTab(existingTab);
    }
  }

  return slider.createTab(AppCommunityPendingRequestsTab).open({communityId});
}
