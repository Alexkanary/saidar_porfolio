export const fullscreenVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const fluidSimulationShader = `
  precision highp float;

  varying vec2 vUv;
  uniform sampler2D uPrevious;
  uniform vec2 uMouse;
  uniform vec2 uVelocity;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uDissipation;
  uniform float uSplatStrength;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  void main() {
    vec2 uv = vUv;
    float field = noise(uv * 4.0 + uTime * 0.025);
    float fieldX = noise(uv * 4.0 + vec2(0.008, 0.0) + uTime * 0.025)
      - noise(uv * 4.0 - vec2(0.008, 0.0) + uTime * 0.025);
    float fieldY = noise(uv * 4.0 + vec2(0.0, 0.008) + uTime * 0.025)
      - noise(uv * 4.0 - vec2(0.0, 0.008) + uTime * 0.025);
    vec2 curl = normalize(vec2(fieldY, -fieldX) + vec2(0.0001));
    vec2 drift = curl * 0.0035 + uVelocity * 0.22;
    float trail = texture2D(uPrevious, clamp(uv - drift, 0.002, 0.998)).r
      * uDissipation;

    vec2 delta = (uv - uMouse) * vec2(uResolution.x / uResolution.y, 1.0);
    float speed = clamp(length(uVelocity) * 18.0, 0.0, 1.0);
    float radius = mix(0.07, 0.14, speed);
    float splat = exp(-dot(delta, delta) / (radius * radius));
    trail = max(trail, splat * uSplatStrength);

    gl_FragColor = vec4(trail, trail, trail, 1.0);
  }
`;

export const fluidDisplayShader = `
  precision highp float;

  varying vec2 vUv;
  uniform sampler2D uTrail;
  uniform vec2 uTexel;
  uniform float uTime;
  uniform float uFlare;
  uniform float uStaticGlow;
  uniform vec3 uDeepBlue;
  uniform vec3 uBlue;
  uniform vec3 uPaleBlue;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 3; i++) {
      value += noise(p) * amplitude;
      p *= 2.03;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 centered = (vUv - 0.5) * 2.0;
    float falloff = 1.0 - smoothstep(0.28, 1.0, length(centered));
    vec2 warp = (vUv - 0.5) * 0.012;
    float trail = texture2D(uTrail, vUv + warp).r;
    float bloom = 0.0;
    bloom += texture2D(uTrail, vUv + vec2(uTexel.x * 2.0, 0.0)).r;
    bloom += texture2D(uTrail, vUv - vec2(uTexel.x * 2.0, 0.0)).r;
    bloom += texture2D(uTrail, vUv + vec2(0.0, uTexel.y * 2.0)).r;
    bloom += texture2D(uTrail, vUv - vec2(0.0, uTexel.y * 2.0)).r;
    bloom *= 0.25;

    float organicNoise = fbm(vUv * 18.0 + uTime * 0.018);
    float wisps = smoothstep(0.25, 0.6, trail + organicNoise * 0.15);
    float fluidGlow = (wisps + bloom * 0.24) * falloff;
    float staticGlow = exp(-dot(centered, centered) * 5.0) * 0.09 * uStaticGlow;
    float flare = uFlare * falloff;
    float strength = clamp(fluidGlow + staticGlow + flare * 0.4, 0.0, 1.0);

    vec3 color = mix(uDeepBlue, uBlue, smoothstep(0.15, 0.6, strength));
    color = mix(color, uPaleBlue, smoothstep(0.62, 1.0, strength + flare * 0.35));

    gl_FragColor = vec4(color * strength * 0.8, strength * 0.48);
  }
`;

export const emblemVertexShader = `
  varying vec2 vScreenUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vec4 projectedPosition = projectionMatrix * viewPosition;
    vScreenUv = projectedPosition.xy / projectedPosition.w * 0.5 + 0.5;
    vNormal = normalize(normalMatrix * normal);
    vViewPosition = -viewPosition.xyz;
    gl_Position = projectedPosition;
  }
`;

export const emblemFragmentShader = `
  precision highp float;

  varying vec2 vScreenUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  uniform sampler2D uTrail;
  uniform float uOpacity;
  uniform float uFlare;
  uniform float uStaticGlow;
  uniform float uTime;
  uniform vec3 uSilver;
  uniform vec3 uBlue;
  uniform vec3 uPaleBlue;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    vec2 uv = clamp(vScreenUv, 0.0, 1.0);
    float trail = texture2D(uTrail, uv).r;
    float edgeNoise = hash(floor(uv * 92.0 + uTime * 0.1));
    float lit = smoothstep(0.12, 0.48, trail + edgeNoise * 0.12);
    float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.0);
    float staticLight = exp(-dot((uv - 0.5) * 2.0, (uv - 0.5) * 2.0) * 7.0)
      * uStaticGlow;
    float glow = clamp(lit + uFlare * 0.9 + staticLight * 0.24, 0.0, 1.0);

    vec3 color = mix(uSilver, uBlue, smoothstep(0.06, 0.5, glow));
    color = mix(color, uPaleBlue, smoothstep(0.7, 1.0, glow));
    float opacity = uOpacity + fresnel * 0.12 + glow * 0.78;

    gl_FragColor = vec4(color * (0.82 + glow * 1.2), opacity);
  }
`;
