/** Collects what node would report unhandled while `run` runs, giving every pending rejection its turn. */
export default async function collectUnhandledRejections(run: () => Promise<any>) {
  const unhandled: any[] = [];
  const onUnhandled = (reason: any) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    await run();
    for(let i = 0; i < 5; ++i) await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }

  return unhandled;
}
