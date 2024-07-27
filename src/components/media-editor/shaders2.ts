
export const sharpeningVertexShader = `
        attribute vec4 aVertexPosition; // input pos
        attribute vec2 aTextureCoord; // texture input uv
        varying vec2 vTextureCoord;
        
        uniform highp float inputWidth;
        uniform highp float inputHeight;
        varying vec2 leftTexCoord;
        varying vec2 rightTexCoord;
        varying vec2 topTexCoord;
        varying vec2 bottomTexCoord;
        
        // add other stuff
        void main(void) {
            gl_Position = aVertexPosition;
            vTextureCoord = aTextureCoord;
            vec2 widthStep = vec2(1.0 / inputWidth, 0.0);
            vec2 heightStep = vec2(0.0, 1.0 / inputHeight);
            
            leftTexCoord = aTextureCoord - widthStep;
            rightTexCoord = aTextureCoord + widthStep;
            topTexCoord = aTextureCoord + heightStep;
            bottomTexCoord = aTextureCoord - heightStep;
        }
`;

export const sharpeningFragmentShader = `
        precision highp float;
        varying vec2 vTextureCoord;
        varying vec2 leftTexCoord;
        varying vec2 rightTexCoord;
        varying vec2 topTexCoord;
        varying vec2 bottomTexCoord;
        
        uniform sampler2D sTexture;
        uniform float sharpen;
        
        void main(void) {
            vec4 result = texture2D(sTexture, vTextureCoord);
            vec3 leftTextureColor = texture2D(sTexture, leftTexCoord).rgb;
            vec3 rightTextureColor = texture2D(sTexture, rightTexCoord).rgb;
            vec3 topTextureColor = texture2D(sTexture, topTexCoord).rgb;
            vec3 bottomTextureColor = texture2D(sTexture, bottomTexCoord).rgb;
            
            result.rgb = result.rgb * (1.0 + 4.0 * sharpen) - (leftTextureColor + rightTextureColor + topTextureColor + bottomTextureColor) * sharpen;
            gl_FragColor = result;
        }
`;

