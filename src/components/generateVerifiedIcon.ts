export default function generateVerifiedIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttributeNS(null, 'viewBox', '0 0 24 24');
  svg.setAttributeNS(null, 'width', '24');
  svg.setAttributeNS(null, 'height', '24');
  svg.classList.add('verified-icon');

  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttributeNS(null, 'href', '#verified-background');
  use.classList.add('verified-background');

  const use2 = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use2.setAttributeNS(null, 'href', '#verified-check');
  use2.classList.add('verified-check');

  svg.append(use, use2);

  return svg;
}
