export default function SVGIcon(props: {
  class?: string,
  width: number,
  height: number,
  use?: string
}) {
  return (
    <svg
      class={props.class}
      xmlns="http://www.w3.org/2000/svg"
      width={props.width}
      height={props.height}
      viewBox={`0 0 ${props.width} ${props.height}`}
    >
      {props.use && <use href={`#${props.use}`} />}
    </svg>
  ) as HTMLElement;
}
