/**
 * How long a touch has to rest before it counts as a hold rather than a tap or
 * the start of a scroll.
 *
 * Shared so a gesture that waits for a hold — the context menu, dragging an
 * editor block — feels the same everywhere instead of picking its own number.
 */
export const TOUCH_HOLD_DURATION = .4e3;
