import type {TextWithEntities} from '@layer';
import createMiddleware from '@helpers/solid/createMiddleware';
import documentFragmentToNodes from '@helpers/dom/documentFragmentToNodes';
import wrapFolderTitle from '@components/wrappers/folderTitle';

/** A folder's title, with the emoji and custom emoji in it - alive for as long as it is shown */
export default function FolderTitleTsx(props: {
  title: TextWithEntities,
  textColor?: string
}) {
  return (
    <>
      {documentFragmentToNodes(wrapFolderTitle(props.title, createMiddleware().get(), true, {textColor: props.textColor}))}
    </>
  );
}
