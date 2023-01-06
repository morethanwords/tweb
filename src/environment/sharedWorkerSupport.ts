import Modes from '../config/modes';

const IS_SHARED_WORKER_SUPPORTED = typeof(SharedWorker) !== 'undefined' && !Modes.noSharedWorker/*  && false */;

export default IS_SHARED_WORKER_SUPPORTED;
