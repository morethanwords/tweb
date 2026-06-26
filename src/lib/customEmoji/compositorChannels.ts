import compositorMessagePort from '@lib/customEmoji/compositorMessagePort';
import rlottieMessagePort from '@lib/rlottie/rlottieMessagePort';

let compositorWorker: Worker;
const mintedDecodeChannels: Set<number> = new Set();

export const ensureCompositor = () => {
  if(compositorWorker) {
    return;
  }

  compositorWorker = new Worker(
    new URL('./compositor.worker.ts', import.meta.url),
    {type: 'module'}
  );
  compositorMessagePort.attachPort(compositorWorker as any);
};

export const ensureDecodeChannel = (workerId: number) => {
  ensureCompositor();
  if(mintedDecodeChannels.has(workerId)) {
    return;
  }

  mintedDecodeChannels.add(workerId);
  const channel = new MessageChannel();
  compositorMessagePort.invokeCompositorVoid('decodePort', {workerId}, [channel.port1]);
  rlottieMessagePort.invokeRLottieVoid(workerId, 'compositorPort', undefined as any, [channel.port2]);
};
