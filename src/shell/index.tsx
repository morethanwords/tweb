import {render} from 'solid-js/web';
import {App} from './App';
const root = document.getElementById('app');
if(!root) throw new Error('Missing application mount');
let dispose: (() => void) | undefined;
function mount() { if(!dispose) dispose = render(() => <App />, root!); }
function unmount() { const cleanup = dispose; dispose = undefined; cleanup?.(); }
mount();
window.addEventListener('pagehide', unmount);
// A bfcache return does not execute this module again. Restore a fresh session.
window.addEventListener('pageshow', event => {if(event.persisted) mount();});
