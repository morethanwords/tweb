export function pollOptionToLink(option: Uint8Array): string {
  let binary = '';
  for(let i = 0; i < option.length; i++) binary += String.fromCharCode(option[i]);
  return btoa(binary).replace(/=+$/, '');
}

export function linkToPollOption(base64: string): Uint8Array | undefined {
  try {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for(let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch{
    return undefined;
  }
}
