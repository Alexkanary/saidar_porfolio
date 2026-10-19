export const fullscreenVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const welcomeBackgroundShader = `
  precision highp float;

  varying vec2 vUv;
  uniform vec3 uBackground;
  uniform vec3 uCenter;
  uniform vec3 uEdge;

  void main() {
    float radial = smoothstep(0.0, 0.95, length((vUv - vec2(0.5, 0.57)) * vec2(1.0, 0.82)));
    vec3 color = mix(uCenter, uBackground, smoothstep(0.08, 0.72, radial));
    color = mix(color, uEdge, smoothstep(0.72, 1.0, radial));
    gl_FragColor = vec4(color, 1.0);
  }
`;

export const fluidSimulationShader = `
  precision highp float;

  varying vec2 vUv;
  uniform sampler2D uPrevious;
  uniform vec2 uLight;
  uniform vec2 uLightVelocity;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uDissipation;
  uniform float uSplatStrength;
  uniform float uTrailRadius;

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
    float fieldX = noise(uv * 3.0 + vec2(0.008, 0.0) + uTime * 0.025)
      - noise(uv * 3.0 - vec2(0.008, 0.0) + uTime * 0.025);
    float fieldY = noise(uv * 3.0 + vec2(0.0, 0.008) + uTime * 0.025)
      - noise(uv * 3.0 - vec2(0.0, 0.008) + uTime * 0.025);
    vec2 curl = normalize(vec2(fieldY, -fieldX) + vec2(0.0001));
    vec2 drift = curl * 0.003 + uLightVelocity * 0.18;
    float trail = texture2D(uPrevious, clamp(uv - drift, 0.002, 0.998)).r
      * uDissipation;

    vec2 delta = (uv - uLight) * uResolution;
    float speed = clamp(length(uLightVelocity) * 18.0, 0.0, 1.0);
    // Larger splats at high speed create the pale flare; slow movement stays tight.
    float radius = uTrailRadius * mix(0.72, 1.8, speed);
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
  uniform vec2 uResolution;
  uniform vec2 uLogoUv;
  uniform vec2 uTextBounds;
  uniform float uLogoRadius;
  uniform float uMaxOutsideLogo;
  uniform float uTime;
  uniform float uFlare;
  uniform float uStaticGlow;
  uniform float uEdgeRaggedness;
  uniform float uMaskSize;
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
    for (int i = 0; i < 4; i++) {
      value += noise(p) * amplitude;
      p *= 2.03;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 warp = (vUv - 0.5) * 0.012;
    float trail = texture2D(uTrail, vUv + warp).r;

    float bloom = 0.0;
    bloom += texture2D(uTrail, vUv + vec2(uTexel.x * 2.0, 0.0)).r;
    bloom += texture2D(uTrail, vUv - vec2(uTexel.x * 2.0, 0.0)).r;
    bloom += texture2D(uTrail, vUv + vec2(0.0, uTexel.y * 2.0)).r;
    bloom += texture2D(uTrail, vUv - vec2(0.0, uTexel.y * 2.0)).r;
    bloom *= 0.25;

    // Frequency is deliberately low so the threshold breaks the glow into soft wisps.
    float organicNoise = fbm(vUv * 3.0 + uTime * 0.05);
    float wisps = smoothstep(0.22, 0.6, trail + organicNoise * uEdgeRaggedness);
    float fill = trail * 0.22;
    vec2 logoDelta = (vUv - uLogoUv) * uResolution;
    float logoDistance = length(logoDelta);
    float logoInfluence = 1.0 - smoothstep(
      uLogoRadius,
      uLogoRadius * uMaskSize,
      logoDistance
    );
    float textBlock = smoothstep(
      uTextBounds.x,
      uTextBounds.x + 0.055,
      vUv.y
    ) * (1.0 - smoothstep(
      uTextBounds.y - 0.055,
      uTextBounds.y,
      vUv.y
    ));
    float staticGlow = exp(
      -dot(logoDelta, logoDelta) / (uLogoRadius * uLogoRadius * 4.0)
    ) * 0.045 * uStaticGlow;
    float flare = uFlare;
    float spatialIntensity = mix(uMaxOutsideLogo, 1.0, logoInfluence);
    spatialIntensity *= mix(1.0, 0.12, textBlock);
    float strength = (wisps * 1.18 + bloom * 0.42 + fill + staticGlow + flare * 0.6)
      * spatialIntensity;
    strength = clamp(strength, 0.0, 1.0);

    vec3 color = mix(uDeepBlue, uBlue, smoothstep(0.12, 0.58, strength));
    color = mix(color, uPaleBlue, smoothstep(0.58, 1.0, strength));

    gl_FragColor = vec4(color * strength * 1.2, strength * 0.82);
  }
`;
