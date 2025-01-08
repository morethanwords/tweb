import {ActiveAccountNumber} from '../accounts/types';
import {serviceMessagePort} from '../serviceWorker/index.service';

import {StreamFetchingRange} from './splitRangeForGettingFileParts';

type RequestFilePartIdentificationParams = {
  docId: string;
  dcId: number;
  accountNumber: ActiveAccountNumber;
};

export async function fetchAndConcatFileParts(
  params: RequestFilePartIdentificationParams,
  ranges: StreamFetchingRange[]
) {
  const fileParts: Uint8Array[] = [];
  let totalLength = 0;

  for(const range of ranges) {
    const {bytes} = await serviceMessagePort.invoke('requestFilePart', {
      ...params,
      ...range
    });
    totalLength += bytes.length;
    fileParts.push(bytes);
  }

  if(fileParts.length === 1) return fileParts[0];

  const result = new Uint8Array(totalLength);

  let currentOffset = 0;

  for(const part of fileParts) {
    result.set(part, currentOffset);
    currentOffset += part.length;
  }

  return result;
}
