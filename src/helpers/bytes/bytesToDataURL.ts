export default function bytesToDataURL(bytes: Uint8Array, mimeType: string = 'image/jpeg') {
  return `data:${mimeType};base64,${btoa(String.fromCharCode(...bytes))}`;
}
