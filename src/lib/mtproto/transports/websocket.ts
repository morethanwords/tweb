import { logger, LogLevels } from '../../logger';
import Modes from '../../../config/modes';
import EventListenerBase from '../../../helpers/eventListenerBase';

export default class Socket extends EventListenerBase<{
  open: () => void,
  message: (buffer: ArrayBuffer) => any,
  close: () => void,
}> {
  public ws: WebSocket;
  private log: ReturnType<typeof logger>;
  private debug = Modes.debug && false;

  constructor(protected dcId: number, protected url: string, logSuffix: string) {
    super();

    let logLevel = LogLevels.error | LogLevels.log;
    if(this.debug) logLevel |= LogLevels.debug;
    this.log = logger(`WS-${dcId}` + logSuffix, logLevel);
    this.log('constructor');
    this.connect();
  }

  private removeListeners() {
    this.ws.removeEventListener('open', this.handleOpen);
    this.ws.removeEventListener('close', this.handleClose);
    this.ws.removeEventListener('error', this.handleError);
    this.ws.removeEventListener('message', this.handleMessage);
  }
  
  private connect() {
    this.ws = new WebSocket(this.url, 'binary');
    this.ws.binaryType = 'arraybuffer';
    this.ws.addEventListener('open', this.handleOpen);
    this.ws.addEventListener('close', this.handleClose);
    this.ws.addEventListener('error', this.handleError);
    this.ws.addEventListener('message', this.handleMessage);
  }
  
  handleOpen = () => {
    this.log('opened');

    this.debug && this.log.debug('sending init packet');
    this.setListenerResult('open');
  };

  handleError = (e: Event) => {
    this.log.error(e);
  };

  handleClose = () => {
    this.log('closed'/* , event, this.pending, this.ws.bufferedAmount */);

    this.removeListeners();
    this.setListenerResult('close');
  };

  handleMessage = (event: MessageEvent) => {
    this.debug && this.log.debug('<-', 'handleMessage', /* event,  */event.data.byteLength);

    this.setListenerResult('message', event.data as ArrayBuffer);
  };

  send = (body: Uint8Array) => {
    this.debug && this.log.debug('-> body length to send:', body.length);

    this.ws.send(body);
  };
}

/* const setupSafariFix = () => {
  
};

if(isWebWorker) {
  import('../../polyfill').then(() => {
    //ctx.postMessage('ready');
    let socket: Socket;
    ctx.addEventListener('message', (e) => {
      console.log('websocket worker message', e);
      const task = e.data;

      if(task.type === 'send') {
        // const promise = socket.send(task.payload);
        // if(task.taskId) {
        //   promise
        // }
      } else if(task.type === 'setup') {
        socket = new Socket(task.dcId, task.url, task.logSuffix, task.retryTimeout);
      }
    });
  });
} */
