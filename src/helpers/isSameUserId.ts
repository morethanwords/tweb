export default function isSameUserId(a?: UserId, b?: UserId) {
  return a === undefined ? b === undefined : b !== undefined && String(a) === String(b);
}
