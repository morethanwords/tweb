export default async function mergeEphemeralHistoryForRender<
  HistoryEntry,
  EphemeralMessage extends HistoryEntry
>(
  history: HistoryEntry[],
  shouldLoad: boolean,
  load: () => Promise<EphemeralMessage[]>
) {
  if(!shouldLoad) {
    return [] as EphemeralMessage[];
  }

  const messages = await load();
  history.push(...messages);
  return messages;
}
