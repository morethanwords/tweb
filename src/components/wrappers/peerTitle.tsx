import PeerTitle, {PeerTitleOptions} from '@components/peerTitle';

export default async function wrapPeerTitle(options: PeerTitleOptions) {
  const peerTitle = new PeerTitle(options);
  await peerTitle.ready;
  return peerTitle.element;
}
