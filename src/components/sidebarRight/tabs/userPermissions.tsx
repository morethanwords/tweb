import {Component} from 'solid-js';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import type {AppUserPermissionsTab} from '@components/solidJsTabs/tabs';
import ChatUserPermissions from './chatUserPermissions';
import CommunityUserPermissions from './communityUserPermissions';

const UserPermissions: Component = () => {
  const [tab] = useSuperTab<typeof AppUserPermissionsTab>();

  return 'communityId' in tab.payload ?
    <CommunityUserPermissions /> :
    <ChatUserPermissions />;
};

export default UserPermissions;
