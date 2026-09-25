import noop from '@helpers/noop';
import {defineStories} from '@components/popupSandbox/registry';

defineStories('Rich editor', [
  {
    id: 'richEditor/createLink',
    title: 'Create a link',
    open: async() => {
      const {default: showCreateLinkPopup} = await import('@components/popups/createLink');
      void showCreateLinkPopup({text: 'Telegram', url: 'https://telegram.org'}).catch(noop);
    }
  },
  {
    id: 'richEditor/linkSelection',
    title: 'Link for selected text',
    open: async() => {
      const [{default: createEditor}, {openCreateLinkPopupForEditor}] = await Promise.all([
        import('@components/chat/inputEditor'),
        import('@components/popups/createLinkForInput')
      ]);
      const input = document.createElement('div');
      input.hidden = true;
      document.body.append(input);
      const editor = createEditor(input);
      editor.setTextWithEntities('Telegram');
      editor.restoreSelection({from: 1, to: 9}, false);
      const cleanup = () => {
        editor.destroy();
        input.remove();
      };
      void openCreateLinkPopupForEditor(editor).then(cleanup, cleanup);
    }
  },
  {
    id: 'richEditor/addButton',
    title: 'Add a button',
    open: async() => {
      const {default: showRichButtonPopup} = await import('@components/popups/richButton');
      void showRichButtonPopup({canChooseLine: true, separateLine: true}).catch(noop);
    }
  },
  {
    id: 'richEditor/editButton',
    title: 'Edit a button',
    open: async() => {
      const {default: showRichButtonPopup} = await import('@components/popups/richButton');
      void showRichButtonPopup({
        button: {text: 'Copy the code', action: 'copy', copyText: 'TELEGRAM', color: 'success'}
      }).catch(noop);
    }
  },
  {
    id: 'richEditor/location',
    title: 'Insert a map',
    open: async() => {
      const {default: showRichMessageLocationPicker} = await import('@components/popups/richMessageLocation');
      void showRichMessageLocationPicker({}).catch(noop);
    }
  },
  {
    id: 'richEditor/createWithAi',
    title: 'Create with AI',
    open: async(ctx) => {
      const [{openCreateWithAiPopup}, {default: HotReloadGuard}] = await Promise.all([
        import('@components/popups/aiEditorPopup/createWithAiPopup'),
        import('@lib/solidjs/hotReloadGuardProvider')
      ]);
      openCreateWithAiPopup({
        peerId: ctx.peer('private'),
        onApply: noop,
        onApplyRichMessage: noop
      }, HotReloadGuard);
    }
  }
]);
