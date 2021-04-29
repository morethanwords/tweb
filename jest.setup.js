const webCrypto = require('@peculiar/webcrypto');
const textEncoding = require('text-encoding');

window.crypto = new webCrypto.Crypto();
window.TextEncoder = textEncoding.TextEncoder;

const a = 1;
