import type SidebarSlider from '@components/slider';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';

/** Opens the form that adds a user to my contacts, in the given slider. */
export default function addContact(peerId: PeerId, slider: SidebarSlider) {
  const {AppEditContactTab} = hotReloadGuard.tabs;
  if(!slider.isTabExists(AppEditContactTab)) {
    slider.createTab(AppEditContactTab).open(peerId);
  }

  slider.reveal();
}
