import Modes from '@config/modes';

const IS_LIVE_STREAM_SUPPORTED = 'serviceWorker' in navigator && !Modes.noServiceWorker;

export default IS_LIVE_STREAM_SUPPORTED;
