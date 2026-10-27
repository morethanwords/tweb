import type SidebarSlider from '@components/slider';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';

export default function createNewGroupTab(slider: SidebarSlider) {
  slider.createTab(hotReloadGuard.tabs.AppAddMembersTab).open({
    type: 'chat',
    skippable: true,
    takeOut: (peerIds) => slider.createTab(hotReloadGuard.tabs.AppNewGroupTab).open({peerIds}),
    title: 'GroupAddMembers',
    placeholder: 'SendMessageTo'
  });
}
