import {ChatAdminRights} from '@layer';

export default function hasBotAdminRights(rights?: ChatAdminRights) {
  return !!rights && Object.keys(rights.pFlags).length > 0;
}
