/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { DialogFilter } from "../../../../layer";

export default function getDialogIndexKey(orderIndex?: DialogFilter.dialogFilter['orderIndex']) {
  return `index_${orderIndex}` as const;
  // return filterId !== undefined && filterId > 1 ? `filter_${filterId}` as const : 'main' as const;
  // const indexStr = filterId > 1 ? 
  //   `index_${filterId}` as const : 
  //   'index' as const;

  // return indexStr;
}
