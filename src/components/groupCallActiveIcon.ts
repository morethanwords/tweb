/*
 * The bars of a voice chat going on, in its chat's row. A CSS animation of each bar's scale, which the
 * compositor runs by itself: drawn into a canvas by a script, the 20 px icon had the page make a frame
 * every 16 ms for as long as a voice chat was going on anywhere in the chat list - and with each one
 * restyle whatever else was animating on the page. Looping waves are decoration: below the full
 * animation level the bars stand still. Their colour follows the row (`.active`) in the stylesheet.
 */
export default function groupCallActiveIcon() {
  const element = document.createElement('div');
  for(let i = 0; i < 3; ++i) {
    const bar = document.createElement('span');
    bar.classList.add('dialog-group-call-icon-bar');
    element.append(bar);
  }

  return {element};
}
