/**
 * Read a sender's parameters, let `update` change them in place, and write
 * them back only when it reports a change. Resolves whether it wrote.
 * setParameters must not overlap on one sender — callers serialize.
 */
export default async function updateSenderParameters(
  sender: RTCRtpSender | undefined,
  update: (parameters: RTCRtpSendParameters) => boolean
): Promise<boolean> {
  if(!sender || typeof(sender.getParameters) !== 'function') {
    return false;
  }

  const parameters = sender.getParameters();
  if(!update(parameters)) {
    return false;
  }

  await sender.setParameters(parameters);
  return true;
}

/**
 * A shared screen keeps its resolution and gives up frame rate under
 * congestion, so text stays legible — native sets MAINTAIN_RESOLUTION on its
 * screencast channel. Reports whether it changed the parameters.
 */
export function preferScreencastResolution(parameters: RTCRtpSendParameters) {
  if(parameters.degradationPreference === 'maintain-resolution') {
    return false;
  }

  parameters.degradationPreference = 'maintain-resolution';
  return true;
}
