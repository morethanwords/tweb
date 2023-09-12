export default function setCurrentTime(media: HTMLMediaElement, currentTime: number) {
  media.isSeeking = true;
  media.currentTime = currentTime;
}
