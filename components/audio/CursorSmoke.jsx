"use client";

import { useEffect, useRef } from "react";
import styles from "./audioGate.module.scss";

const CursorSmoke = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const touchInput = window.matchMedia("(pointer: coarse)");

    if (!canvas || !context || reducedMotion.matches || touchInput.matches) {
      return;
    }

    let width = 0;
    let height = 0;
    let frameId = 0;
    let previousPoint = null;
    let particles = [];

    const resizeCanvas = () => {
      const bounds = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      width = bounds.width;
      height = bounds.height;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };

    const animate = () => {
      frameId = 0;
      const now = performance.now();
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "screen";

      particles = particles.filter((particle) => {
        const progress = (now - particle.bornAt) / particle.life;
        if (progress >= 1) return false;

        particle.x += particle.velocityX;
        particle.y += particle.velocityY;
        particle.velocityX *= 0.985;
        particle.velocityY *= 0.985;

        const fade = 1 - progress;
        const radius = particle.radius * (0.75 + progress * 0.5);
        const gradient = context.createRadialGradient(
          particle.x,
          particle.y,
          0,
          particle.x,
          particle.y,
          radius,
        );
        gradient.addColorStop(0, `rgba(226, 237, 255, ${particle.opacity * fade})`);
        gradient.addColorStop(0.25, `rgba(190, 213, 244, ${particle.opacity * fade * 0.42})`);
        gradient.addColorStop(1, "rgba(160, 190, 230, 0)");
        context.fillStyle = gradient;
        context.fillRect(
          particle.x - radius,
          particle.y - radius,
          radius * 2,
          radius * 2,
        );
        return true;
      });

      context.globalCompositeOperation = "source-over";
      if (particles.length > 0) {
        frameId = window.requestAnimationFrame(animate);
      }
    };

    const requestAnimation = () => {
      if (!frameId) {
        frameId = window.requestAnimationFrame(animate);
      }
    };

    const addParticle = (x, y, now, glow = false) => {
      particles.push({
        x: x + (Math.random() - 0.5) * 12,
        y: y + (Math.random() - 0.5) * 12,
        velocityX: (Math.random() - 0.5) * (glow ? 0.55 : 0.9),
        velocityY: -Math.random() * (glow ? 0.45 : 0.8),
        radius: glow ? 5 + Math.random() * 9 : 20 + Math.random() * 26,
        opacity: glow ? 0.2 + Math.random() * 0.12 : 0.12 + Math.random() * 0.1,
        bornAt: now,
        life: glow ? 420 + Math.random() * 260 : 700 + Math.random() * 550,
      });
    };

    const handlePointerMove = (event) => {
      if (event.pointerType === "touch") return;

      const point = { x: event.clientX, y: event.clientY };
      if (previousPoint) {
        const deltaX = point.x - previousPoint.x;
        const deltaY = point.y - previousPoint.y;
        const distance = Math.hypot(deltaX, deltaY);
        const steps = Math.min(Math.ceil(distance / 9), 24);
        const now = performance.now();

        for (let step = 1; step <= steps; step += 1) {
          const fraction = step / steps;
          const x = previousPoint.x + deltaX * fraction;
          const y = previousPoint.y + deltaY * fraction;
          addParticle(x, y, now);
          if (step % 2 === 0) addParticle(x, y, now, true);
        }

        if (particles.length > 180) {
          particles.splice(0, particles.length - 180);
        }
        if (steps > 0) requestAnimation();
      }
      previousPoint = point;
    };

    const handlePointerLeave = () => {
      previousPoint = null;
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", handlePointerLeave);
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.smokeCanvas} aria-hidden="true" />;
};

export default CursorSmoke;
