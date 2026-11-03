// The gem as a send goes (iOS DiamondTransferAnimation, the amount screen's storyboard): its energy gathers in
// .45 s, a hit swells it at the start, and it breathes 1.1 times a second. Plain curves of the seconds `t` since the
// send began, with nothing imported: the chat's transfer card uses them without the renderer.

export const gemSendEnergy = (t: number) => Math.pow(Math.min(Math.max(t / 0.45, 0), 1), 0.65);

/** up for a fifth of a second and back, a little lower at the end */
export const gemSendHit = (t: number) => t > 0 && t < 0.42 ? Math.sin(Math.PI * t / 0.42) * (1 - 0.3 * t / 0.42) : 0;

export const gemBreath = (t: number) => Math.sin(2 * Math.PI * 1.1 * t);
