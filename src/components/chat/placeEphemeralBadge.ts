export function shouldRenderSenderNameWithEphemeralBadge(
  needName: boolean,
  isStandaloneMedia: boolean,
  isEphemeral: boolean
) {
  return needName && (!isStandaloneMedia || isEphemeral);
}

export function shouldKeepSenderNameAcrossGroup(
  isEphemeral: boolean,
  isOut: boolean
) {
  return isEphemeral && !isOut;
}

export default function placeEphemeralBadge(
  bubbleContainer: HTMLElement,
  name: HTMLElement,
  badgeContainer: HTMLElement,
  isStandaloneMedia = false
) {
  if(name?.parentElement) {
    const nextChip = Array.from(name.children).find((element) => (
      element.classList.contains('bubble-name-chip-container')
    ));

    if(nextChip) {
      nextChip.before(badgeContainer);
    } else {
      name.append(badgeContainer);
    }
  } else {
    if(isStandaloneMedia) {
      badgeContainer.classList.add('floating-part', 'ephemeral-badge-standalone');
    }

    bubbleContainer.prepend(badgeContainer);
  }
}
