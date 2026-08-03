import {KeyboardButtonRow} from '@layer';

export default function filterReplyMarkupRows(rows: KeyboardButtonRow[]) {
  return rows.filter((row) => row.buttons.length);
}
