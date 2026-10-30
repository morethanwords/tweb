import getShownVideo from '@components/mediaViewer/shownVideo';

// * a mover as the viewer builds one: the media sits in an aspecter inside it
function makeMover() {
  const mover = document.createElement('div');
  const aspecter = document.createElement('div');
  mover.append(aspecter);
  return {mover, aspecter};
}

describe('the video the media viewer shows', () => {
  test('is the player\'s while it stands in the current mover', () => {
    const {mover, aspecter} = makeMover();
    const playerWrapper = document.createElement('div');
    const video = document.createElement('video');
    playerWrapper.append(video);
    aspecter.append(playerWrapper);

    expect(getShownVideo(mover, video)).toBe(video);
  });

  test('is never the previous slide\'s player while the next one comes in', () => {
    const previous = makeMover();
    const previousVideo = document.createElement('video');
    previous.aspecter.append(previousVideo);
    const next = makeMover();

    // * paging: the next mover is installed, the outgoing player not cleaned up yet
    expect(getShownVideo(next.mover, previousVideo)).toBeUndefined();

    // * the next slide's video is put in: it is the one, the player being still the previous one's
    const nextVideo = document.createElement('video');
    next.aspecter.append(nextVideo);
    expect(getShownVideo(next.mover, previousVideo)).toBe(nextVideo);
  });

  test('is the mover\'s own one when there is no player (a GIF)', () => {
    const {mover, aspecter} = makeMover();
    const video = document.createElement('video');
    aspecter.append(video);

    expect(getShownVideo(mover, undefined)).toBe(video);
    expect(getShownVideo(undefined, undefined)).toBeUndefined();
  });
});
