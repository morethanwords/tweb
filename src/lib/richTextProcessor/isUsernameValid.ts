export default function isUsernameValid(username: string) {
  return ((username.length >= 3 && username.length <= 32) || !username.length) && /^[a-zA-Z0-9_]*$/.test(username);
}
