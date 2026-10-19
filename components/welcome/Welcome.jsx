"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import EmblemScene from "./EmblemScene";
import styles from "./welcome.module.scss";
import { welcomeConfig } from "./welcomeConfig";

const staggeredEntrance = (delay) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.72, delay, ease: [0.22, 1, 0.36, 1] },
});

const Welcome = ({ audioRef, onContinue }) => {
  const [isExiting, setIsExiting] = useState(false);
  const [isFlaring, setIsFlaring] = useState(false);
  const [playbackError, setPlaybackError] = useState("");
  const exitTimer = useRef(null);

  useEffect(() => () => window.clearTimeout(exitTimer.current), []);

  const handleContinue = async (withMusic) => {
    if (isExiting) return;

    if (withMusic) {
      const audio = audioRef.current;
      if (!audio) {
        setPlaybackError("Music could not be loaded. You can continue without sound.");
        return;
      }

      audio.volume = 0.35;
      try {
        await audio.play();
      } catch (error) {
        console.error("Unable to start portfolio music:", error);
        setPlaybackError("Music could not be started. Please try again or continue without sound.");
        return;
      }
    }

    setPlaybackError("");
    setIsFlaring(true);
    setIsExiting(true);
    exitTimer.current = window.setTimeout(onContinue, 1100);
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
      <div className={styles.content}>
        <motion.div
          className={styles.emblemEntrance}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <EmblemScene flaring={isFlaring} />
        </motion.div>

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
    </motion.div>
  );
};

export default Welcome;
