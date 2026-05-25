export function pollOptionToLink(option: Uint8Array): string {
  let binary = '';
  for(let i = 0; i < option.length; i++) binary += String.fromCharCode(option[i]);
  return btoa(binary).replace(/=+$/, '');
}
