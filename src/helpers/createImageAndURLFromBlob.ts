import {createObjectURL, revokeObjectURL} from '@helpers/objectUrl';

type RenderImageAndURLFromBlobResult = {
  ok: true;
  url: string;
  img: HTMLImageElement;
} | {
  ok: false;
};

export async function createImageAndURLFromBlob(blob: Blob): Promise<RenderImageAndURLFromBlobResult> {
  const url = createObjectURL(blob);

  const img = new Image();
  img.src = url;

  try {
    await img.decode();
    return {ok: true, url, img};
  } catch{
    revokeObjectURL(url);
    return {ok: false};
  }
}
