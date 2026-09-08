/* Native peer-typing-text markup, morethanwords/tweb 4a82cc7, GPL-3.0-only. */
import {JSX} from 'solid-js';

export default function Typing(): JSX.Element {
  return <span class="peer-typing-container peer-typing-flex" role="status" aria-label="Бот печатает">
    <span class="peer-typing peer-typing-text" aria-hidden="true">
      <span class="peer-typing-text-dot peer-typing-text-dot-first" />
      <span class="peer-typing-text-dot" />
      <span class="peer-typing-text-dot peer-typing-text-dot-last" />
    </span>
    <span class="shell-typing-label" aria-hidden="true">печатает</span>
  </span>;
}
