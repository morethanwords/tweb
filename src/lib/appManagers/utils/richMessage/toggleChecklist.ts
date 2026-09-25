import {PageBlock, PageListItem, PageListOrderedItem, RichMessage} from '@layer';

type ListItem = PageListItem | PageListOrderedItem;

type UpdateResult<T> = {
  found: boolean,
  value: T
};

function updateBlocks(blocks: PageBlock[], path: number[], checked: boolean): UpdateResult<PageBlock[]> {
  const [index, ...remainder] = path;
  if(index === undefined || index < 0 || index >= blocks.length) {
    return {found: false, value: blocks};
  }

  const result = updateBlock(blocks[index], remainder, checked);
  if(!result.found || result.value === blocks[index]) {
    return {found: result.found, value: blocks};
  }

  const value = [...blocks];
  value[index] = result.value;
  return {found: true, value};
}

function updateListItem(item: ListItem, path: number[], checked: boolean): UpdateResult<ListItem> {
  if(!path.length) {
    if(!item.pFlags.checkbox) {
      return {found: false, value: item};
    }

    if(!!item.pFlags.checked === checked) {
      return {found: true, value: item};
    }

    return {
      found: true,
      value: {
        ...item,
        pFlags: {
          ...item.pFlags,
          checked: checked || undefined
        }
      }
    };
  }

  if(item._ !== 'pageListItemBlocks' && item._ !== 'pageListOrderedItemBlocks') {
    return {found: false, value: item};
  }

  const result = updateBlocks(item.blocks, path, checked);
  if(!result.found || result.value === item.blocks) {
    return {found: result.found, value: item};
  }

  return {
    found: true,
    value: {
      ...item,
      blocks: result.value
    }
  };
}

function updateList(
  block: PageBlock.pageBlockList | PageBlock.pageBlockOrderedList,
  path: number[],
  checked: boolean
): UpdateResult<typeof block> {
  const [index, ...remainder] = path;
  if(index === undefined || index < 0 || index >= block.items.length) {
    return {found: false, value: block};
  }

  const result = updateListItem(block.items[index], remainder, checked);
  if(!result.found || result.value === block.items[index]) {
    return {found: result.found, value: block};
  }

  const items = [...block.items] as typeof block.items;
  items[index] = result.value as typeof block.items[number];
  return {
    found: true,
    value: {
      ...block,
      items
    } as typeof block
  };
}

function updateBlock(block: PageBlock, path: number[], checked: boolean): UpdateResult<PageBlock> {
  switch(block._) {
    case 'pageBlockList':
    case 'pageBlockOrderedList':
      return updateList(block, path, checked);
    case 'pageBlockDetails':
    case 'pageBlockBlockquoteBlocks': {
      const result = updateBlocks(block.blocks, path, checked);
      if(!result.found || result.value === block.blocks) {
        return {found: result.found, value: block};
      }

      return {
        found: true,
        value: {
          ...block,
          blocks: result.value
        }
      };
    }
    case 'pageBlockCover': {
      const result = updateBlock(block.cover, path, checked);
      if(!result.found || result.value === block.cover) {
        return {found: result.found, value: block};
      }

      return {
        found: true,
        value: {
          ...block,
          cover: result.value
        }
      };
    }
    default:
      return {found: false, value: block};
  }
}

/**
 * Applies the checklist path format used by official clients:
 * root block index, then child block/list-item indices. A cover is transparent
 * and therefore does not consume an extra path component.
 *
 * Returns `undefined` for a stale/invalid path. For an idempotent update the
 * original RichMessage instance is returned.
 */
export default function toggleRichMessageChecklist(
  richMessage: RichMessage.richMessage,
  path: number[],
  checked: boolean
): RichMessage.richMessage | undefined {
  if(!path.length) {
    return;
  }

  const result = updateBlocks(richMessage.blocks, path, checked);
  if(!result.found) {
    return;
  }

  if(result.value === richMessage.blocks) {
    return richMessage;
  }

  return {
    ...richMessage,
    blocks: result.value
  };
}
