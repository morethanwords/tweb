// Independent DOM assembly from frozen upstream sources. Never import shell components here.
import './style.scss';
import './layout.scss';
import fixtures from './fixtures.json';

document.documentElement.classList.toggle('night', new URLSearchParams(location.search).get('theme') === 'night');
const fixture = document.createElement('section');
fixture.className = 'visual-fixture chat';
const content = document.createElement('div');
content.className = 'fixture-content bubbles';
const avatar = document.createElement('div');
avatar.className = 'avatar avatar-like avatar-gradient';
avatar.textContent = 'AI';
content.append(avatar);
for(const item of fixtures) {
  const bubble = document.createElement('div');
  bubble.className = `bubble is-group-first is-group-last can-have-tail ${item.outgoing ? 'is-out' : 'is-in'} ${item.rows.length ? 'with-reply-markup' : ''}`;
  bubble.dataset.fixtureId = item.id;
  const wrapper = document.createElement('div');
  wrapper.className = 'bubble-content-wrapper';
  const body = document.createElement('div');
  body.className = 'bubble-content';
  const tail = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  tail.setAttribute('class', 'bubble-tail');
  tail.setAttribute('viewBox', '0 0 11 20');
  const group = document.createElementNS(tail.namespaceURI, 'g');
  group.setAttribute('transform', 'translate(9 -14)');
  group.setAttribute('fill', 'inherit');
  group.setAttribute('fill-rule', 'evenodd');
  const path = document.createElementNS(tail.namespaceURI, 'path');
  path.setAttribute('d', 'M-6 16h6v17c-.193-2.84-.876-5.767-2.05-8.782-.904-2.325-2.446-4.485-4.625-6.48A1 1 0 01-6 16z');
  path.setAttribute('transform', 'matrix(1 0 0 -1 0 49)');
  path.setAttribute('fill', 'inherit');
  group.append(path); tail.append(group);
  const message = document.createElement('div');
  message.className = 'message spoilers-container';
  const text = document.createElement('span');
  text.textContent = item.text;
  const time = document.createElement('span');
  time.className = 'time'; time.append(item.time);
  const innerTime = document.createElement('span');
  innerTime.className = 'time-inner'; innerTime.textContent = item.time;
  const clear = document.createElement('span'); clear.className = 'clearfix';
  time.append(innerTime); message.append(text, time, clear); body.append(tail, message); wrapper.append(body);
  if(item.rows.length) {
    const keyboard = document.createElement('div'); keyboard.className = 'reply-markup';
    item.rows.forEach((row, rowIndex) => {
      const rowElement = document.createElement('div'); rowElement.className = 'reply-markup-row';
      row.buttons.forEach((button, index) => {
        const element = document.createElement('button');
        element.type = 'button';
        element.className = `reply-markup-button rp ${rowIndex === item.rows.length - 1 && index === 0 ? 'is-first' : ''} ${rowIndex === item.rows.length - 1 && index === row.buttons.length - 1 ? 'is-last' : ''}`;
        element.dataset.buttonId = button.id;
        const label = document.createElement('span'); label.className = 'reply-markup-button-text'; label.textContent = button.label;
        element.append(label); rowElement.append(element);
      });
      keyboard.append(rowElement);
    });
    wrapper.append(keyboard);
  }
  bubble.append(wrapper); content.append(bubble);
}
const typing = document.createElement('span');
typing.className = 'peer-typing-container peer-typing-flex';
const dots = document.createElement('span'); dots.className = 'peer-typing peer-typing-text';
for(const suffix of ['-first', '', '-last']) {
  const dot = document.createElement('span'); dot.className = `peer-typing-text-dot ${suffix ? `peer-typing-text-dot${suffix}` : ''}`; dots.append(dot);
}
const label = document.createElement('span'); label.className = 'fixture-typing-label'; label.textContent = 'печатает';
typing.append(dots, label); content.append(typing); fixture.append(content);
document.getElementById('reference')!.append(fixture);
