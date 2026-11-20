/** TEST-ONLY composition companion to the pinned Android shape shader.
 * TelegramMessenger/Telegram-Android@21f7d109da6ab3506c9e9577f98c6a38771ab335
 * ShaderSet.java PAINT_COMPOSITEWITHMASKERASER_FSH (same arithmetic).
 * Presentation is a WebGL boundary adapter, not a native color-management port.
 */
export const androidPaintTransferFragment = `
precision highp float;
varying vec2 varTexcoord;
uniform sampler2D source;
uniform sampler2D eraseMask;
uniform bool erasing;
uniform bool flipY;
uniform float eraseAlpha;
void main(void) {
  vec2 uv = vec2(varTexcoord.x, flipY ? 1. - varTexcoord.y : varTexcoord.y);
  vec4 dst = texture2D(source, uv);
  if(erasing) {
    float srcAlpha = eraseAlpha * texture2D(eraseMask, uv).a;
    dst.a = dst.a * (1. - srcAlpha);
    if(dst.a <= 0.) dst.rgb = vec3(0.);
  }
  gl_FragColor = dst;
}`;
