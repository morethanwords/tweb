export default async function namedPromises<T extends Record<string, any>>(
  promises: T
): Promise<{[Key in keyof T]: Awaited<T[Key]>}> {
  //
  const result: Record<string, any> = {};

  await Promise.all(
    Object.entries(promises).map(async([name, promise]) => {
      result[name] = await promise;
    })
  );

  return result as any;
}
