/** The items in runs of at most `size`, in their order. */
export default function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for(let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}
