export default function generateVerifiedIcon() {
  const span = document.createElement('span');
  span.classList.add('verified-icon');

  const size = 26; // 24
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttributeNS(null, 'viewBox', `0 0 ${size} ${size}`);
  svg.setAttributeNS(null, 'width', `${size}`);
  svg.setAttributeNS(null, 'height', `${size}`);
  svg.classList.add('verified-icon-svg');

  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttributeNS(null, 'href', '#verified-icon-background');
  use.classList.add('verified-icon-background');

  const use2 = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use2.setAttributeNS(null, 'href', '#verified-icon-check');
  use2.classList.add('verified-icon-check');

  // svg.append(use, use2);
  svg.append(use2, use);

  span.append(svg);

  return span;
  // const span = document.createElement('span');
  // span.classList.add('verified-icon', 'tgico-verified_filled');
  // return span;
}
