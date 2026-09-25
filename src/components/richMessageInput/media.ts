import {toastNew} from '@components/toast';
import getFileNameForUpload from '@helpers/getFileNameForUpload';
import getFileMimeType from '@helpers/files/getFileMimeType';
import {ChatInputEditor} from '@components/chat/inputEditor';
import reconcileRichMediaUploads from '@components/chat/inputEditor/reconcileUploads';
import {canStartRichMediaUpload, isRichMediaInsertSelectionCurrent, RichMediaItemInsertAction} from '@components/chat/inputEditor/mediaPaste';
import prepareRichMediaUpload from '@components/chat/inputEditor/prepareRichMediaUpload';
import {getRichMessageMediaFileType, groupRichMessageMediaEntries, normalizeRichMessageMediaFile} from '@helpers/files/richMessageMediaInsertPolicy';
import type {ChatInputRichMediaUploadItem} from '@components/chat/inputEditor/types';
import {createRichMediaPreviewUrl} from '@components/chat/inputEditor/mediaPreviewUrl';
import type {SendFileDetails, UploadedRichMessageMedia} from '@appManagers/appMessagesManager';
import {loadRichMediaPreview} from '@components/richMessageInput/mediaPreview';

export type RichMediaUploadTaskItem = ChatInputRichMediaUploadItem & {
  file: File,
  /**
   * Owned by the `run` that started this item. The presented state is not a
   * claim of ownership: an item still preparing when a sibling fails must not
   * be uploaded a second time by the retry.
   */
  inFlight?: boolean,
  previewUrl: string,
  releasePreviewUrl: () => void,
  uploaded?: UploadedRichMessageMedia,
  uploadingFileName?: string
};

export type RichMediaUploadSession = {
  isCurrent: () => boolean,
  authorize: (files: File[]) => Promise<boolean>,
  upload: (details: SendFileDetails, fileName: string) => Promise<UploadedRichMessageMedia>,
  cancel: (fileName: string) => void
};

export type RichMediaUploadServices = {
  capture: () => RichMediaUploadSession,
  subscribeProgress?: (callback: (progress: {fileName: string, done: number, total: number}) => void) => () => void
};

type RichMediaUploadTask = {
  editor: ChatInputEditor,
  id: string,
  items: RichMediaUploadTaskItem[],
  session: RichMediaUploadSession
};

let richMediaUploadId = 0;

export default class RichMediaUploads {
  private tasks = new Map<string, RichMediaUploadTask>();
  private uploadsByFileName = new Map<string, {item: RichMediaUploadTaskItem, task: RichMediaUploadTask}>();
  private unsubscribe: VoidFunction;
  private destroyed = false;

  constructor(private options: {
    getEditor: () => ChatInputEditor,
    isExpanded: () => boolean,
    services: RichMediaUploadServices
  }) {
    this.unsubscribe = options.services.subscribeProgress?.((progress) => {
      const upload = this.uploadsByFileName.get(progress.fileName);
      if(!upload) return;
      const {item, task} = upload;
      item.progress = progress.total ? Math.max(0, Math.min(1, progress.done / progress.total)) : 0;
      item.state = progress.total && progress.done >= progress.total ? 'processing' : 'uploading';
      if(!this.update(task)) this.reconcile();
    });
  }

  private get editor() {return this.options.getEditor();}
  private get expanded() {return this.options.isExpanded();}
  public get pendingTasks() {return this.tasks.size;}

  public rebindEditor() {
    this.tasks.forEach((task) => {task.editor = this.editor; this.update(task);});
    this.reconcile();
  }

  public handleAction(action: 'remove' | 'retry', uploadId: string) {
    const task = this.tasks.get(uploadId);
    if(!task) return;
    if(action === 'remove') return this.cancel(task);
    task.items.forEach((item) => {
      if(item.uploaded || item.inFlight || item.state !== 'error') return;
      item.progress = 0;
      item.state = 'preparing';
      item.uploadingFileName = undefined;
    });
    this.update(task);
    void this.run(task);
  }

  public clear() {
    [...this.tasks.values()].forEach((task) => this.cancel(task, false));
  }

  public destroy() {
    this.destroyed = true;
    this.unsubscribe?.();
    this.clear();
  }

  private presentation(task: RichMediaUploadTask) {
    return task.items.map(({
      duration,
      fileName,
      fileSize,
      height,
      id,
      mimeType,
      progress,
      state,
      type,
      width
    }) => ({
      duration,
      fileName,
      fileSize,
      height,
      id,
      mimeType,
      progress,
      state,
      type,
      width
    }));
  }

  private update(task: RichMediaUploadTask) {
    return task.editor.updateRichMediaUpload(
      task.id,
      this.presentation(task)
    );
  }

  private cleanup(task: RichMediaUploadTask) {
    if(this.tasks.get(task.id) !== task) return;
    this.tasks.delete(task.id);
    task.items.forEach((item) => {
      if(item.uploadingFileName) {
        this.uploadsByFileName.delete(item.uploadingFileName);
      }
      item.releasePreviewUrl();
    });
  }

  private cancel(task: RichMediaUploadTask, removeNode = true) {
    task.items.forEach((item) => {
      if(!item.uploadingFileName) return;
      this.uploadsByFileName.delete(item.uploadingFileName);
      void task.session.cancel(item.uploadingFileName);
    });
    if(removeNode) task.editor.removeRichMediaUpload(task.id);
    this.cleanup(task);
  }

  public reconcile() {
    const editor = this.editor;
    if(!editor) return;
    reconcileRichMediaUploads(editor, this.tasks, {
      cancel: (task, removeNode) => this.cancel(task, removeNode),
      complete: (task) => this.cleanup(task),
      update: (task) => this.update(task)
    });
  }

  private async uploadItem(
    task: RichMediaUploadTask,
    item: RichMediaUploadTaskItem
  ) {
    item.inFlight = true;
    item.progress = 0;
    item.state = 'preparing';
    this.update(task);
    try {
      const sendFileDetails = await prepareRichMediaUpload(item.file);
      if(this.tasks.get(task.id) !== task) return;
      const uploadFile = sendFileDetails.file;
      if(!(uploadFile instanceof File) && !(uploadFile instanceof Blob)) {
        throw new Error('RICH_MESSAGE_MEDIA_FILE_REQUIRED');
      }
      item.duration = sendFileDetails.duration;
      item.height = sendFileDetails.height;
      item.mimeType = getFileMimeType(uploadFile);
      item.width = sendFileDetails.width;
      const uploadingFileName = getFileNameForUpload(uploadFile);
      item.uploadingFileName = uploadingFileName;
      item.state = 'uploading';
      this.uploadsByFileName.set(uploadingFileName, {item, task});
      this.update(task);
      const uploaded = await task.session.upload(sendFileDetails, uploadingFileName);
      if(this.tasks.get(task.id) !== task) return;
      item.uploaded = uploaded;
      this.uploadsByFileName.delete(uploadingFileName);
      item.progress = 1;
      item.state = 'ready';
      this.update(task);
    } catch(err) {
      if(item.uploadingFileName) {
        this.uploadsByFileName.delete(item.uploadingFileName);
      }
      if(this.tasks.get(task.id) !== task) return;
      console.error('rich message media upload error', err);
      item.state = 'error';
      this.update(task);
    } finally {
      item.inFlight = false;
    }
  }

  private async run(task: RichMediaUploadTask) {
    await Promise.all(task.items.filter((item) => (
      !item.uploaded && !item.inFlight
    )).map((item) => this.uploadItem(task, item)));
    if(this.tasks.get(task.id) !== task) return;
    if(task.items.some((item) => !item.uploaded)) {
      this.update(task);
      return;
    }
    if(
      this.editor !== task.editor ||
      !task.session.isCurrent()
    ) {
      this.cancel(task);
      return;
    }
    this.reconcile();
  }

  public async insert(
    files: File[],
    selection: ReturnType<ChatInputEditor['captureSelection']>,
    itemAction?: RichMediaItemInsertAction
  ) {
    const editor = this.editor;
    const session = this.options.services.capture();
    const isCurrent = () => !this.destroyed && session.isCurrent() && this.editor === editor &&
      canStartRichMediaUpload(this.expanded, itemAction);
    if(
      !editor ||
      !files.length ||
      !isCurrent()
    ) return false;
    const selectionIsCurrent = () => isRichMediaInsertSelectionCurrent(
      selection,
      editor.captureSelection().revision
    );
    if(!selectionIsCurrent()) {
      toastNew({langPackKey: 'RichMessage.Error.InsertTargetChanged'});
      return false;
    }
    const entries = files.map((inputFile) => {
      const file = normalizeRichMessageMediaFile(inputFile);
      const mimeType = getFileMimeType(file);
      return {
        file,
        mimeType,
        type: getRichMessageMediaFileType(mimeType, file.name)
      };
    });
    if(entries.some(({type}) => !type) || itemAction && entries.some(({type}) => type === 'audio')) {
      toastNew({langPackKey: 'RichMessage.Error.UnsupportedContent'});
      return false;
    }

    const allowed = await session.authorize(entries.map(({file}) => file));
    if(!allowed || !isCurrent()) return false;
    if(!selectionIsCurrent()) {
      toastNew({langPackKey: 'RichMessage.Error.InsertTargetChanged'});
      return false;
    }

    const groups = itemAction ? [entries] : groupRichMessageMediaEntries(entries);

    const tasks = groups.map((group): RichMediaUploadTask => {
      const id = `rich-media-upload-${Date.now()}-${++richMediaUploadId}`;
      const items = group.map((entry, index): RichMediaUploadTaskItem => {
        const preview = createRichMediaPreviewUrl(entry.file);
        return {
          file: entry.file,
          fileName: entry.file.name,
          fileSize: entry.file.size,
          id: `${id}-${index}`,
          mimeType: entry.mimeType,
          previewUrl: preview.url,
          progress: 0,
          releasePreviewUrl: preview.release,
          state: 'preparing',
          type: entry.type
        };
      });
      return {editor, id, items, session};
    });
    const releaseTaskPreviews = () => {
      tasks.forEach((task) => {
        task.items.forEach((item) => item.releasePreviewUrl());
      });
    };
    try {
      await Promise.all(tasks.flatMap((task) => task.items.map((item) => (
        loadRichMediaPreview(item)
      ))));
    } catch(err) {
      console.error('rich message media preview error', err);
      releaseTaskPreviews();
      if(isCurrent()) toastNew({langPackKey: 'RichMessage.Error.UnsupportedContent'});
      return false;
    }
    if(!isCurrent()) {
      releaseTaskPreviews();
      return false;
    }
    if(!selectionIsCurrent()) {
      releaseTaskPreviews();
      toastNew({langPackKey: 'RichMessage.Error.InsertTargetChanged'});
      return false;
    }
    const uploadOptions = tasks.map((task) => ({
      action: itemAction?.action,
      activeIndex: itemAction?.activeIndex,
      grouped: task.items.length > 1,
      id: task.id,
      items: this.presentation(task),
      previewUrls: task.items.map((item) => item.previewUrl),
      selection
    }));
    const began = itemAction ?
      editor.beginRichMediaUpload(uploadOptions[0]) :
      editor.beginRichMediaUploads(uploadOptions);
    if(!began) {
      releaseTaskPreviews();
      toastNew({langPackKey: 'Error.AnError'});
      return false;
    }

    tasks.forEach((task) => {
      this.tasks.set(task.id, task);
    });
    tasks.forEach((task) => void this.run(task));
    return true;
  }
}
