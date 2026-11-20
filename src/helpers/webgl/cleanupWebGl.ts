/** Release GPU memory immediately; missing or unavailable contexts need no cleanup. */
export function cleanupWebGl(gl: WebGLRenderingContext | WebGL2RenderingContext | null) {
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
}
