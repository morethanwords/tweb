/** A new image element with `src` loaded and decoded; rejects when it cannot be */
export default async function loadDecodedImage(src: string) {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}
