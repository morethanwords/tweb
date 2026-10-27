export type MyMediaTrackSupportedConstraints = MediaTrackSupportedConstraints & {
  noiseSuppression?: boolean,
  autoGainControl?: boolean
};

export default function constraintSupported(constraint: keyof MyMediaTrackSupportedConstraints) {
  const supported = navigator?.mediaDevices?.getSupportedConstraints() as MyMediaTrackSupportedConstraints;
  return !!supported?.[constraint];
}
