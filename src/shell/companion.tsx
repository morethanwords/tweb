import {render} from 'solid-js/web';
import {App} from './App';
import {connectCompanion, type CompanionBridge} from './companion-bridge';

const root = document.getElementById('app');
if(!root) throw new Error('Missing application mount');
let dispose: (() => void) | undefined, bridge: CompanionBridge | undefined, generation = 0;
async function mount() {
  if(dispose || bridge) return;
  const attempt = ++generation;
  root!.textContent = 'Открываем сценарий…';
  try {
    const connected = await connectCompanion();
    if(attempt !== generation) {connected.dispose(); return;}
    bridge = connected;
    root!.replaceChildren();
    dispose = render(() => <App companion={connected} />, root!);
    connected.startPolling();
  } catch(error) {
    if(attempt !== generation) return;
    root!.replaceChildren();
    const message = document.createElement('p'); message.textContent = error instanceof Error ? error.message : 'Локальный сервер недоступен.';
    const retry = document.createElement('button'); retry.textContent = 'Повторить'; retry.addEventListener('click', () => {void mount();}, {once: true});
    root!.append(message, retry);
  }
}
function unmount() {generation++; dispose?.(); dispose = undefined; bridge?.dispose(); bridge = undefined;}
void mount();
window.addEventListener('pagehide', unmount);
window.addEventListener('pageshow', event => {if(event.persisted) void mount();});
