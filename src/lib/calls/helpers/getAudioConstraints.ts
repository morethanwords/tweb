import constraintSupported, {MyMediaTrackSupportedConstraints} from '../../../environment/constraintSupport';

export default function getAudioConstraints(): MediaTrackConstraints {
  const constraints: MediaTrackConstraints = {
    channelCount: 2
  };

  const desirable: (keyof MyMediaTrackSupportedConstraints)[] = [
    'noiseSuppression',
    'echoCancellation',
    'autoGainControl'
  ];

  desirable.forEach((constraint) => {
    if(constraintSupported(constraint)) {
      // @ts-ignore
      constraints[constraint] = true;
    }
  });

  return constraints;
}
