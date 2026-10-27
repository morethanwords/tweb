import SetTransition from '@components/singleTransition';
import styles from '@components/call/callQuality.module.scss';

export type CallNotice = ReturnType<typeof createCallNotice>;

/**
 * A pill over the call panel — "Anna's microphone is off", "Anna's battery is low", "Weak network
 * signal": tdesktop's call tooltips, Android's `VoIPNotificationsLayout`.
 *
 * The pill only scales in and out and never leaves the DOM, so it is kept away from assistive
 * technology; what it says goes to a polite status region next to it instead, and only while it is
 * shown. A hidden pill also gives up its room, so the others in its column do not keep a gap for it.
 */
export default function createCallNotice(options: {
  /** Called again for every announcement: the text may hold a peer name that loads on its own. */
  text: () => HTMLElement,
  icon?: Element
}) {
  const element = document.createElement('div');
  element.classList.add('call-party-state', styles.notice);
  element.setAttribute('aria-hidden', 'true');

  const text = options.text();
  text.classList.add('call-party-state-text');
  if(options.icon) {
    element.append(options.icon);
  }
  element.append(text);

  const announcement = document.createElement('span');
  announcement.classList.add('sr-only');
  announcement.setAttribute('role', 'status');

  let visible = false;
  const setVisible = (value: boolean) => {
    if(visible === value) {
      return;
    }

    visible = value;
    SetTransition({
      element,
      className: 'is-visible',
      forwards: value,
      duration: 300
    });
    announcement.replaceChildren(...(value ? [options.text()] : []));
  };

  return {
    element,
    announcement,
    setVisible,
    get visible() {
      return visible;
    }
  };
}
