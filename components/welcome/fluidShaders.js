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
  uniform vec2 uResolution;
  uniform vec2 uLogoUv;
  uniform float uLogoRadius;
  uniform float uOpacity;
  uniform float uFlare;
  uniform float uStaticGlow;
  uniform float uTime;
  uniform float uEdgeRaggedness;
  uniform float uMaskSize;
  uniform vec3 uSilver;
  uniform vec3 uDeepBlue;
  uniform vec3 uBlue;
  uniform vec3 uPaleBlue;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    vec2 uv = clamp(vScreenUv, 0.0, 1.0);
    float trail = texture2D(uTrail, uv).r;
    float edgeNoise = hash(floor(uv * 92.0 + uTime * 0.1)) * uEdgeRaggedness;
    float lit = smoothstep(0.12, 0.48, trail + edgeNoise);
    float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.0);
    vec2 logoDelta = (uv - uLogoUv) * uResolution;
    float staticLight = exp(
      -dot(logoDelta, logoDelta) / (uLogoRadius * uLogoRadius * 4.0)
    ) * uStaticGlow;
    float glow = clamp(lit + staticLight * 0.18 + uFlare, 0.0, 1.0);

    vec3 color = mix(uSilver, uDeepBlue, smoothstep(0.03, 0.18, glow));
    color = mix(color, uBlue, smoothstep(0.2, 0.62, glow));
    color = mix(color, uPaleBlue, smoothstep(0.62, 0.96, glow));
    float opacity = min(uOpacity * (1.0 - lit * 0.35) + fresnel * 0.06 + glow * 1.05, 1.0);

    gl_FragColor = vec4(color * (0.72 + glow * 2.0), opacity);
  }
`;
