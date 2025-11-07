export function isTempId(id: number): boolean {
  return id > Math.floor(id);
}
