"use client";

import { useEffect, useRef } from "react";
import styles from "./backgroundParticles.module.scss";

const PARTICLE_COUNT = 280;
const MAX_PIXEL_RATIO = 1.75;

const randomBetween = (min, max) => Math.random() * (max - min) + min;

const createParticle = (width, height) => {
  const sideWidth = width * 0.23;
  const onLeft = Math.random() < 0.5;
  const pointCount = Math.floor(randomBetween(4, 7));

  return {
    x: onLeft
      ? randomBetween(width * 0.025, sideWidth)
      : randomBetween(width - sideWidth, width * 0.975),
    y: randomBetween(0, height),
    size: randomBetween(1.5, 5),
    speed: randomBetween(0.25, 0.85),
    drift: randomBetween(-0.22, 0.22),
    rotation: randomBetween(0, Math.PI * 2),
    rotationSpeed: randomBetween(-0.012, 0.012),
    phase: randomBetween(0, Math.PI * 2),
    opacity: randomBetween(0.18, 0.55),
    color: Math.random() < 0.7 ? "222, 218, 210" : "86, 83, 79",
    points: Array.from({ length: pointCount }, () => randomBetween(0.55, 1.35)),
  };
};

const BackgroundParticles = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      console.error("Unable to initialize the hero background particle canvas.");
      return;
    }

    let width = 0;
    let height = 0;
    let particles = [];
    let animationFrame;
    let previousTime = 0;
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const resizeCanvas = () => {
      const bounds = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      width = bounds.width;
      height = bounds.height;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      particles = Array.from({ length: PARTICLE_COUNT }, () =>
        createParticle(width, height)
      );
    };

    const drawParticle = (particle) => {
      const fadeIn = Math.min(1, particle.y / 80);
      const fadeOut = Math.min(1, (height - particle.y) / 100);
      const opacity = Math.max(0, Math.min(fadeIn, fadeOut)) * particle.opacity;

      if (opacity === 0) return;

      context.save();
      context.translate(particle.x, particle.y);
      context.rotate(particle.rotation);
      context.beginPath();
      particle.points.forEach((radius, index) => {
        const angle = (index / particle.points.length) * Math.PI * 2;
        const x = Math.cos(angle) * particle.size * radius;
        const y = Math.sin(angle) * particle.size * radius;

        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.closePath();
      context.fillStyle = `rgba(${particle.color}, ${opacity})`;
      context.fill();
      context.restore();
    };

    const drawFrame = (time) => {
      const frameScale = previousTime ? Math.min((time - previousTime) / 16.67, 2) : 1;
      previousTime = time;
      context.clearRect(0, 0, width, height);

      particles.forEach((particle) => {
        if (!prefersReducedMotion) {
          particle.y -= particle.speed * frameScale;
          particle.x +=
            (particle.drift + Math.sin(particle.phase) * 0.12) * frameScale;
          particle.rotation += particle.rotationSpeed * frameScale;
          particle.phase += 0.018 * frameScale;

          if (particle.y < -particle.size * 2) {
            const replacement = createParticle(width, height);
            particle.x = replacement.x;
            particle.y = height + randomBetween(0, 100);
            particle.size = replacement.size;
            particle.speed = replacement.speed;
            particle.drift = replacement.drift;
            particle.rotation = replacement.rotation;
            particle.rotationSpeed = replacement.rotationSpeed;
            particle.phase = replacement.phase;
            particle.opacity = replacement.opacity;
            particle.color = replacement.color;
            particle.points = replacement.points;
          }
        }

        drawParticle(particle);
      });

      if (!prefersReducedMotion) {
        animationFrame = window.requestAnimationFrame(drawFrame);
      }
    };

    resizeCanvas();
    drawFrame(0);
    window.addEventListener("resize", resizeCanvas);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resizeCanvas);
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.particles} aria-hidden="true" />;
};

export default BackgroundParticles;
