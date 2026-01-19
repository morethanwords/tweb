import {logger} from '@lib/logger';
import {recordPromise} from '@helpers/recordPromise';

export default async function namedPromises<T extends Record<string, any>>(
  promises: T,
  log?: ReturnType<typeof logger>
): Promise<{[Key in keyof T]: Awaited<T[Key]>}> {
  //
  const result: Record<string, any> = {};

  await Promise.all(
    Object.entries(promises).map(async([name, promise]) => {
      log && recordPromise(promise, name, log);
      result[name] = await promise;
    })
  );

  return result as any;
}
