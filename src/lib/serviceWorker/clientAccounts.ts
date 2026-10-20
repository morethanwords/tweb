import {getCurrentAccountFromURL} from '@lib/accounts/getCurrentAccountFromURL';
import {ActiveAccountNumber} from '@lib/accounts/types';

/**
 * The account a tab shows. A tab switches accounts in place and says so (`tabAccount`), while a
 * client's `url` stays the one the tab was opened with - Chromium does not follow `history`.
 * A worker that has just started knows none of them yet: it asks every tab (`hello`) and gives the
 * answer a moment before falling back to the url.
 */
const ANSWER_TIMEOUT = 300;

const accounts: Map<string, ActiveAccountNumber> = new Map();
const waiting: Map<string, Array<() => void>> = new Map();

export function setClientAccount(clientId: string, accountNumber: ActiveAccountNumber) {
  accounts.set(clientId, accountNumber);
  waiting.get(clientId)?.forEach((resolve) => resolve());
  waiting.delete(clientId);
}

export function deleteClientAccount(clientId: string) {
  accounts.delete(clientId);
  waiting.delete(clientId);
}

export default async function getClientAccount(client: Client): Promise<ActiveAccountNumber> {
  if(!accounts.has(client.id)) {
    await new Promise<void>((resolve) => {
      const list = waiting.get(client.id) ?? [];
      list.push(resolve);
      waiting.set(client.id, list);
      setTimeout(resolve, ANSWER_TIMEOUT);
    });

    // * a tab that does not answer (another build) is not waited for again
    if(!accounts.has(client.id)) {
      accounts.set(client.id, getCurrentAccountFromURL(client.url));
    }
  }

  return accounts.get(client.id);
}
