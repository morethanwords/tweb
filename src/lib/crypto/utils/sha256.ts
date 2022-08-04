import convertToUint8Array from '../../../helpers/bytes/convertToUint8Array';
import subtle from '../subtle';
// import sha256 from '@cryptography/sha256';

export default function sha256(bytes: Parameters<typeof convertToUint8Array>[0]) {
  return subtle.digest('SHA-256', convertToUint8Array(bytes)).then((b) => {
    // console.log('legacy', performance.now() - perfS);
    return new Uint8Array(b);
  });
  /* //console.log('SHA-256 hash start');

  let perfS = performance.now();


  let perfD = performance.now();
  let words = typeof(bytes) === 'string' ? bytes : bytesToWordss(bytes as any);
  let hash = sha256(words);
  console.log('darutkin', performance.now() - perfD);

  //console.log('SHA-256 hash finish', hash, sha256(words, 'hex'));

  return bytesFromWordss(hash); */
}
