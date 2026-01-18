import wrapDocument from '@components/wrappers/document';
import {MediaComponentProps, MediaTsx} from '@components/wrappers/mediaTsx';
import {Middleware} from '@helpers/middleware';

type DocumentProps = Omit<Parameters<typeof wrapDocument>[0], 'middleware'>;

const loader = (options: DocumentProps & {middleware: Middleware, container: HTMLElement}) => {
  const {container, middleware, ...rest} = options;
  return wrapDocument(rest as any).then((element) => {
    container.appendChild(element);
    return element;
  });
};

export default function DocumentTsx(props: DocumentProps & {
  onResult?: (result: Awaited<ReturnType<typeof wrapDocument>>) => void;
} & MediaComponentProps) {
  return (
    <MediaTsx<DocumentProps, Awaited<ReturnType<typeof wrapDocument>>>
      {...props}
      itemKey="message"
      loader={loader}
    />
  );
}
