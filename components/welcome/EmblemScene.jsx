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

const BUFFER_SIZE = 256;
const WORLD_SIZE = 4.4;
const RINGS = [
  { radius: 1.0, depth: 0.08, opacity: 0.3, parallax: 0.7 },
  { radius: 0.8, depth: 0, opacity: 0.46, parallax: 1 },
  { radius: 0.58, depth: -0.08, opacity: 0.62, parallax: 1.3 },
];

const EmblemFallback = () => (
  <svg className={styles.fallbackEmblem} viewBox="-2.2 -2.2 4.4 4.4" aria-hidden="true">
    <circle cx="0" cy="0" r="1" />
    <circle cx="0" cy="0" r="0.8" />
    <circle cx="0" cy="0" r="0.58" />
    <path d="M 0,-0.13 L 0.13,0 L 0,0.13 L -0.13,0 Z" />
  </svg>
);

const EmblemScene = ({ flaring }) => {
  const hostRef = useRef(null);
  const flareHandlerRef = useRef(null);
  const [webglFailed, setWebglFailed] = useState(false);

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

      const rect = host.getBoundingClientRect();
      renderer.setSize(rect.width, rect.height, false);

      const scene = new THREE.Scene();
      const colors = welcomeConfig.colors;
      const glowColors = {
        uDeepBlue: { value: new THREE.Color(colors.deepBlue) },
        uBlue: { value: new THREE.Color(colors.blue) },
        uPaleBlue: { value: new THREE.Color(colors.paleBlue) },
      };
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
          uMouse: { value: new THREE.Vector2(0.5, 0.5) },
          uVelocity: { value: new THREE.Vector2() },
          uResolution: { value: new THREE.Vector2(BUFFER_SIZE, BUFFER_SIZE) },
          uTime: { value: 0 },
          uDissipation: { value: 0.97 },
          uSplatStrength: { value: 0.35 },
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
          uTime: { value: 0 },
          uFlare: { value: 0 },
          uStaticGlow: { value: reducedMotion.matches ? 1 : 0 },
          ...glowColors,
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
      const ringGroups = RINGS.map(({ radius, depth, opacity, parallax }) => {
        const group = new THREE.Group();
        group.position.z = depth;
        const geometry = new THREE.TorusGeometry(radius, 0.006, 6, 240);
        const material = new THREE.ShaderMaterial({
          vertexShader: emblemVertexShader,
          fragmentShader: emblemFragmentShader,
          uniforms: {
            uTrail: { value: simulationTargetA.texture },
            uOpacity: { value: opacity },
            uFlare: { value: 0 },
            uStaticGlow: { value: reducedMotion.matches ? 1 : 0 },
            uTime: { value: 0 },
            uSilver: { value: new THREE.Color(colors.silver) },
            uBlue: { value: new THREE.Color(colors.blue) },
            uPaleBlue: { value: new THREE.Color(colors.paleBlue) },
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
        return { group, parallax };
      });

      const diamondGeometry = new THREE.OctahedronGeometry(0.14, 0);
      const diamondMaterial = new THREE.ShaderMaterial({
        vertexShader: emblemVertexShader,
        fragmentShader: emblemFragmentShader,
        uniforms: {
          uTrail: { value: simulationTargetA.texture },
          uOpacity: { value: 0.72 },
          uFlare: { value: 0 },
          uStaticGlow: { value: reducedMotion.matches ? 1 : 0 },
          uTime: { value: 0 },
          uSilver: { value: new THREE.Color(colors.silver) },
          uBlue: { value: new THREE.Color(colors.blue) },
          uPaleBlue: { value: new THREE.Color(colors.paleBlue) },
        },
        wireframe: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      geometries.push(diamondGeometry);
      materials.push(diamondMaterial);
      root.add(new THREE.Mesh(diamondGeometry, diamondMaterial));
      const emblemMaterials = materials.slice(2);

      const pointer = new THREE.Vector2(0.5, 0.5);
      const lastPointer = new THREE.Vector2(0.5, 0.5);
      const pointerVelocity = new THREE.Vector2();
      const cursorTilt = new THREE.Vector2();
      const targetTilt = new THREE.Vector2();
      let lastInputTime = 0;
      let flareStartedAt = flaring ? performance.now() : 0;
      let readTarget = simulationTargetA;
      let writeTarget = simulationTargetB;
      let lastFrameTime = performance.now();

      const handlePointerMove = (event) => {
        const bounds = host.getBoundingClientRect();
        const x = (event.clientX - bounds.left) / bounds.width;
        const y = 1 - (event.clientY - bounds.top) / bounds.height;
        if (x < 0 || x > 1 || y < 0 || y > 1) return;

        pointer.set(x, y);
        lastInputTime = performance.now();
        targetTilt.set((0.5 - y) * 0.28, (x - 0.5) * 0.28);
      };

      const handleResize = () => {
        if (!host.isConnected) return;
        const bounds = host.getBoundingClientRect();
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(bounds.width, bounds.height, false);
        if (reducedMotion.matches) renderStatic();
      };

      const renderStatic = () => {
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
        if (now - lastInputTime > 2000) {
          const autonomousTime = time * 0.34;
          pointer.set(
            0.5 + Math.sin(autonomousTime) * 0.29,
            0.5 + Math.sin(autonomousTime * 1.37 + 0.7) * 0.25,
          );
          targetTilt.set(
            Math.sin(autonomousTime * 0.7) * 0.06,
            Math.cos(autonomousTime * 0.65) * 0.06,
          );
        }

        pointerVelocity.copy(pointer).sub(lastPointer).multiplyScalar(1 / Math.max(elapsed * 60, 1));
        lastPointer.copy(pointer);
        cursorTilt.lerp(targetTilt, 0.06);
        root.position.y = Math.sin(time * 0.6) * 0.025;
        root.rotation.x = Math.sin(time * 0.42) * 0.08 + cursorTilt.x;
        root.rotation.y = Math.sin(time * 0.37) * 0.08 + cursorTilt.y;

        ringGroups.forEach(({ group, parallax }, index) => {
          group.rotation.x = cursorTilt.x * parallax;
          group.rotation.y = cursorTilt.y * parallax;
          group.rotation.z = Math.sin(time * 0.22 + index) * 0.012;
        });

        simulationMaterial.uniforms.uPrevious.value = readTarget.texture;
        simulationMaterial.uniforms.uMouse.value.copy(pointer);
        simulationMaterial.uniforms.uVelocity.value.copy(pointerVelocity).multiplyScalar(0.04);
        simulationMaterial.uniforms.uTime.value = time;
        simulationMaterial.uniforms.uSplatStrength.value =
          now - lastInputTime > 2000 ? 0.28 : 0.28 + Math.min(pointerVelocity.length() * 1.2, 0.62);
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

      host.addEventListener("pointermove", handlePointerMove, { passive: true });
      document.addEventListener("visibilitychange", handleVisibilityChange);
      reducedMotion.addEventListener("change", handleMotionPreferenceChange);
      window.addEventListener("resize", handleResize);
      if ("ResizeObserver" in window) {
        resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(host);
      }

      if (reducedMotion.matches) renderStatic();
      else startLoop();

      flareHandlerRef.current = handleFlare;

      return () => {
        disposed = true;
        if (animationFrame) window.cancelAnimationFrame(animationFrame);
        host.removeEventListener("pointermove", handlePointerMove);
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
      setWebglFailed(true);
    }

    return () => {
      disposed = true;
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      simulationTargetA?.dispose();
      simulationTargetB?.dispose();
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }, []);

  useEffect(() => {
    if (flaring) flareHandlerRef.current?.();
  }, [flaring]);

  return (
    <div ref={hostRef} className={styles.emblemStage} aria-hidden="true">
      {webglFailed && <EmblemFallback />}
    </div>
  );
};

export default EmblemScene;
