import type SidebarSlider from '@components/slider';
import {AppAddMembersTab} from '@components/solidJsTabs/tabs';
import AppNewGroupTab from '@components/sidebarLeft/tabs/newGroup';

export default function createNewGroupTab(slider: SidebarSlider) {
  slider.createTab(AppAddMembersTab).open({
    type: 'chat',
    skippable: true,
    takeOut: (peerIds) => slider.createTab(AppNewGroupTab).open({peerIds}),
    title: 'GroupAddMembers',
    placeholder: 'SendMessageTo'
  });
}
