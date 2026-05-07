import {MediaEditorFinalResult} from '@components/mediaEditor/finalRender/createFinalResult';
import IMAGE_MIME_TYPES_SUPPORTED from '@environment/imageMimeTypesSupport';
import {createImageAndURLFromBlob} from '@helpers/createImageAndURLFromBlob';
import rootScope from '@lib/rootScope';


type OnFinishArgs = {
  editorResult: MediaEditorFinalResult;
  originalFile: File;
};

type GetFileAndOpenEditorArgs = {
  dontCreatePreview?: boolean;
  isEditingForAvatar?: boolean;
  isEditingForumAvatar?: boolean;
  onFinish: (args: OnFinishArgs) => void;
};

export async function getFileAndOpenEditor({onFinish, dontCreatePreview, isEditingForAvatar, isEditingForumAvatar}: GetFileAndOpenEditorArgs) {
  const input = createHiddenFileInput();
  document.body.append(input);

  const file = await getFileFromInput(input).finally(() => {
    input.remove();
  });

  if(!file) return;


  const imgResult = await createImageAndURLFromBlob(file); // make sure to render the image to know if it's valid
  if(!imgResult.ok) return;

  const {openMediaEditorFromMediaRaw} = await import('@components/mediaEditor');

  openMediaEditorFromMediaRaw({
    isEditingForAvatar,
    isEditingForumAvatar,
    canFinishWithoutChanges: true,
    canImageResultInGIF: false,
    getMediaBlob: async() => file,
    managers: rootScope.managers,
    mediaSrc: imgResult.url,
    mediaType: 'image',
    initialTab: 'crop',
    onEditFinish: (editorResult) => onFinish({editorResult, originalFile: file}),
    dontCreatePreview,
    onClose: () => { }
  });
}

function createHiddenFileInput(): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'file';
  input.style.display = 'none';
  input.accept = [...IMAGE_MIME_TYPES_SUPPORTED].join(',');

  return input;
}

function getFileFromInput(input: HTMLInputElement): Promise<File | undefined> {
  const promise = new Promise<File | undefined>((resolve) => {
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      resolve(file);
    }, false);
  });

  input.click();

  return promise;
}
