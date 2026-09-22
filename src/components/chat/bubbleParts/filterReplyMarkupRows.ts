import {KeyboardButtonRow, KeyboardInlineButtonRow} from '@layer';

export default function filterReplyMarkupRows<T extends KeyboardButtonRow | KeyboardInlineButtonRow>(rows: T[]) {
  return rows.filter((row) => row.buttons.length);
}
