import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import {checkCode} from './adapter';
import type {CodeRequest, WorkerReply} from './contracts';
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<WorkerReply | {kind: 'isolation-violation'; capability: string}>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() {FakeWorker.instances.push(this);}
}
const request: CodeRequest = {source:'export default function run(ctx:RoboContext){return {outcome:"success"}}', context:{user:{},run:{},conversation:{},event:{},system:{},bot:{}}, outcomes:['success'],variableTypes:{}};
beforeEach(() => {FakeWorker.instances = []; vi.useFakeTimers(); vi.stubGlobal('Worker', FakeWorker);});
afterEach(() => {vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();});
test('host timeout terminates an unresponsive worker at exactly two seconds', async () => {
  const pending = checkCode(request, 'execute'), worker = FakeWorker.instances[0];
  await vi.advanceTimersByTimeAsync(1999); expect(worker.terminate).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1); expect(worker.terminate).toHaveBeenCalledOnce();
  expect(await pending).toMatchObject({ok:false,error:expect.stringContaining('2 секунды')});
});
test('abort terminates once and a later completion cannot produce an outcome', async () => {
  const controller = new AbortController();
  const pending = checkCode({...request,signal:controller.signal}, 'execute'), worker = FakeWorker.instances[0];
  const id = worker.postMessage.mock.calls[0][0].id;
  controller.abort();
  worker.onmessage?.(new MessageEvent<WorkerReply>('message', {data:{id,reply:{ok:true,result:{outcome:'success'},diagnostics:[]}}}));
  expect(await pending).toMatchObject({ok:false}); expect(worker.terminate).toHaveBeenCalledOnce();
});
test('worker isolation violations are surfaced even before CSP enforcement', async () => {
  const warning = vi.spyOn(console,'warn').mockImplementation(()=>{});
  const pending = checkCode(request), worker = FakeWorker.instances[0];
  worker.onmessage?.({data:{kind:'isolation-violation',capability:'fetch'}} as MessageEvent<{kind:'isolation-violation';capability:string}>);
  expect(await pending).toMatchObject({ok:false}); expect(worker.terminate).toHaveBeenCalledOnce();
  expect(warning).toHaveBeenCalledWith('__SHELL_ISOLATION__:{"capability":"fetch","worker":true}');
});
test('already canceled requests never allocate a worker', async () => {const controller=new AbortController(); controller.abort(); expect(await checkCode({...request,signal:controller.signal})).toMatchObject({ok:false}); expect(FakeWorker.instances).toHaveLength(0);});
