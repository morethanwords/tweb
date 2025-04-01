import {createRoot, createSignal} from 'solid-js';

import {setReservedStars} from '../../stores/stars';


const createPendingUndoableMessage = () => createRoot(dispose => {
  const [messageCount, setMessageCount] = createSignal(0);
  const [sendTime, setSendTime] = createSignal(0);

  const [reserved, setReserved] = createSignal(0);

  let abortController = new AbortController;

  return {
    timeoutId: 0,

    messageCount,
    setMessageCount,
    sendTime,
    setSendTime,
    reserved,
    setReserved,

    abort() {
      abortController.abort();
    },

    get signal() {
      return abortController.signal;
    },

    softReset() {
      self.clearTimeout(this.timeoutId);
      this.timeoutId = 0;

      abortController = new AbortController;
    },


    resetGlobalReserved() {
      setReservedStars(prev => prev - reserved());
    },

    reset() {
      this.softReset();

      setSendTime(0);
      setMessageCount(0);

      setReserved(0);
    },

    dispose
  };
});

export default createPendingUndoableMessage;
