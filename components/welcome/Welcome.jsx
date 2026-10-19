"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { disableMusic, enableMusic } from "@/components/audio/audioManager";
import styles from "./welcome.module.scss";
import { welcomeConfig } from "./welcomeConfig";

const EmblemScene = dynamic(() => import("./EmblemScene"), { ssr: false });

const staggeredEntrance = (delay) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.72, delay, ease: [0.22, 1, 0.36, 1] },
});

const Welcome = ({ onContinue }) => {
  const [isExiting, setIsExiting] = useState(false);
  const [isFlaring, setIsFlaring] = useState(false);
  const [playbackError, setPlaybackError] = useState("");
  const [sparkCursor, setSparkCursor] = useState({ visible: false, x: 0, y: 0 });
  const exitTimer = useRef(null);
  const isStarting = useRef(false);
  const emblemRef = useRef(null);
  const textBlockRef = useRef(null);

  useEffect(() => () => window.clearTimeout(exitTimer.current), []);

  const handleContinue = async (withMusic) => {
    if (isExiting || isStarting.current) return;
    isStarting.current = true;

    if (withMusic) {
      try {
        await enableMusic();
      } catch (error) {
        console.error("Unable to start portfolio music:", error);
        setPlaybackError("Music could not be started. Please try again or continue without sound.");
        isStarting.current = false;
        return;
      }
    } else {
      disableMusic();
    }

    setPlaybackError("");
    setIsFlaring(true);
    setIsExiting(true);
    exitTimer.current = window.setTimeout(() => onContinue(withMusic), 1100);
  };

  return (
    <motion.div
      className={`${styles.welcome} ${isExiting ? styles.exiting : ""}`}
      style={{
        "--welcome-background": welcomeConfig.colors.background,
        "--welcome-center": welcomeConfig.colors.center,
        "--welcome-edge": welcomeConfig.colors.edge,
        "--welcome-text": welcomeConfig.colors.text,
        "--welcome-muted": welcomeConfig.colors.muted,
        "--welcome-pale-blue": welcomeConfig.colors.paleBlue,
        "--welcome-blue": welcomeConfig.colors.blue,
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-heading"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.65, ease: "easeOut" }}
    >
      <EmblemScene
        flaring={isFlaring}
        anchorRef={emblemRef}
        textBlockRef={textBlockRef}
      />
      {sparkCursor.visible && (
        <svg
          className={styles.sparkCursor}
          style={{ left: sparkCursor.x, top: sparkCursor.y }}
          viewBox="0 0 40 40"
          aria-hidden="true"
        >
          <path className={styles.sparkTrail} d="M8 32 23 17" />
          <path className={styles.sparkShaft} d="m8 32 15-15" />
          <path className={styles.sparkFlame} d="M24 15c-2-5 2-8 6-10 0 5 4 8 1 12-2 3-6 2-7-2Z" />
          <path className={styles.sparkCore} d="M27 15c0-2 1-3 2-4 0 2 2 3 1 5-1 1-2 1-3-1Z" />
          <path className={styles.sparkGlint} d="M32 7V3m-2 6-3-2m7 1 2-3" />
        </svg>
      )}
      <div className={styles.content}>
        <motion.div
          ref={emblemRef}
          className={styles.emblemEntrance}
          onPointerEnter={(event) => {
            if (event.pointerType !== "mouse") return;
            setSparkCursor({ visible: true, x: event.clientX, y: event.clientY });
          }}
          onPointerMove={(event) => {
            if (event.pointerType !== "mouse") return;
            setSparkCursor({ visible: true, x: event.clientX, y: event.clientY });
          }}
          onPointerLeave={() => setSparkCursor((cursor) => ({ ...cursor, visible: false }))}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        />

        <div ref={textBlockRef} className={styles.textBlock}>
          <motion.p className={styles.eyebrow} {...staggeredEntrance(1.2)}>
            {welcomeConfig.copy.label}
          </motion.p>
          <motion.h1 id="welcome-heading" {...staggeredEntrance(1.32)}>
            {welcomeConfig.copy.heading}
          </motion.h1>
          <motion.p className={styles.description} {...staggeredEntrance(1.44)}>
            {welcomeConfig.copy.description}
          </motion.p>

          <motion.div className={styles.actions} {...staggeredEntrance(1.56)}>
            <button type="button" className={styles.primaryAction} onClick={() => handleContinue(true)}>
              {welcomeConfig.copy.primaryAction}
            </button>
            <button type="button" className={styles.secondaryAction} onClick={() => handleContinue(false)}>
              {welcomeConfig.copy.secondaryAction}
            </button>
          </motion.div>
          {playbackError && (
            <p className={styles.playbackError} role="status">
              {playbackError}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default Welcome;
