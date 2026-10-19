"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import styles from "./welcome.module.scss";
import {
  fluidDisplayShader,
  fluidSimulationShader,
  fullscreenVertexShader,
  welcomeBackgroundShader,
} from "./fluidShaders";
import { welcomeConfig } from "./welcomeConfig";

const { effect, colors, emblem } = welcomeConfig;
const BUFFER_SIZE = effect.bufferSize;
const WORLD_SIZE = 4.4;
const CURSOR_TILT_LIMIT = Math.PI / 30;
const RING_SWING_LIMIT = Math.PI / 15;
const RING_Y_SWING_LIMIT = Math.PI * 35 / 180;
const RINGS = [
  { radius: 1, depth: -0.09, opacity: 0.82, parallax: 0.7, period: effect.ringRotationPeriods[0], gap: 0 },
  { radius: 0.8, depth: 0, opacity: 0.9, parallax: 1, period: effect.ringRotationPeriods[1], gap: Math.PI * 0.68 },
  { radius: 0.58, depth: 0.09, opacity: 1, parallax: 1.3, period: effect.ringRotationPeriods[2], gap: Math.PI * 1.35 },
];

const filmGrainShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrainAmount: { value: emblem.grainAmount },
    uVignetteStrength: { value: 0.28 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uGrainAmount;
    uniform float uVignetteStrength;
    varying vec2 vUv;

    float hash(vec2 pixel) {
      vec3 p3 = fract(vec3(pixel.xyx) * 0.1031);
      p3 += dot(p3, p3.yxz + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec4 source = texture2D(tDiffuse, vUv);
      vec2 grainFrame = floor(uTime * 24.0) * vec2(17.0, 29.0);
      float grain = (hash(floor(gl_FragCoord.xy) + grainFrame) - 0.5) * uGrainAmount;
      float vignette = smoothstep(0.28, 0.82, distance(vUv, vec2(0.5)));
      vec3 color = source.rgb + grain - vignette * uVignetteStrength * 0.18;
      gl_FragColor = vec4(max(color, vec3(0.0)), source.a);
    }
  `,
};

const EmblemFallback = ({ style }) => (
  <svg
    className={styles.fallbackEmblem}
    style={style}
    viewBox="-2.2 -2.2 4.4 4.4"
    aria-hidden="true"
  >
    <circle cx="0" cy="0" r="1" />
    <circle cx="0" cy="0" r="0.8" />
    <circle cx="0" cy="0" r="0.58" />
    <path d="M 0,-0.15 L 0.15,0 L 0,0.15 L -0.15,0 Z M -0.1,0 L 0.1,0 M 0,-0.1 L 0,0.1" />
  </svg>
);

const createBumpTexture = () => {
  const size = 128;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const broad = Math.sin((u * 5 + v * 2) * Math.PI * 2)
        * Math.cos((v * 4 - u * 2) * Math.PI * 2);
      const medium = Math.sin((u * 17 + v * 11) * Math.PI * 2)
        * Math.cos((v * 13 - u * 9) * Math.PI * 2);
      const fine = Math.sin((u * 43 + v * 31) * Math.PI * 2)
        * Math.cos((v * 37 - u * 29) * Math.PI * 2);
      const value = Math.round(128 + broad * 24 + medium * 19 + fine * 13);
      const index = (y * size + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
};

const createExtrudedGeometry = (shape, depth) => new THREE.ExtrudeGeometry(shape, {
  depth,
  bevelEnabled: true,
  bevelSegments: emblem.bevelSegments,
  steps: 1,
  bevelSize: emblem.bevelSize,
  bevelThickness: emblem.bevelThickness,
  curveSegments: 96,
});

const createAnnularArc = (radius, width, start, end) => {
  const shape = new THREE.Shape();
  const innerRadius = radius - width;
  const steps = Math.max(24, Math.ceil((end - start) / (Math.PI * 2) * 96));

  for (let i = 0; i <= steps; i += 1) {
    const angle = start + (end - start) * i / steps;
    const point = new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius);
    if (i === 0) shape.moveTo(point.x, point.y);
    else shape.lineTo(point.x, point.y);
  }

  for (let i = steps; i >= 0; i -= 1) {
    const angle = start + (end - start) * i / steps;
    shape.lineTo(Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius);
  }
  shape.closePath();
  return shape;
};

const createDiamondBand = (outerRadius, width) => {
  const corners = (radius) => [
    new THREE.Vector2(0, radius),
    new THREE.Vector2(radius, 0),
    new THREE.Vector2(0, -radius),
    new THREE.Vector2(-radius, 0),
  ];
  const shape = new THREE.Shape();
  corners(outerRadius).forEach((point, index) => {
    if (index === 0) shape.moveTo(point.x, point.y);
    else shape.lineTo(point.x, point.y);
  });
  shape.closePath();

  const hole = new THREE.Path();
  corners(outerRadius - width).reverse().forEach((point, index) => {
    if (index === 0) hole.moveTo(point.x, point.y);
    else hole.lineTo(point.x, point.y);
  });
  hole.closePath();
  shape.holes.push(hole);
  return shape;
};

const createRectShape = (width, height) => {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -height / 2);
  shape.lineTo(width / 2, -height / 2);
  shape.lineTo(width / 2, height / 2);
  shape.lineTo(-width / 2, height / 2);
  shape.closePath();
  return shape;
};

const createStoneMaterial = (texture, trailTexture) => {
  const material = new THREE.MeshStandardMaterial({
    color: emblem.bodyColor,
    roughness: emblem.roughness,
    metalness: emblem.metalness,
    bumpMap: texture,
    bumpScale: emblem.bumpScale,
    emissive: colors.blue,
    emissiveIntensity: 0.08,
  });
  const trailUniforms = {
    uTrailTexture: { value: trailTexture },
    uTrailEmissive: { value: 1.8 },
  };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTrailTexture = trailUniforms.uTrailTexture;
    shader.uniforms.uTrailEmissive = trailUniforms.uTrailEmissive;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vEmblemScreenUv;")
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvEmblemScreenUv = gl_Position.xy / gl_Position.w * 0.5 + 0.5;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec2 vEmblemScreenUv;
        uniform sampler2D uTrailTexture;
        uniform float uTrailEmissive;`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        float trailLight = texture2D(uTrailTexture, clamp(vEmblemScreenUv, 0.0, 1.0)).r;
        totalEmissiveRadiance += mix(vec3(0.08, 0.22, 0.48), vec3(0.45, 0.78, 1.0), smoothstep(0.2, 0.9, trailLight))
          * trailLight * uTrailEmissive;`,
      );
  };
  material.customProgramCacheKey = () => "carved-emblem-trail-emissive-v1";
  material.userData.trailUniforms = trailUniforms;
  return material;
};

const addDashedPath = (parent, points, material, z) => {
  const geometry = new THREE.BufferGeometry().setFromPoints(
    points.map((point) => new THREE.Vector3(point.x, point.y, z)),
  );
  const line = new THREE.Line(geometry, material);
  line.computeLineDistances();
  parent.add(line);
  return geometry;
};

const EmblemScene = ({ flaring, anchorRef, textBlockRef }) => {
  const hostRef = useRef(null);
  const flareHandlerRef = useRef(null);
  const [webglFailed, setWebglFailed] = useState(false);
  const [fallbackBounds, setFallbackBounds] = useState(null);

  useEffect(() => {
    const host = hostRef.current;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let renderer;
    let composer;
    let bloomPass;
    let outputPass;
    let grainPass;
    let simulationTargetA;
    let simulationTargetB;
    let simulationMaterial;
    let displayMaterial;
    let bumpTexture;
    let resizeObserver;
    let animationFrame = 0;
    let disposed = false;
    const geometries = new Set();
    const materials = new Set();

    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.setAttribute("aria-hidden", "true");
      renderer.domElement.className = styles.emblemCanvas;
      host.appendChild(renderer.domElement);
      renderer.setSize(window.innerWidth, window.innerHeight, false);

      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(
        -WORLD_SIZE / 2,
        WORLD_SIZE / 2,
        WORLD_SIZE / 2,
        -WORLD_SIZE / 2,
        0.1,
        20,
      );
      camera.position.z = 5;

      const fluidScene = new THREE.Scene();
      const fluidCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2);
      fluidCamera.position.z = 1;
      const targetOptions = {
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
        stencilBuffer: false,
        generateMipmaps: false,
      };
      simulationTargetA = new THREE.WebGLRenderTarget(BUFFER_SIZE, BUFFER_SIZE, targetOptions);
      simulationTargetB = new THREE.WebGLRenderTarget(BUFFER_SIZE, BUFFER_SIZE, targetOptions);

      const fullscreenGeometry = new THREE.PlaneGeometry(2, 2);
      geometries.add(fullscreenGeometry);
      const backgroundMaterial = new THREE.ShaderMaterial({
        vertexShader: fullscreenVertexShader,
        fragmentShader: welcomeBackgroundShader,
        uniforms: {
          uBackground: { value: new THREE.Color(colors.background) },
          uCenter: { value: new THREE.Color(colors.center) },
          uEdge: { value: new THREE.Color(colors.edge) },
        },
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      materials.add(backgroundMaterial);
      const backgroundPlane = new THREE.Mesh(fullscreenGeometry, backgroundMaterial);
      backgroundPlane.renderOrder = 0;
      backgroundPlane.frustumCulled = false;
      scene.add(backgroundPlane);

      simulationMaterial = new THREE.ShaderMaterial({
        vertexShader: fullscreenVertexShader,
        fragmentShader: fluidSimulationShader,
        uniforms: {
          uPrevious: { value: simulationTargetA.texture },
          uLight: { value: new THREE.Vector2(0.5, 0.5) },
          uLightVelocity: { value: new THREE.Vector2() },
          uResolution: { value: new THREE.Vector2(BUFFER_SIZE, BUFFER_SIZE) },
          uTime: { value: 0 },
          uDissipation: { value: effect.trailDissipation },
          uSplatStrength: { value: 0 },
          uTrailRadius: { value: effect.trailRadius },
        },
        depthTest: false,
        depthWrite: false,
      });
      materials.add(simulationMaterial);
      fluidScene.add(new THREE.Mesh(fullscreenGeometry, simulationMaterial));

      displayMaterial = new THREE.ShaderMaterial({
        vertexShader: fullscreenVertexShader,
        fragmentShader: fluidDisplayShader,
        uniforms: {
          uTrail: { value: simulationTargetA.texture },
          uTexel: { value: new THREE.Vector2(1 / BUFFER_SIZE, 1 / BUFFER_SIZE) },
          uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
          uLogoUv: { value: new THREE.Vector2(0.5, 0.66) },
          uTextBounds: { value: new THREE.Vector2(0.1, 0.5) },
          uLogoRadius: { value: 90 },
          uMaxOutsideLogo: { value: effect.maxGlowOutsideLogo },
          uTime: { value: 0 },
          uFlare: { value: 0 },
          uStaticGlow: { value: reducedMotion.matches ? 1 : 0 },
          uEdgeRaggedness: { value: effect.edgeRaggedness },
          uMaskSize: { value: effect.maskSize },
          uDeepBlue: { value: new THREE.Color(colors.deepBlue) },
          uBlue: { value: new THREE.Color(colors.blue) },
          uPaleBlue: { value: new THREE.Color(colors.paleBlue) },
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      materials.add(displayMaterial);
      const glowPlane = new THREE.Mesh(fullscreenGeometry, displayMaterial);
      glowPlane.renderOrder = 1;
      glowPlane.frustumCulled = false;
      scene.add(glowPlane);

      const ambientLight = new THREE.AmbientLight(0x0d111c, 1.4);
      scene.add(ambientLight);
      const keyLight = new THREE.PointLight(emblem.keyLightColor, 0, 6, 2);
      keyLight.position.set(0, 0.8, 1.1);
      scene.add(keyLight);
      const rimLight = new THREE.PointLight(colors.blue, 1.35, 5, 2);
      rimLight.position.set(0, -0.4, -0.75);
      scene.add(rimLight);

      bumpTexture = createBumpTexture();
      const stoneMaterial = createStoneMaterial(bumpTexture, simulationTargetA.texture);
      materials.add(stoneMaterial);
      const dashedMaterial = new THREE.LineDashedMaterial({
        color: emblem.dashedLineColor,
        transparent: true,
        opacity: emblem.dashedLineOpacity,
        dashSize: 0.06,
        gapSize: 0.04,
        depthWrite: false,
        toneMapped: false,
      });
      materials.add(dashedMaterial);

      const root = new THREE.Group();
      root.renderOrder = 2;
      scene.add(root);
      const ringGroups = RINGS.map(({ radius, depth, parallax, period, gap }) => {
        const group = new THREE.Group();
        group.position.z = depth;
        const bandWidth = radius * emblem.bandWidth;
        const extrusionDepth = bandWidth * emblem.extrudeDepth;
        const gapHalf = 0.055;
        const start = gap + gapHalf;
        const end = gap + Math.PI * 2 - gapHalf;
        const shape = createAnnularArc(radius, bandWidth, start, end);
        const geometry = createExtrudedGeometry(shape, extrusionDepth);
        geometries.add(geometry);
        group.add(new THREE.Mesh(geometry, stoneMaterial));

        const points = [];
        const lineSteps = 360;
        for (let i = 0; i <= lineSteps; i += 1) {
          const angle = start + (end - start) * i / lineSteps;
          points.push(new THREE.Vector2(
            Math.cos(angle) * (radius - bandWidth / 2),
            Math.sin(angle) * (radius - bandWidth / 2),
          ));
        }
        geometries.add(addDashedPath(
          group,
          points,
          dashedMaterial,
          extrusionDepth + emblem.bevelThickness + 0.004,
        ));
        root.add(group);
        return { group, parallax, period };
      });

      const diamondSize = 0.19;
      const diamondDepth = emblem.bandWidth * emblem.extrudeDepth;
      const diamondGeometry = createExtrudedGeometry(
        createDiamondBand(diamondSize, 0.035),
        diamondDepth,
      );
      geometries.add(diamondGeometry);
      const diamondGroup = new THREE.Group();
      diamondGroup.position.z = 0.18;
      diamondGroup.add(new THREE.Mesh(diamondGeometry, stoneMaterial));
      const crossWidth = 0.022;
      const crossLength = diamondSize * 1.12;
      const crossGeometryH = createExtrudedGeometry(
        createRectShape(crossLength, crossWidth),
        diamondDepth,
      );
      const crossGeometryV = createExtrudedGeometry(
        createRectShape(crossWidth, crossLength),
        diamondDepth,
      );
      geometries.add(crossGeometryH);
      geometries.add(crossGeometryV);
      const crossHorizontal = new THREE.Mesh(crossGeometryH, stoneMaterial);
      const crossVertical = new THREE.Mesh(crossGeometryV, stoneMaterial);
      crossHorizontal.position.z = diamondDepth + 0.045;
      crossVertical.position.z = diamondDepth + 0.045;
      diamondGroup.add(crossHorizontal, crossVertical);
      const crossLinePoints = [
        [new THREE.Vector2(-crossLength / 2, 0), new THREE.Vector2(crossLength / 2, 0)],
        [new THREE.Vector2(0, -crossLength / 2), new THREE.Vector2(0, crossLength / 2)],
      ];
      crossLinePoints.forEach((points) => {
        geometries.add(addDashedPath(
          diamondGroup,
          points,
          dashedMaterial,
          diamondDepth * 2 + 0.055,
        ));
      });
      root.add(diamondGroup);

      const emblemMeshes = [];
      root.traverse((child) => {
        if (child.isMesh) emblemMeshes.push(child);
      });

      const pointer = new THREE.Vector2(0.5, 0.5);
      const previousPointer = new THREE.Vector2(0.5, 0.5);
      const cursorVelocity = new THREE.Vector2();
      const lightPoint = new THREE.Vector2(0.5, 0.5);
      const previousLightPoint = new THREE.Vector2(0.5, 0.5);
      const lightVelocity = new THREE.Vector2();
      const lightDelta = new THREE.Vector2();
      const cursorTilt = new THREE.Vector2();
      const targetTilt = new THREE.Vector2();
      const logoPosition = new THREE.Vector2();
      const logoUv = new THREE.Vector2(0.5, 0.66);
      const canHover = window.matchMedia("(pointer: fine)").matches;
      const sceneStartedAt = performance.now();
      let anchorBounds;
      let lastInputTime = -Infinity;
      let hasPointerInput = false;
      let flareStartedAt = flaring ? performance.now() : 0;
      let readTarget = simulationTargetA;
      let writeTarget = simulationTargetB;
      let lastFrameTime = sceneStartedAt;

      const renderPass = new RenderPass(scene, camera);
      bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        emblem.bloomStrength,
        emblem.bloomRadius,
        emblem.bloomThreshold,
      );
      grainPass = new ShaderPass(filmGrainShader);
      composer = new EffectComposer(renderer);
      composer.addPass(renderPass);
      composer.addPass(bloomPass);
      outputPass = new OutputPass();
      composer.addPass(outputPass);
      composer.addPass(grainPass);

      const updateLayout = () => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        anchorBounds = anchorRef.current?.getBoundingClientRect();
        const anchorWidth = anchorRef.current?.offsetWidth;
        const anchorHeight = anchorRef.current?.offsetHeight;
        if (!anchorBounds?.width || !anchorBounds.height || !anchorWidth || !anchorHeight) return;

        const unitsPerPixel = WORLD_SIZE / anchorWidth;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        renderer.setPixelRatio(pixelRatio);
        renderer.setSize(width, height, false);
        composer.setPixelRatio(pixelRatio);
        composer.setSize(width, height);
        camera.left = -width * unitsPerPixel / 2;
        camera.right = width * unitsPerPixel / 2;
        camera.top = height * unitsPerPixel / 2;
        camera.bottom = -height * unitsPerPixel / 2;
        camera.updateProjectionMatrix();
        const centerX = anchorBounds.left + anchorBounds.width / 2;
        const centerY = anchorBounds.top + anchorBounds.height / 2;
        root.position.set(
          (centerX - width / 2) * unitsPerPixel,
          (height / 2 - centerY) * unitsPerPixel,
          0,
        );
        logoPosition.set(root.position.x, root.position.y);
        logoUv.set(centerX / width, 1 - centerY / height);

        const logoRadius = RINGS[0].radius / WORLD_SIZE * anchorWidth;
        const textBounds = textBlockRef.current?.getBoundingClientRect();
        const textBottom = textBounds ? 1 - textBounds.bottom / height : 0.1;
        const textTop = textBounds ? 1 - textBounds.top / height : 0.5;
        simulationMaterial.uniforms.uResolution.value.set(width, height);
        simulationMaterial.uniforms.uTrailRadius.value = effect.trailRadius * anchorWidth;
        displayMaterial.uniforms.uResolution.value.set(width, height);
        displayMaterial.uniforms.uLogoUv.value.copy(logoUv);
        displayMaterial.uniforms.uLogoRadius.value = logoRadius;
        displayMaterial.uniforms.uTextBounds.value.set(textBottom, textTop);
        grainPass.uniforms.uTime.value = performance.now() * 0.001;
        if (reducedMotion.matches) renderStatic();
      };

      const handlePointerMove = (event) => {
        if (!canHover || event.pointerType === "touch") return;
        const x = event.clientX / window.innerWidth;
        const y = 1 - event.clientY / window.innerHeight;
        pointer.set(x, y);
        lastInputTime = performance.now();
        hasPointerInput = true;

        const anchor = anchorRef.current;
        if (anchor && anchorBounds?.width && anchorBounds.height) {
          const centerX = anchorBounds.left + anchorBounds.width / 2;
          const centerY = anchorBounds.top + anchorBounds.height / 2;
          const anchorWidth = anchor.offsetWidth;
          const anchorHeight = anchor.offsetHeight;
          targetTilt.set(
            THREE.MathUtils.clamp((centerY - event.clientY) / (anchorHeight / 2), -1, 1) * CURSOR_TILT_LIMIT,
            THREE.MathUtils.clamp((event.clientX - centerX) / (anchorWidth / 2), -1, 1) * CURSOR_TILT_LIMIT,
          );
        }
      };

      const renderStatic = () => {
        renderer.setRenderTarget(null);
        composer.render();
      };

      const renderFrame = (now) => {
        animationFrame = 0;
        if (disposed || document.hidden || reducedMotion.matches) return;
        const anchor = anchorRef.current;
        if (!anchor || !anchorBounds?.width) {
          animationFrame = window.requestAnimationFrame(renderFrame);
          return;
        }

        const elapsed = Math.min((now - lastFrameTime) / 1000, 0.05);
        lastFrameTime = now;
        const time = now * 0.001;
        const idle = !canHover || (
          hasPointerInput
            ? now - lastInputTime > 2500
            : now - sceneStartedAt > 2500
        );
        if (idle) {
          const autonomousTime = time * 0.34;
          const idleRangeX = anchor.offsetWidth / window.innerWidth * 0.2;
          const idleRangeY = anchor.offsetHeight / window.innerHeight * 0.18;
          pointer.set(
            logoUv.x + Math.sin(autonomousTime) * idleRangeX,
            logoUv.y + Math.sin(autonomousTime * 1.37 + 0.7) * idleRangeY,
          );
          targetTilt.set(
            Math.sin(autonomousTime * 0.7) * 0.06,
            Math.cos(autonomousTime * 0.65) * 0.06,
          );
        }

        const frameScale = Math.min(elapsed * 60, 2);
        cursorVelocity.copy(pointer).sub(previousPointer).divideScalar(frameScale);
        previousPointer.copy(pointer);
        previousLightPoint.copy(lightPoint);
        lightDelta.subVectors(pointer, lightPoint);
        lightVelocity.addScaledVector(lightDelta, effect.cursorLag * frameScale);
        lightVelocity.multiplyScalar(Math.pow(0.84, frameScale));
        lightPoint.addScaledVector(lightVelocity, frameScale);
        lightPoint.clamp(new THREE.Vector2(0.005, 0.005), new THREE.Vector2(0.995, 0.995));
        lightVelocity.copy(lightPoint).sub(previousLightPoint).divideScalar(frameScale);
        cursorTilt.lerp(targetTilt, 0.06);

        root.position.x = logoPosition.x;
        root.position.y = logoPosition.y + Math.sin(time * 0.6) * 0.025;
        root.scale.setScalar(anchorBounds.width / anchor.offsetWidth);
        root.rotation.set(cursorTilt.x, cursorTilt.y, 0);
        ringGroups.forEach(({ group, parallax, period }, index) => {
          group.rotation.x = Math.sin(time * 0.32 + index * 0.7) * RING_SWING_LIMIT
            + cursorTilt.x * parallax * 0.25;
          group.rotation.y = Math.sin(time * Math.PI * 2 / period + index) * RING_Y_SWING_LIMIT
            + cursorTilt.y * parallax * 0.25;
          group.rotation.z = Math.sin(time * 0.22 + index) * 0.012;
        });
        const diamondAngle = time * Math.PI * 2 / effect.diamondRotationPeriod;
        diamondGroup.rotation.set(diamondAngle * 0.7, diamondAngle, diamondAngle * 0.35);

        simulationMaterial.uniforms.uPrevious.value = readTarget.texture;
        simulationMaterial.uniforms.uLight.value.copy(lightPoint);
        simulationMaterial.uniforms.uLightVelocity.value
          .copy(lightVelocity)
          .addScaledVector(cursorVelocity, 0.55);
        simulationMaterial.uniforms.uTime.value = time;
        const speed = Math.min(cursorVelocity.length() * 60 + lightVelocity.length() * 24, 1);
        const stopDuration = hasPointerInput ? now - lastInputTime : Infinity;
        const motionFade = Math.exp(-Math.max(stopDuration - 100, 0) / 720);
        const splatStrength = idle ? effect.idleIntensity : speed * motionFade;
        simulationMaterial.uniforms.uSplatStrength.value = splatStrength;
        keyLight.intensity = emblem.keyLightIntensity * (
          idle ? effect.idleIntensity : Math.max(speed * motionFade, 0.015)
        );
        const width = window.innerWidth;
        const height = window.innerHeight;
        const unitsPerPixel = WORLD_SIZE / anchor.offsetWidth;
        keyLight.position.set(
          (lightPoint.x - 0.5) * width * unitsPerPixel,
          (lightPoint.y - 0.5) * height * unitsPerPixel,
          1.1,
        );

        renderer.setRenderTarget(writeTarget);
        renderer.render(fluidScene, fluidCamera);
        renderer.setRenderTarget(null);
        [readTarget, writeTarget] = [writeTarget, readTarget];
        displayMaterial.uniforms.uTrail.value = readTarget.texture;
        displayMaterial.uniforms.uTime.value = time;
        const flare = flareStartedAt ? Math.max(0, 1 - (now - flareStartedAt) / 400) : 0;
        displayMaterial.uniforms.uFlare.value = flare;
        emblemMeshes.forEach((mesh) => {
          const trailUniform = mesh.material.userData.trailUniforms.uTrailTexture;
          trailUniform.value = readTarget.texture;
        });
        grainPass.uniforms.uTime.value = time;

        composer.render(elapsed);
        animationFrame = window.requestAnimationFrame(renderFrame);
      };

      const startLoop = () => {
        if (!disposed && !document.hidden && !reducedMotion.matches && !animationFrame) {
          lastFrameTime = performance.now();
          animationFrame = window.requestAnimationFrame(renderFrame);
        }
      };

      const handleVisibilityChange = () => {
        if (document.hidden) {
          if (animationFrame) window.cancelAnimationFrame(animationFrame);
          animationFrame = 0;
        } else if (reducedMotion.matches) {
          renderStatic();
        } else {
          startLoop();
        }
      };

      const handleResize = () => {
        if (host.isConnected) updateLayout();
      };

      const handleMotionPreferenceChange = () => {
        if (animationFrame) window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        displayMaterial.uniforms.uStaticGlow.value = reducedMotion.matches ? 1 : 0;
        if (reducedMotion.matches) renderStatic();
        else startLoop();
      };

      const handleFlare = () => {
        flareStartedAt = performance.now();
        if (!reducedMotion.matches) startLoop();
        else {
          displayMaterial.uniforms.uFlare.value = 1;
          renderStatic();
        }
      };

      updateLayout();
      window.addEventListener("pointermove", handlePointerMove, { passive: true });
      window.addEventListener("resize", handleResize);
      document.addEventListener("visibilitychange", handleVisibilityChange);
      reducedMotion.addEventListener("change", handleMotionPreferenceChange);
      if ("ResizeObserver" in window) {
        resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(anchorRef.current);
        resizeObserver.observe(textBlockRef.current);
      }

      if (reducedMotion.matches) renderStatic();
      else startLoop();
      flareHandlerRef.current = handleFlare;

      return () => {
        disposed = true;
        if (animationFrame) window.cancelAnimationFrame(animationFrame);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("resize", handleResize);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        reducedMotion.removeEventListener("change", handleMotionPreferenceChange);
        resizeObserver?.disconnect();
        composer.dispose();
        bloomPass.dispose();
        outputPass.dispose();
        grainPass.material.dispose();
        geometries.forEach((geometry) => geometry.dispose());
        materials.forEach((material) => material.dispose());
        simulationTargetA.dispose();
        simulationTargetB.dispose();
        bumpTexture.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        flareHandlerRef.current = null;
      };
    } catch (error) {
      console.warn("WebGL welcome emblem unavailable; using SVG fallback.", error);
      renderer?.dispose();
      const bounds = anchorRef.current?.getBoundingClientRect();
      if (bounds) {
        setFallbackBounds({
          left: bounds.left,
          top: bounds.top,
          width: bounds.width,
          height: bounds.height,
        });
      }
      setWebglFailed(true);
    }
  }, []);

  useEffect(() => {
    if (flaring) flareHandlerRef.current?.();
  }, [flaring]);

  useEffect(() => {
    if (!webglFailed) return undefined;
    const updateFallbackBounds = () => {
      const bounds = anchorRef.current?.getBoundingClientRect();
      if (bounds) {
        setFallbackBounds({
          left: bounds.left,
          top: bounds.top,
          width: bounds.width,
          height: bounds.height,
        });
      }
    };
    window.addEventListener("resize", updateFallbackBounds);
    return () => window.removeEventListener("resize", updateFallbackBounds);
  }, [webglFailed, anchorRef]);

  return (
    <div ref={hostRef} className={styles.emblemStage} aria-hidden="true">
      {webglFailed && fallbackBounds && <EmblemFallback style={fallbackBounds} />}
    </div>
  );
};

export default EmblemScene;
