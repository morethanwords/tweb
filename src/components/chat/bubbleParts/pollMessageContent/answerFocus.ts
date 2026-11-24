import Modes from '@config/modes';
import getInlineArrowKeys from '@helpers/dom/getInlineArrowKeys';

const ANSWER_SELECTOR = '[role="radio"], [role="checkbox"]';

/**
 * The answers of a poll, in their order: radios when it takes one, checkboxes when it takes several. Those on their
 * way out (deleted, fading) are left out: they are inert from the moment they go.
 */
export function getAnswers(answersElement: Element) {
  return Array.from(answersElement.querySelectorAll<HTMLElement>(ANSWER_SELECTOR)).filter((answer) => !answer.inert);
}

/**
 * The arrow keys of a poll's radio group (one answer to choose): they move the focus between the
 * answers without choosing one, since a choice there sends the vote. Only with the a11y layer.
 */
export function moveFocusBetweenAnswers(event: KeyboardEvent) {
  if(!Modes.a11y || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
  const {next, previous} = getInlineArrowKeys();
  const step = event.key === next || event.key === 'ArrowDown' ? 1 :
    event.key === previous || event.key === 'ArrowUp' ? -1 : 0;
  if(!step) return;

  const answers = getAnswers(event.currentTarget as HTMLElement)
  .filter((answer) => answer.getAttribute('role') === 'radio' && answer.getAttribute('aria-disabled') !== 'true');
  const index = answers.indexOf(event.target as HTMLElement);
  if(index === -1) return;

  event.preventDefault();
  answers[(index + step + answers.length) % answers.length].focus();
}

/**
 * An answer that goes (deleted) leaves the keyboard's way at once, though it still fades out; when it holds the focus,
 * the focus goes to the next answer that stays (the one before after the last): dropped to the page, it would let the
 * next Enter reach the composer and send its draft. Only with the a11y layer.
 */
export function leaveAnswers(answer: HTMLElement) {
  if(!Modes.a11y) return;
  const focused = answer.matches(':focus');
  answer.inert = true;
  const answersElement = focused && answer.closest('[role="radiogroup"], [role="group"]');
  if(!answersElement) return;

  const answers = Array.from(answersElement.querySelectorAll<HTMLElement>(ANSWER_SELECTOR));
  const index = answers.indexOf(answer);
  const stays = (other: HTMLElement) => !other.inert;
  (answers.slice(index + 1).find(stays) || answers.slice(0, index).reverse().find(stays))?.focus();
}
