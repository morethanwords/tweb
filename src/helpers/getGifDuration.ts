/**
 * @returns duration in ms
 */
export default function getGifDuration(image: HTMLImageElement) {
  const src = image.src;

  return fetch(src)
  .then((response) => response.arrayBuffer())
  .then((arrayBuffer) => {
    const d = new Uint8Array(arrayBuffer);
    // Thanks to http://justinsomnia.org/2006/10/gif-animation-duration-calculation/
    // And http://www.w3.org/Graphics/GIF/spec-gif89a.txt
    let duration = 0;
    for(let i = 0, length = d.length; i < length; ++i) {
      // Find a Graphic Control Extension hex(21F904__ ____ __00)
      if(d[i] == 0x21 &&
       d[i + 1] == 0xF9 &&
       d[i + 2] == 0x04 &&
       d[i + 7] == 0x00) {
        // Swap 5th and 6th bytes to get the delay per frame
        const delay = (d[i + 5] << 8) | (d[i + 4] & 0xFF);

        // Should be aware browsers have a minimum frame delay
        // e.g. 6ms for IE, 2ms modern browsers (50fps)
        duration += delay < 2 ? 10 : delay;
      }
    }

    return duration / 1000;
  });
}
