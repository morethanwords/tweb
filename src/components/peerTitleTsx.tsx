import {createResource, onCleanup} from 'solid-js';
import PeerTitle from './peerTitle';
import {attachClickEvent} from '../helpers/dom/clickEvent';
import {attachClassName} from '../helpers/solid/classname';

export const PeerTitleTsx = (props: {
  class?: string
  peerId: PeerId,
  onlyFirstName?: boolean
  onClick?: () => void
}) => {
  const peerTitle = new PeerTitle();

  const [loaded] = createResource(
    () => props.peerId,
    async(peerId) => {
      await peerTitle.update({peerId, dialog: false, onlyFirstName: props.onlyFirstName});
      if(props.onClick) {
        const detach = attachClickEvent(peerTitle.element, props.onClick);
        onCleanup(detach);
      }
      return true;
    }
  );

  attachClassName(peerTitle.element, () => props.class);

  return (
    <>
      {loaded() && peerTitle.element}
    </>
  );
};
