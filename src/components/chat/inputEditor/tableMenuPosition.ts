export type ChatInputTableMenuRectangle = {
  bottom: number,
  height: number,
  left: number,
  right: number,
  top: number,
  width: number
};

export type ChatInputTableMenuViewport = {
  height: number,
  left?: number,
  top?: number,
  width: number
};

export function getChatInputTableMenuLayout(
  trigger: ChatInputTableMenuRectangle,
  menu: Pick<ChatInputTableMenuRectangle, 'height' | 'width'>,
  viewport: ChatInputTableMenuViewport,
  gap = 4,
  padding = 8
) {
  const viewportLeft = viewport.left || 0;
  const viewportTop = viewport.top || 0;
  const viewportRight = viewportLeft + viewport.width;
  const viewportBottom = viewportTop + viewport.height;
  const maxWidth = Math.max(0, viewport.width - padding * 2);
  const menuWidth = Math.min(menu.width, maxWidth);
  const minLeft = viewportLeft + padding;
  const maxLeft = Math.max(minLeft, viewportRight - menuWidth - padding);
  const preferredLeft = trigger.left + trigger.width / 2 - menuWidth / 2;
  const left = Math.max(minLeft, Math.min(maxLeft, preferredLeft));
  const below = trigger.bottom + gap;
  const availableBelow = Math.max(0, viewportBottom - padding - below);
  const availableAbove = Math.max(0, trigger.top - gap - viewportTop - padding);
  const opensBelow = menu.height <= availableBelow || (
    menu.height > availableAbove && availableBelow >= availableAbove
  );
  const maxHeight = opensBelow ? availableBelow : availableAbove;
  const menuHeight = Math.min(menu.height, maxHeight);
  const top = opensBelow ? below : trigger.top - gap - menuHeight;

  return {left, maxHeight, maxWidth, top};
}
