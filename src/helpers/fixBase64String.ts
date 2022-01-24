export default function fixBase64String(str: string, toUrl: boolean) {
  if(toUrl) {
    return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/\=+$/, '');
  } else {
    return str.replace(/-/g, '+').replace(/_/g, '/');
  }
}
