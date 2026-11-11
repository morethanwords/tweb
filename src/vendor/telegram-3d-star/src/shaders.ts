// Telegram for Android's vertex2.glsl and fragment4.glsl. After Telegram's colour the fragment shader adds the shine
// band, a rest highlight and the light theme's turn light, and its front lobe takes exponent 20 instead of 30.

export const VERTEX: string = `uniform mat4 uMVPMatrix;

attribute vec2 a_TexCoordinate;
attribute vec3 a_Normal;
attribute vec3 vPosition;

varying vec3 vNormal;
varying vec2 vUV;
varying vec3 modelViewVertex;
varying float depth;

void main() {
   vUV = a_TexCoordinate;
   vNormal = a_Normal;
   gl_Position = uMVPMatrix * vec4(vPosition, 1.0);
   modelViewVertex = vPosition;
   depth = gl_Position.z;
}`;

export const FRAGMENT: string = `precision highp float;

uniform sampler2D u_Texture;
uniform sampler2D u_NormalMap;
uniform sampler2D u_BackgroundTexture;
uniform float f_xOffset;
uniform float f_alpha;
uniform mat4 world;
uniform float golden;
uniform float white;

varying vec3 vNormal;
varying vec2 vUV;
varying vec3 modelViewVertex;

uniform float spec1;
uniform float spec2;
uniform float u_diffuse;
uniform float normalSpec;
uniform vec3 gradientColor1;
uniform vec3 gradientColor2;
uniform vec3 normalSpecColor;
uniform vec3 specColor;
uniform vec2 resolution;
uniform vec4 gradientPosition;
uniform int modelIndex;

vec4 premium_star() {
    vec3 cameraPosition = vec3(0, 0, 100);
    vec3 vLightPosition2 = vec3(-400,400,400);
    vec3 vLightPosition3 = vec3(0,200,400);
    vec3 vLightPosition4 = vec3(0,0,100);
    vec3 vLightPositionNormal = vec3(100,-200,400);

    vec3 vNormalW = normalize(vec3(world * vec4(vNormal, 0.0)));
    vec3 vTextureNormal = normalize(texture2D(u_NormalMap, (vUV + vec2(-f_xOffset, f_xOffset)) * 2.0).xyz * 2.0 - 1.0);

    vec3 finalNormal = normalize(vNormalW + vTextureNormal);

    vec3 color = texture2D(u_Texture, vUV).xyz;
    vec3 viewDirectionW = normalize(cameraPosition);

    vec3 angleW = normalize(viewDirectionW + vLightPosition2);
    float specComp2 = max(0., dot(vNormalW, angleW));
    specComp2 = pow(specComp2, max(1., 128.)) * spec1;

    angleW = normalize(viewDirectionW + vLightPosition4);
    float specComp3 = max(0., dot(vNormalW, angleW));
    specComp3 = pow(specComp3, max(1., 20.)) * spec2;

    float diffuse = max(dot(vNormalW, viewDirectionW), (1.0 - u_diffuse));

    float mixValue = distance(vUV,vec2(1,0));
    vec4 gradientColorFinal = vec4(mix(gradientColor1, gradientColor2, mixValue), 1.0);

    angleW = normalize(viewDirectionW + vLightPositionNormal);
    float normalSpecComp = max(0., dot(finalNormal, angleW));
    normalSpecComp = pow(normalSpecComp, max(1., 128.)) * normalSpec;

    angleW = normalize(viewDirectionW + vLightPosition2);
    float normalSpecComp2 = max(0., dot(finalNormal, angleW));
    normalSpecComp2 = pow(normalSpecComp2, max(1., 128.)) * normalSpec;

    vec4 normalSpecFinal = vec4(normalSpecColor, 0.0) * (normalSpecComp + normalSpecComp2);
    vec4 specFinal = vec4(color, 0.0) * (specComp2 + specComp3);

    vec4 fragColor = gradientColorFinal + specFinal + normalSpecFinal;
    vec4 backgroundColor = texture2D(u_BackgroundTexture, vec2(gradientPosition.x + (gl_FragCoord.x / resolution.x) * gradientPosition.y, gradientPosition.z + (1.0 - (gl_FragCoord.y / resolution.y)) * gradientPosition.w));
    return mix(backgroundColor, fragColor, diffuse) * f_alpha;
}

vec4 golden_star() {

    vec3 pos = modelViewVertex / 100.0 + .5;
    float specTexture = texture2D(u_Texture, vUV).y * clamp(vNormal.z, 0.0, 1.0);

    float gradientMix = distance(pos.xy, vec2(1, 1));
    gradientMix -= .05 * specTexture;
    gradientMix = clamp(gradientMix, 0.0, 1.0);
    vec4 color = vec4(mix(gradientColor1, gradientColor2, gradientMix), 1.0);

    vec3 norm = normalize(vec3(world * vec4(vNormal, 0.0)));

    vec3 flecksNormal = normalize(1.0 - texture2D(u_NormalMap, (vUV + .7 * vec2(-f_xOffset, f_xOffset)) * 2.0).xyz);
    float flecks = clamp(flecksNormal.x, 0.0, 1.0);

    vec3 lightPos = vec3(-3., -3., 20.);
    vec3 lightDir = normalize(lightPos - pos);
    float diffuse = max(dot(norm, lightDir), 0.0);

    float spec = 0.0;

    lightPos = vec3(-1., .7, .2);
    spec += specTexture * clamp(2.0 * pow(max(dot(normalize(vec3(0.0) - pos), reflect(-normalize(lightPos - pos), norm)), 0.0), 2.0), 0.0, 1.0) / 6.0;
    lightPos = vec3(8., .7, .5);
    spec += specTexture * clamp(2.0 * pow(max(dot(normalize(vec3(0.0) - pos), reflect(-normalize(lightPos - pos), norm)), 0.0), 2.0), 0.0, 1.0) / 6.0;

    float notSpecTexture = mix(1.0, 0.3, specTexture);
    lightPos = vec3(-3., -3., .5);
    spec += clamp(2.0 * pow(max(dot(normalize(vec3(0.0) - pos), reflect(-normalize(lightPos - pos), norm)), 0.0), 2.0), 0.0, 1.0) / 4.0;

    lightPos = vec3(4., 3., 2.5);
    spec += clamp(1.5 * pow(max(dot(normalize(vec3(0.0) - pos), reflect(-normalize(lightPos - pos), norm)), 0.0), 2.0), 0.0, 1.0) / 6.0;

    lightPos = vec3(-33., .5, 30.);
    spec += clamp(2.0 * pow(max(dot(normalize(vec3(0.0) - pos), reflect(-normalize(lightPos - pos), norm)), 0.0), 2.0), 0.0, 1.0) / 12.0;

    spec = clamp(spec, 0.0, 0.7);

    lightPos = vec3(10., .5, 3.3);
    spec += mix(0.8, 1.0, specTexture) * clamp(2.0 * pow(max(dot(normalize(vec3(0.0) - pos), reflect(-normalize(lightPos - pos), norm)), 0.0), 2.0), 0.0, 1.0) / 8.0;

    lightPos = vec3(-10., .5, 3.7);
    spec += mix(0.8, 1.0, specTexture) * clamp(2.0 * pow(max(dot(normalize(vec3(0.0) - pos), reflect(-normalize(lightPos - pos), norm)), 0.0), 2.0), 0.0, 1.0) / 8.0;

    lightPos = vec3(.5, 12., 1.5);
    spec += mix(0.8, 1.0, specTexture) * clamp(2.0 * pow(max(dot(normalize(vec3(0.0) - pos), reflect(-normalize(lightPos - pos), norm)), 0.0), 2.0), 0.0, 1.0) / 8.0;

    spec = clamp(spec, 0.0, 0.9);

    color = mix(vec4(vec3(0.0), 1.0), color, .8 + .3 * diffuse);
    vec4 specColor = vec4(mix(1.8, 2.0, specTexture) * gradientColor1, 1.0);
    color = mix(color, specColor, spec);

    float flecksSpec = 0.0;
    lightPos = vec3(1.2, -.2, .5);
    flecksSpec += clamp(2.0 * pow(max(dot(normalize(vec3(0.0) - pos), reflect(-normalize(lightPos - pos), norm)), 0.0), 2.0), 0.0, 1.0);

    color = mix(color, specColor,
        clamp(flecksSpec * abs(vNormal.z) * (flecksNormal.z), 0.2, 0.3) - .2
    );

    return mix(color * f_alpha, vec4(1.0), white);
}

uniform float u_shine;
uniform float u_rest;
uniform float u_turn;
uniform float u_move;
uniform vec3 u_glint;

void main() {
    gl_FragColor = mix(premium_star(), golden_star(), golden);
    float shine = (vUV.x + vUV.y - u_shine) / 0.144;
    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(gl_FragColor.a), 0.5 * exp(-shine * shine));
    vec3 worldNormal = normalize(vec3(world * vec4(vNormal, 0.0)));
    float rest = pow(max(dot(worldNormal, normalize(vec3(-0.265, 0.265, 0.927))), 0.0), 16.0);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(gl_FragColor.a), u_rest * rest * (1.0 - golden));
    float side = pow(max(dot(worldNormal, normalize(vec3(-0.77, 0.17, 0.62))), 0.0), 14.0) + pow(max(dot(worldNormal, normalize(vec3(0.77, 0.17, 0.62))), 0.0), 14.0);
    float turn = u_turn * (1.0 - smoothstep(0.94, 0.985, abs(world[2].z))) * side;
    gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(u_glint, vec3(1.0), 0.7 * clamp(turn - 1.0, 0.0, 1.0)) * gl_FragColor.a, clamp(turn + 0.5 * u_turn * u_move * rest, 0.0, 1.0) * (1.0 - golden));
}`;

/** The path of start_texture.svg: a white shape on 1024 x 1024 that masks the star's speculars. */
export const STAR_TEXTURE_PATH: string = 'M242.441216,1023.96673 C484.760949,868.195472 619.565351,780.153383 646.854423,759.840461 C738.267847,691.795866 863.983039,585.091695 1024,439.727947 L1024,363.976818 C810.351061,332.876819 639.684394,317.32682 512,317.32682 C384.315606,317.32682 213.648939,332.876819 0,363.976818 L0,1023.96673 L242.441216,1023.96673 Z';
