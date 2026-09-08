import {render} from 'solid-js/web';
import {For, Show} from 'solid-js';
import Bubble from '../src/shell/native/Bubble';
import Keyboard from '../src/shell/native/Keyboard';
import Typing from '../src/shell/native/Typing';
import '../src/shell/native/native.scss';
import './layout.scss';
import fixtures from './fixtures.json';

document.documentElement.classList.toggle('night', new URLSearchParams(location.search).get('theme') === 'night');
render(() => <section class="visual-fixture chat"><div class="fixture-content bubbles">
  <div class="avatar avatar-like avatar-gradient">AI</div>
  <For each={fixtures}>{(item) => <div data-fixture-id={item.id} class="fixture-bubble-wrapper"><Bubble text={item.text} time={item.time} outgoing={item.outgoing} hasKeyboard={item.rows.length > 0}>
    <Show when={item.rows.length}><Keyboard rows={item.rows} onButton={() => undefined} /></Show>
  </Bubble></div>}</For>
  <Typing />
</div></section>, document.getElementById('reference')!);
