export const vertexShaderSource = `
            attribute vec4 aVertexPosition;
            attribute vec2 aTextureCoord;
            varying vec2 vTextureCoord;
            void main(void) {
                gl_Position = aVertexPosition;
                vTextureCoord = aTextureCoord;
            }
        `;

export const vertexShaderSourceFlip = `
            attribute vec4 aVertexPosition;
            attribute vec2 aTextureCoord;
            varying vec2 vTextureCoord;
            void main(void) {
                gl_Position = aVertexPosition;
                vTextureCoord = vec2(aTextureCoord.x, 1.0 - aTextureCoord.y);
            }
        `;

// Fragment shader source
export const fragmentShaderSource = `
            precision highp float;
            varying vec2 vTextureCoord;
            uniform sampler2D sTexture;
            uniform sampler2D inputImageTexture2;
            uniform float intensity;
            
            float enhance(float value) {
                const vec2 offset = vec2(0.001953125, 0.03125);
                value = value + offset.x;
                vec2 coord = (clamp(vTextureCoord, 0.125, 1.0 - 0.125001) - 0.125) * 4.0;
                vec2 frac = fract(coord);
                coord = floor(coord);
                float p00 = float(coord.y * 4.0 + coord.x) * 0.0625 + offset.y;
                float p01 = float(coord.y * 4.0 + coord.x + 1.0) * 0.0625 + offset.y;
                float p10 = float((coord.y + 1.0) * 4.0 + coord.x) * 0.0625 + offset.y;
                float p11 = float((coord.y + 1.0) * 4.0 + coord.x + 1.0) * 0.0625 + offset.y;
                vec3 c00 = texture2D(inputImageTexture2, vec2(value, p00)).rgb;
                vec3 c01 = texture2D(inputImageTexture2, vec2(value, p01)).rgb;
                vec3 c10 = texture2D(inputImageTexture2, vec2(value, p10)).rgb;
                vec3 c11 = texture2D(inputImageTexture2, vec2(value, p11)).rgb;
                float c1 = ((c00.r - c00.g) / (c00.b - c00.g));
                float c2 = ((c01.r - c01.g) / (c01.b - c01.g));
                float c3 = ((c10.r - c10.g) / (c10.b - c10.g));
                float c4 = ((c11.r - c11.g) / (c11.b - c11.g));
                float c1_2 = mix(c1, c2, frac.x);
                float c3_4 = mix(c3, c4, frac.x);
                return mix(c1_2, c3_4, frac.y);
            } 
            vec3 hsv_to_rgb(vec3 c) {
                vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
                vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
                return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
            }
            void main(void) {
                vec4 texel = texture2D(sTexture, vTextureCoord);
                vec4 hsv = texel;
                hsv.y = min(1.0, hsv.y * 1.2);
                hsv.z = min(1.0, enhance(hsv.z) * 1.1);
                gl_FragColor = vec4(hsv_to_rgb(mix(texel.xyz, hsv.xyz, intensity)), texel.w);
                // gl_FragColor = texture2D(inputImageTexture2, vTextureCoord);
            }
        `;

export const rgbToHsvFragmentShaderCode = `
  precision highp float;
  varying vec2 vTextureCoord;
  uniform sampler2D sTexture;
  
  vec3 rgb_to_hsv(vec3 c) {
      vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
      vec4 p = c.g < c.b ? vec4(c.bg, K.wz) : vec4(c.gb, K.xy);
      vec4 q = c.r < p.x ? vec4(p.xyw, c.r) : vec4(c.r, p.yzx);
      float d = q.x - min(q.w, q.y);
      float e = 1.0e-10;
      return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
  }
  
  void main() {
      vec4 texel = texture2D(sTexture, vTextureCoord);
      gl_FragColor = vec4(rgb_to_hsv(texel.rgb), texel.a);
  }
`;
