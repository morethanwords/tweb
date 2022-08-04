export type MyMediaTrackSupportedConstraints = MediaTrackSupportedConstraints & {
  noiseSuppression?: boolean,
  autoGainControl?: boolean
};

export default function constraintSupported(constraint: keyof MyMediaTrackSupportedConstraints) {
  return (!!navigator?.mediaDevices?.getSupportedConstraints() as any as MyMediaTrackSupportedConstraints)[constraint];
}
