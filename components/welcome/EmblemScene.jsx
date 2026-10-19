"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import styles from "./welcome.module.scss";
import {
  emblemFragmentShader,
  emblemVertexShader,
  fluidDisplayShader,
  fluidSimulationShader,
  fullscreenVertexShader,
} from "./fluidShaders";
import { welcomeConfig } from "./welcomeConfig";

const { effect, colors } = welcomeConfig;
const BUFFER_SIZE = effect.bufferSize;
const WORLD_SIZE = 4.4;
const CURSOR_TILT_LIMIT = Math.PI / 30;
const RING_SWING_LIMIT = Math.PI / 15;
const RINGS = [
  { radius: 1.0, depth: 0.08, opacity: 0.26, parallax: 0.7, period: effect.ringRotationPeriods[0] },
  { radius: 0.8, depth: 0, opacity: 0.32, parallax: 1, period: effect.ringRotationPeriods[1] },
  { radius: 0.58, depth: -0.08, opacity: 0.38, parallax: 1.3, period: effect.ringRotationPeriods[2] },
];

const EmblemFallback = ({ style }) => (
  <svg className={styles.fallbackEmblem} style={style} viewBox="-2.2 -2.2 4.4 4.4" aria-hidden="true">
    <circle cx="0" cy="0" r="1" />
    <circle cx="0" cy="0" r="0.8" />
    <circle cx="0" cy="0" r="0.58" />
    <path d="M 0,-0.13 L 0.13,0 L 0,0.13 L -0.13,0 Z" />
  </svg>
);

const EmblemScene = ({ flaring, anchorRef, textBlockRef }) => {
  const hostRef = useRef(null);
  const flareHandlerRef = useRef(null);
  const [webglFailed, setWebglFailed] = useState(false);
  const [fallbackBounds, setFallbackBounds] = useState(null);

  useEffect(() => {
    const host = hostRef.current;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let renderer;
    let simulationTargetA;
    let simulationTargetB;
    let simulationMaterial;
    let displayMaterial;
    let geometries = [];
    let materials = [];
    let resizeObserver;
    let animationFrame = 0;
    let disposed = false;

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
      const glowColors = () => ({
        uDeepBlue: { value: new THREE.Color(colors.deepBlue) },
        uBlue: { value: new THREE.Color(colors.blue) },
        uPaleBlue: { value: new THREE.Color(colors.paleBlue) },
      });
      const camera = new THREE.OrthographicCamera(-WORLD_SIZE / 2, WORLD_SIZE / 2, WORLD_SIZE / 2, -WORLD_SIZE / 2, 0.1, 10);
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
      geometries.push(fullscreenGeometry);
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
      materials.push(simulationMaterial);
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
          ...glowColors(),
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      materials.push(displayMaterial);
      const glowPlane = new THREE.Mesh(fullscreenGeometry, displayMaterial);
      glowPlane.position.z = -0.9;
      scene.add(glowPlane);

      const root = new THREE.Group();
      scene.add(root);
      const ringGroups = RINGS.map(({ radius, depth, opacity, parallax, period }) => {
        const group = new THREE.Group();
        group.position.z = depth;
        const geometry = new THREE.TorusGeometry(radius, 0.006, 6, 240);
        const material = new THREE.ShaderMaterial({
          vertexShader: emblemVertexShader,
          fragmentShader: emblemFragmentShader,
          uniforms: {
            uTrail: { value: simulationTargetA.texture },
            uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
            uLogoUv: { value: new THREE.Vector2(0.5, 0.66) },
            uLogoRadius: { value: 90 },
            uOpacity: { value: opacity },
            uFlare: { value: 0 },
            uStaticGlow: { value: reducedMotion.matches ? 1 : 0 },
            uTime: { value: 0 },
            uEdgeRaggedness: { value: effect.edgeRaggedness },
            uMaskSize: { value: effect.maskSize },
            uSilver: { value: new THREE.Color(colors.silver) },
            uBlue: { value: new THREE.Color(colors.blue) },
            uPaleBlue: { value: new THREE.Color(colors.paleBlue) },
            uDeepBlue: { value: new THREE.Color(colors.deepBlue) },
          },
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        });
        geometries.push(geometry);
        materials.push(material);
        group.add(new THREE.Mesh(geometry, material));
        root.add(group);
        return { group, parallax, period };
      });

      const diamondGeometry = new THREE.OctahedronGeometry(0.14, 0);
      const diamondMaterial = new THREE.ShaderMaterial({
        vertexShader: emblemVertexShader,
        fragmentShader: emblemFragmentShader,
        uniforms: {
          uTrail: { value: simulationTargetA.texture },
          uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
          uLogoUv: { value: new THREE.Vector2(0.5, 0.66) },
          uLogoRadius: { value: 90 },
          uOpacity: { value: 0.72 },
          uFlare: { value: 0 },
          uStaticGlow: { value: reducedMotion.matches ? 1 : 0 },
          uTime: { value: 0 },
          uEdgeRaggedness: { value: effect.edgeRaggedness },
          uMaskSize: { value: effect.maskSize },
          uSilver: { value: new THREE.Color(colors.silver) },
          uBlue: { value: new THREE.Color(colors.blue) },
          uPaleBlue: { value: new THREE.Color(colors.paleBlue) },
          uDeepBlue: { value: new THREE.Color(colors.deepBlue) },
        },
        wireframe: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      geometries.push(diamondGeometry);
      materials.push(diamondMaterial);
      const diamond = new THREE.Mesh(diamondGeometry, diamondMaterial);
      root.add(diamond);
      const emblemMaterials = materials.slice(2);

      const pointer = new THREE.Vector2(0.5, 0.5);
      const previousPointer = new THREE.Vector2(0.5, 0.5);
      const cursorVelocity = new THREE.Vector2();
      const lightPoint = new THREE.Vector2(0.5, 0.5);
      const previousLightPoint = new THREE.Vector2(0.5, 0.5);
      const lightVelocity = new THREE.Vector2();
      const lightDelta = new THREE.Vector2();
      const lightBounds = {
        min: new THREE.Vector2(0.01, 0.01),
        max: new THREE.Vector2(0.99, 0.99),
      };
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

      const updateLayout = () => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        anchorBounds = anchorRef.current?.getBoundingClientRect();
        const anchorWidth = anchorRef.current?.offsetWidth;
        const anchorHeight = anchorRef.current?.offsetHeight;
        if (!anchorBounds?.width || !anchorBounds.height || !anchorWidth || !anchorHeight) return;

        const unitsPerPixel = WORLD_SIZE / anchorWidth;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(width, height, false);
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
        emblemMaterials.forEach((material) => {
          material.uniforms.uResolution.value.set(width, height);
          material.uniforms.uLogoUv.value.copy(logoUv);
          material.uniforms.uLogoRadius.value = logoRadius;
        });

      };

      const handlePointerMove = (event) => {
        if (!canHover || event.pointerType === "touch") return;
        const x = event.clientX / window.innerWidth;
        const y = 1 - event.clientY / window.innerHeight;

        pointer.set(x, y);
        lastInputTime = performance.now();
        hasPointerInput = true;
        if (anchorBounds?.width && anchorBounds.height) {
          const centerX = anchorBounds.left + anchorBounds.width / 2;
          const centerY = anchorBounds.top + anchorBounds.height / 2;
          const anchorWidth = anchorRef.current.offsetWidth;
          const anchorHeight = anchorRef.current.offsetHeight;
          targetTilt.set(
            THREE.MathUtils.clamp((centerY - event.clientY) / (anchorHeight / 2), -1, 1) * CURSOR_TILT_LIMIT,
            THREE.MathUtils.clamp((event.clientX - centerX) / (anchorWidth / 2), -1, 1) * CURSOR_TILT_LIMIT,
          );
        }
      };

      const handleResize = () => {
        if (!host.isConnected) return;
        updateLayout();
        if (reducedMotion.matches) renderStatic();
      };

      const renderStatic = () => {
        updateLayout();
        renderer.setRenderTarget(null);
        renderer.clear();
        renderer.render(scene, camera);
      };

      const renderFrame = (now) => {
        animationFrame = 0;
        if (disposed || document.hidden || reducedMotion.matches) return;

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
          const idleRangeX = anchorRef.current.offsetWidth / window.innerWidth * 0.2;
          const idleRangeY = anchorRef.current.offsetHeight / window.innerHeight * 0.18;
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
        const spring = effect.cursorLag * frameScale;
        const damping = Math.pow(0.84, frameScale);
        cursorVelocity.copy(pointer).sub(previousPointer).divideScalar(frameScale);
        previousPointer.copy(pointer);
        previousLightPoint.copy(lightPoint);
        lightDelta.subVectors(pointer, lightPoint);
        lightVelocity.addScaledVector(lightDelta, spring);
        lightVelocity.multiplyScalar(damping);
        lightPoint.addScaledVector(lightVelocity, frameScale);
        lightPoint.clamp(lightBounds.min, lightBounds.max);
        lightVelocity.copy(lightPoint).sub(previousLightPoint).divideScalar(frameScale);
        cursorTilt.lerp(targetTilt, 0.06);
        root.position.x = logoPosition.x;
        root.position.y = logoPosition.y + Math.sin(time * 0.6) * 0.025;
        root.scale.setScalar(anchorBounds.width / anchorRef.current.offsetWidth);
        root.rotation.x = cursorTilt.x;
        root.rotation.y = cursorTilt.y;

        ringGroups.forEach(({ group, parallax, period }, index) => {
          group.rotation.x = Math.sin(time * 0.32 + index * 0.7) * RING_SWING_LIMIT
            + cursorTilt.x * parallax * 0.25;
          group.rotation.y = time * (Math.PI * 2 / period)
            + cursorTilt.y * parallax * 0.25;
          group.rotation.z = Math.sin(time * 0.22 + index) * 0.012;
        });
        const diamondAngle = time * (Math.PI * 2 / effect.diamondRotationPeriod);
        diamond.rotation.set(diamondAngle * 0.7, diamondAngle, diamondAngle * 0.35);

        simulationMaterial.uniforms.uPrevious.value = readTarget.texture;
        simulationMaterial.uniforms.uLight.value.copy(lightPoint);
        simulationMaterial.uniforms.uLightVelocity.value
          .copy(lightVelocity)
          .addScaledVector(cursorVelocity, 0.55);
        simulationMaterial.uniforms.uTime.value = time;
        const speed = Math.min(cursorVelocity.length() * 60 + lightVelocity.length() * 24, 1);
        const stopDuration = hasPointerInput ? now - lastInputTime : Infinity;
        const motionFade = Math.exp(-Math.max(stopDuration - 100, 0) / 720);
        simulationMaterial.uniforms.uSplatStrength.value = idle
          ? effect.idleIntensity
          : speed * motionFade;
        renderer.setRenderTarget(writeTarget);
        renderer.render(fluidScene, fluidCamera);
        renderer.setRenderTarget(null);

        // Ping-pong buffers so each fluid pass samples the previous frame.
        [readTarget, writeTarget] = [writeTarget, readTarget];
        displayMaterial.uniforms.uTrail.value = readTarget.texture;
        displayMaterial.uniforms.uTime.value = time;
        const flare = flareStartedAt ? Math.max(0, 1 - (now - flareStartedAt) / 400) : 0;
        displayMaterial.uniforms.uFlare.value = flare;
        emblemMaterials.forEach((material) => {
          material.uniforms.uTrail.value = readTarget.texture;
          material.uniforms.uFlare.value = flare;
          material.uniforms.uTime.value = time;
        });

        renderer.clear();
        renderer.render(scene, camera);
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

      const handleMotionPreferenceChange = () => {
        if (animationFrame) window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        displayMaterial.uniforms.uStaticGlow.value = reducedMotion.matches ? 1 : 0;
        emblemMaterials.forEach((material) => {
          material.uniforms.uStaticGlow.value = reducedMotion.matches ? 1 : 0;
        });
        if (reducedMotion.matches) renderStatic();
        else startLoop();
      };

      const handleFlare = () => {
        flareStartedAt = performance.now();
        if (!reducedMotion.matches) startLoop();
        else {
          displayMaterial.uniforms.uFlare.value = 1;
          emblemMaterials.forEach((material) => {
            material.uniforms.uFlare.value = 1;
          });
          renderStatic();
        }
      };

      window.addEventListener("pointermove", handlePointerMove, { passive: true });
      document.addEventListener("visibilitychange", handleVisibilityChange);
      reducedMotion.addEventListener("change", handleMotionPreferenceChange);
      window.addEventListener("resize", handleResize);
      if ("ResizeObserver" in window) {
        resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(anchorRef.current);
        resizeObserver.observe(textBlockRef.current);
      }

      updateLayout();
      if (reducedMotion.matches) renderStatic();
      else startLoop();

      flareHandlerRef.current = handleFlare;

      return () => {
        disposed = true;
        if (animationFrame) window.cancelAnimationFrame(animationFrame);
        window.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        reducedMotion.removeEventListener("change", handleMotionPreferenceChange);
        window.removeEventListener("resize", handleResize);
        resizeObserver?.disconnect();
        geometries.forEach((geometry) => geometry.dispose());
        materials.forEach((material) => material.dispose());
        simulationTargetA.dispose();
        simulationTargetB.dispose();
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
      if (!bounds) return;
      setFallbackBounds({
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
      });
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
