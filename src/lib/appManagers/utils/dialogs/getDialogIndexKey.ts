import type {DialogFilter} from '@layer';

export default function getDialogIndexKey(localId: DialogFilter.dialogFilter['localId'] = 0) {
  return `index_${localId}` as const;
  // return filterId !== undefined && filterId > 1 ? `filter_${filterId}` as const : 'main' as const;
  // const indexStr = filterId > 1 ?
  //   `index_${filterId}` as const :
  //   'index' as const;

  // return indexStr;
}
