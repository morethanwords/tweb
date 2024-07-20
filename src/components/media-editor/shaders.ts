export const vertexShaderSource = `
            attribute vec4 aVertexPosition;
            attribute vec2 aTextureCoord;
            varying vec2 vTextureCoord;
            void main(void) {
                gl_Position = aVertexPosition;
                vTextureCoord = aTextureCoord;
            }
        `;

export const textureFragmentShaderReal = `
precision highp float;
            varying vec2 vTextureCoord;
            uniform sampler2D sTexture;
            
            void main(void) {
                vec4 texel = texture2D(sTexture, vTextureCoord);
                // float dist = distance(texel);
                gl_FragColor = texel; // vec4(texel.xyz, dist);
           }
`;

// 960 1280
export const textureFragmentShader = `
            precision highp float;
            varying vec2 vTextureCoord;
            uniform sampler2D sTexture;
            
            void main(void) {
                vec4 texel = texture2D(sTexture, vTextureCoord);
                gl_FragColor = texel;
                
                if (length(texel) > 0.0) {
                
                //return;
                }
                
                vec4 black = vec4(0.0, 0.0, 0.0, 1.0);
                    bool foundDifferent = false;
                    int maxRadius = 11;
                    const int uRadius = 60;
                    float w = 1.0 / float(960);
                    float h = 1.0 / float(1280);
                    
                    int layersCount = 0;
                    
                    for (int x = -uRadius; x <= uRadius; x += 1) {
                        if (x < 0 && -maxRadius > x) {
                            continue;
                        }
                        
                        if (x > 0 && maxRadius < x) {
                            continue;
                        }
                        for (int y = -uRadius; y <= uRadius; y += 1) {
                                if (y < 0 && -maxRadius > y) {
                                    continue;
                                }
                                
                                if (y > 0 && maxRadius < y) {
                                    continue;
                                }

                            vec2 offset = vec2(float(x) * w, float(y) * h);
                            
                            if(length(offset) >= (float(maxRadius) / 1280.0)) {
                                continue;
                            }
                          
                            vec4 texColor = texture2D(sTexture, vTextureCoord + offset);
                            if (length(texColor) > 0.0) {
                            
                            gl_FragColor = vec4(offset, 0.0, 1.0); // Color if different pixel found
                                foundDifferent = true;
                                layersCount += 1;
                                // break;
                            }
                        }
                        if (foundDifferent) {
                            // break;
                        }
                    }
                    
                    // foundDifferent = true;
                     if (foundDifferent) {
                    gl_FragColor = vec4(1.0, 0.5, 0.3, 1.0);
                    } else {
                    gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
                    }
                    return;
                    
                    if (foundDifferent) {
                    // we can calculate a table fro those things: step and  intensity threshold
                        // float intensity = 0.0015 * float(layersCount);
                        float intensity = float(layersCount) / (float(uRadius * uRadius) * 0.78);
                        if(intensity * intensity < 0.007) {
                               intensity = 0.0; 
                        }
                        // 0.3 + (intensity * 0.8)
                        intensity = intensity * 10.0;
                        gl_FragColor = vec4(0.3 + (intensity * 0.1), 0.0, 0.0, 1.0); // vec4(mix(vec4(1.0, 1.0, 1.0, 1.0).xyz, gl_FragColor.xyz, 0.5).xyz, 0.1 * float(layersCount));
                    } else {
                        gl_FragColor = texel + vec4(1.0, 1.0, 1.0, 1.0); // Color if all pixels are black
                    }
            }
`;

export const vertexShaderSourceFlip = `
            attribute vec4 aVertexPosition;
            attribute vec2 aTextureCoord;
            varying vec2 vTextureCoord;
            varying vec2 vVertexPosition;
            void main(void) {
                gl_Position = aVertexPosition;
                vVertexPosition = aVertexPosition.xy;
                vTextureCoord = vec2(aTextureCoord.x, 1.0 - aTextureCoord.y);
            }
        `;

// Fragment shader source
export const fragmentShaderSource = `
            precision highp float;
            varying vec2 vTextureCoord;
            varying vec2 vVertexPosition;
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
                
                float dline( vec2 p, vec2 a, vec2 b ) {
    
    vec2 v = a, w = b;
    
    float l2 = pow(distance(w, v), 2.);
    if(l2 == 0.0) return distance(p, v);
    
    float t = clamp(dot(p - v, w - v) / l2, 0., 1.);
    vec2 j = v + t * (w - v);
    
    return distance(p, j);
    
}
            
            void main(void) {
                vec2 start = vec2(-0.5, -0.5);
                vec2 end = vec2(0.5, 0.5);
                vec4 texel = texture2D(sTexture, vTextureCoord);
                vec4 hsv = texel;
                hsv.y = min(1.0, hsv.y * 1.2);
                hsv.z = min(1.0, enhance(hsv.z) * 1.1);
                
                float gg = dline(vVertexPosition, start, end);
                vec4 rrr = vec4(0.0, 0.0, 0.0, 1.0);
                
                if(gg < 0.1) {
                    rrr = vec4(1.0, 1.0, 0.0, 1.0) * (1.0 - gg * 10.0);
                    
                    if(gg < 0.05) {
                        rrr = vec4(1.0, 1.0, 1.0, 1.0);
                    }
                }
                
                // gl_FragColor = vec4(hsv_to_rgb(mix(texel.xyz, hsv.xyz, intensity)) + rrr.xyz, texel.w);
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

export const linesVertexShaderSource = `
attribute vec4 aVertexPosition;
            
void main(void) {
  gl_Position = aVertexPosition;
  gl_PointSize = 50.0;
}
`;

export const linesFragmentShaderSource = `
void main() {
  gl_FragColor = vec4(1.0, 1.0, 0.0, 1.0);
}`;

/*
export const lineOverTextFrag = `
attribute vec4 aVertexPosition;

void main(void) {
  gl_Position = aVertexPosition;
}
`;

export const linesFragmentShaderSource = `
void main() {
  gl_FragColor = vec4(1.0, 1.0, 0.0, 1.0);
}`;
 */

export const vert = `
attribute vec2 position;
attribute vec2 normal;
attribute float miter; 
varying float edge;

void main() {
  float thickness = 0.1;
  edge = sign(miter);
  vec2 pointPos = position.xy + vec2(normal * thickness/2.0 * miter);
  gl_Position = projection * view * model * vec4(pointPos, 0.0, 1.0);
  gl_PointSize = 1.0;
}
`;

export const frag = `
precision mediump float;
#endif

uniform vec3 color;
uniform float inner;
varying float edge;

const vec3 color2 = vec3(0.8);

void main() {
  float v = 1.0 - abs(edge);
  v = smoothstep(0.65, 0.7, v*inner); 
  gl_FragColor = mix(vec4(color, 1.0), vec4(0.0), v);
}
`;

export const newLineTransparentVertex = `
            attribute vec2 aVertexPosition;
            // attribute vec4 aColor;
            // varying vec4 vColor;
            void main() {
                gl_Position = vec4(aVertexPosition, 0.0, 1.0);
                // vColor = aColor;
            }
        `;

// Fragment shader source code
export const newLineTransparentFragment = `
            precision mediump float;
            // varying vec4 vColor;
            
            void main() {
                gl_FragColor = vec4(1.0, 0.5, 0.2, 0.3);
            }
        `;

/* export const newLineTransparentVertexWIDE = `
            attribute vec2 aVertexPosition;
            attribute vec2 aNormal;
            attribute float aMiter;

            // varying vec3 vColor;
            varying vec3 vColor;

            void main() {
                vColor = vec3(aNormal.xy, aMiter); // aNormal;  //vec2(1.0, 0.5);
                gl_Position = vec4(aVertexPosition, 0.0, 1.0);

                // vColor = vec3(aMiter, aMiter, aMiter);
            }
        `;
// Fragment shader source code
export const newLineTransparentFragmentWIDE = `
            precision mediump float;

            varying vec3 vColor;

            void main() {
                gl_FragColor = vec4(vColor.xyz, 1.0);
            }
        `;
*/
export const newLineTransparentVertexWIDE = `
            attribute vec2 aVertexPosition;
            attribute vec2 aTextureCoord;
            
            attribute vec2 aNormal;
            attribute float aMiter;
            attribute vec3 aColor;
            
            
            varying float edge;
            varying vec2 vTextureCoord;
            varying vec3 vColor;
            
            
            void main() {
                float thickness = 0.1;
                vColor = aColor;
                vTextureCoord = aTextureCoord;
                edge = sign(aMiter);
                  vec2 pointPos = aVertexPosition.xy + vec2(aNormal * thickness/2.0 * aMiter);
                  pointPos = (pointPos * 2.0 - 1.0) / 2.0;
                  gl_Position = vec4(pointPos.x, 1.0 - pointPos.y, 0.0, 1.0);
            }
        `;

// Fragment shader source code
export const newLineTransparentFragmentWIDE = `
            precision mediump float;
            
           
           varying float edge;
           varying vec2 vTextureCoord;
            varying vec3 vColor;
           
           uniform sampler2D sTexture;


                void main() {
                vec4 texel = texture2D(sTexture, vTextureCoord);
                const vec3 color2 = vec3(0.8);
                float inner = 0.0;
                  float v = 1.0 - abs(edge);
                  v = smoothstep(0.65, 0.7, v*inner);
                  float aaa = (texel.r + texel.g + texel.b) / 3.0;
                  gl_FragColor = vec4(1.0, 0.0, 1.0, 0.45); // mix(vec4(edge, edge, 0.0, 1.0), vec4(0.0), v);
                  
                  // gl_FragColor = 1.0 - vec4(vColor, 1.0) * (1.0 - texel);
                }
        `;
