const audio = document.createElement('audio');
const IS_OPUS_SUPPORTED = !!(audio.canPlayType && audio.canPlayType('audio/ogg;').replace(/no/, ''))/*  && false */;

export default IS_OPUS_SUPPORTED;
