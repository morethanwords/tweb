export type CallDeviceKind = 'speaker' | 'microphone' | 'camera';

export const CALL_DEVICE_SETTING_KEYS = {
  speaker: 'speakerId',
  microphone: 'microphoneId',
  camera: 'cameraId'
} as const satisfies Record<CallDeviceKind, 'speakerId' | 'microphoneId' | 'cameraId'>;
