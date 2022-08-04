import simulateEvent from '../../../helpers/dom/dispatchEvent';

export default function stopTrack(track: MediaStreamTrack) {
  track.stop();
  simulateEvent(track, 'ended');
}
