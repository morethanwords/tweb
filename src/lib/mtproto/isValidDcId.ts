import type {DcId} from '@types';

// * Telegram has five DCs, its test servers three
const DC_COUNT = 5;
const TEST_DC_COUNT = 3;

/** a DC the client connects to: one of Telegram's, or of the test servers' when `test` */
export default function isValidDcId(dcId: DcId, test?: boolean) {
  const id = +dcId;
  return Number.isInteger(id) && id >= 1 && id <= (test ? TEST_DC_COUNT : DC_COUNT);
}
