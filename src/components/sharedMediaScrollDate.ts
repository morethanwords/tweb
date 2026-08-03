export const SHARED_MEDIA_SCROLL_DATE_HIDE_TIMEOUT = 1000;

const SAME_ROW_TOLERANCE = 1;

export function supportsSharedMediaScrollDate(type: string) {
  return type === 'media' || type === 'stories';
}

export function findSharedMediaScrollDateItemIndex(
  itemCount: number,
  anchorTop: number,
  getItemBottom: (index: number) => number
) {
  let left = 0;
  let right = itemCount - 1;
  let result = -1;

  while(left <= right) {
    const middle = (left + right) >> 1;
    if(getItemBottom(middle) > anchorTop) {
      result = middle;
      right = middle - 1;
    } else {
      left = middle + 1;
    }
  }

  if(result === -1) {
    return result;
  }

  const rowBottom = getItemBottom(result);
  while(result > 0 && Math.abs(getItemBottom(result - 1) - rowBottom) < SAME_ROW_TOLERANCE) {
    --result;
  }

  return result;
}
