import IS_WEBP_SUPPORTED from '@environment/webpSupport';

const IMAGE_MIME_TYPES_SUPPORTED = new Set([
  'image/jpeg',
  'image/png',
  'image/bmp'
]);

if(IS_WEBP_SUPPORTED) {
  IMAGE_MIME_TYPES_SUPPORTED.add('image/webp');
}

const possible: [string, string][] = [
  ['image/jxl', 'data:image/jxl;base64,/woIAAAMABKIAgC4AF3lEgAAFSqjjBu8nOv58kOHxbSN6wxttW1hSaLIODZJJ3BIEkkaoCUzGM6qJAE='],
  // * Safari decodes HEIC/HEIF natively — a photo or screenshot copied there
  // * arrives as image/heic, which is otherwise attached as a plain file
  ['image/heic', 'data:image/heic;base64,AAAAJGZ0eXBoZWljAAAAAG1pZjFNaVBybWlhZk1pSEJoZWljAAABh21ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAHBpY3QAAAAAAAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAADnBpdG0AAAAAAAEAAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABodmMxAAAAAOdpcHJwAAAAxmlwY28AAAATY29scm5jbHgAAgACAAaAAAAADGNsbGkAywBAAAAAFGlzcGUAAAAAAAAAAgAAAAIAAAAJaXJvdAAAAAAQcGl4aQAAAAADCAgIAAAAcmh2Y0MBA3AAAACwAAAAAAAe8AD8/fj4AAALA6AAAQAXQAEMAf//A3AAAAMAsAAAAwAAAwAecCShAAEAJEIBAQNwAAADALAAAAMAAAMAHqAUIEHAoQQYh7kWVTcCAgYAgKIAAQAJRAHAYXLIQFMkAAAAGWlwbWEAAAAAAAAAAQABBoECAwWGhAAAAB5pbG9jAAAAAEQAAAEAAQAAAAEAAAG7AAAAPwAAAAFtZGF0AAAAAAAAAE8AAAA7KAGvo18RlYOks8JirQbL8J+iyr//+nNAELPHO3v/7JYAD+1x8D8H84kQNpk9wypHHr/f26A0pw2GWDU='],
  ['image/avif', 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A=']
];

const promises = possible.map(([mime, data]) => {
  const img = new Image();
  const promise = new Promise<string>((resolve) => {
    img.onload = img.onerror = () => {
      const supported = img.height === 2;
      resolve(supported ? mime : undefined);
    };
  });
  img.src = data;
  return promise;
});

export const IMAGE_MIME_TYPES_SUPPORTED_PROMISE = Promise.all(promises).then((mimeTypes) => mimeTypes.filter(Boolean));

export default IMAGE_MIME_TYPES_SUPPORTED;
