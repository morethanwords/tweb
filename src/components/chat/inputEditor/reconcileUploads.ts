import type {ChatInputEditor, ChatInputRichMedia} from '@components/chat/inputEditor/types';

type UploadTask = {
  editor: ChatInputEditor,
  id: string,
  items: readonly {uploaded?: ChatInputRichMedia}[]
};

export default function reconcileRichMediaUploads<T extends UploadTask>(
  editor: ChatInputEditor,
  tasks: Map<string, T>,
  handlers: {
    cancel: (task: T, removeNode: boolean) => void,
    complete: (task: T) => void,
    update: (task: T) => void
  }
) {
  const pendingIds = new Set(editor.getPendingRichMediaUploadIds());
  let checkedReferences = false;
  let retainedIds: Set<string> | undefined;
  [...tasks.values()].forEach((task) => {
    if(task.editor !== editor) return;
    if(!pendingIds.has(task.id)) {
      if(!checkedReferences) {
        const references = editor.getReferencedRichMediaUploadIds();
        retainedIds = references && new Set(references);
        checkedReferences = true;
      }
      if(retainedIds && !retainedIds.has(task.id)) handlers.cancel(task, false);
      return;
    }
    if(task.items.length && task.items.every(({uploaded}) => !!uploaded)) {
      if(editor.completeRichMediaUpload(task.id, task.items.map(({uploaded}) => uploaded!))) {
        handlers.complete(task);
      } else {
        handlers.cancel(task, true);
      }
    } else {
      handlers.update(task);
    }
  });
  pendingIds.forEach((uploadId) => {
    if(!tasks.has(uploadId)) editor.removeRichMediaUpload(uploadId);
  });
}
