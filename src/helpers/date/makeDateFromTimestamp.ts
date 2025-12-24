export function makeDateFromTimestamp(timestamp: number): Date {
  return new Date(timestamp * 1000);
}
