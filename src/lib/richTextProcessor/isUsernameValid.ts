export default function isUsernameValid(username: string) {
  return ((username.length >= 5 && username.length <= 32) || !username.length) && /^[a-zA-Z0-9_]*$/.test(username);
}
