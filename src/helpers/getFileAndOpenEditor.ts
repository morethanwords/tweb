import {MediaEditorFinalResult} from '@components/mediaEditor/finalRender/createFinalResult';
import IMAGE_MIME_TYPES_SUPPORTED from '@environment/imageMimeTypesSupport';
import VIDEO_MIME_TYPES_SUPPORTED from '@environment/videoMimeTypesSupport';
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
  canImageResultInGIF?: boolean;
  /**
   * Allowed media types in the file picker. Defaults to images only.
   */
  acceptMediaTypes?: Array<'photo' | 'video'>;
  /**
   * Optional gate to decide whether the editor should be opened for the selected file.
   * If it returns false, `onSkipEditor` is called with the file and the editor is not opened.
   * Defaults to always opening the editor.
   */
  shouldOpenEditor?: (file: File) => boolean | Promise<boolean>;
  onSkipEditor?: (file: File) => void;
  onFinish: (args: OnFinishArgs) => void;
};

export async function getFileAndOpenEditor({
  onFinish,
  dontCreatePreview,
  isEditingForAvatar,
  isEditingForumAvatar,
  canImageResultInGIF = false,
  acceptMediaTypes = ['photo'],
  shouldOpenEditor,
  onSkipEditor
}: GetFileAndOpenEditorArgs) {
  const input = createHiddenFileInput(acceptMediaTypes);
  document.body.append(input);

  const file = await getFileFromInput(input).finally(() => {
    input.remove();
  });

  if(!file) return;

  if(shouldOpenEditor && !(await shouldOpenEditor(file))) {
    onSkipEditor?.(file);
    return;
  }

  const isVideo = file.type.startsWith('video/');

  let mediaSrc: string;
  if(isVideo) {
    mediaSrc = URL.createObjectURL(file);
  } else {
    const imgResult = await createImageAndURLFromBlob(file); // make sure to render the image to know if it's valid
    if(!imgResult.ok) return;
    mediaSrc = imgResult.url;
  }

  const {openMediaEditorFromMediaRaw} = await import('@components/mediaEditor');

  openMediaEditorFromMediaRaw({
    isEditingForAvatar,
    isEditingForumAvatar,
    canFinishWithoutChanges: true,
    canImageResultInGIF,
    getMediaBlob: async() => file,
    managers: rootScope.managers,
    mediaSrc,
    mediaType: isVideo ? 'video' : 'image',
    initialTab: 'crop',
    onEditFinish: (editorResult) => onFinish({editorResult, originalFile: file}),
    dontCreatePreview,
    onClose: () => { }
  });
}

function createHiddenFileInput(acceptMediaTypes: Array<'photo' | 'video'>): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'file';
  input.style.display = 'none';

  const mimeTypes: string[] = [];
  if(acceptMediaTypes.includes('photo')) mimeTypes.push(...IMAGE_MIME_TYPES_SUPPORTED);
  if(acceptMediaTypes.includes('video')) mimeTypes.push(...VIDEO_MIME_TYPES_SUPPORTED);
  input.accept = mimeTypes.join(',');

  return input;
}

function getFileFromInput(input: HTMLInputElement): Promise<File | void> {
  const promise = new Promise<File | void>((resolve) => {
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      resolve(file);
    });

    // Resolve the promise if the user cancels the file selection
    window.addEventListener('focus', () => {
      // It seems like the focus event fires before the change event, so we need to wait a bit before resolving
      setTimeout(() => {
        input.remove();
        resolve();
      }, 1000);
    }, {once: true});
  });

  input.click();

  return promise;
}
