"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import styles from "./audioGate.module.scss";

const AudioGate = ({ onContinue }) => {
  const audioRef = useRef(null);
  const [isOpen, setIsOpen] = useState(true);
  const [error, setError] = useState("");

  const continueWithMusic = async () => {
    const audio = audioRef.current;

    if (!audio) {
      setError("Music could not be loaded. You can continue without sound.");
      return;
    }

    audio.volume = 0.35;

    try {
      await audio.play();
      setIsOpen(false);
      onContinue();
    } catch (playError) {
      console.error("Unable to start portfolio music:", playError);
      setError("Music could not be started. Please try again or continue without sound.");
    }
  };

  const continueWithoutSound = () => {
    setIsOpen(false);
    onContinue();
  };

  return (
    <>
      <audio ref={audioRef} src="/audio/portfolio-music.mp3" loop preload="none" />
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className={styles.gate}
            role="dialog"
            aria-modal="true"
            aria-labelledby="audio-gate-title"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className={styles.content}>
              <div className={styles.emblem} aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <p className={styles.eyebrow}>SAI DAR · PORTFOLIO</p>
              <h1 id="audio-gate-title">Continue with music?</h1>
              <p className={styles.description}>
                A little sound for the journey.
              </p>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.soundButton}
                  onClick={continueWithMusic}
                >
                  Continue with music
                </button>
                <button
                  type="button"
                  className={styles.silentButton}
                  onClick={continueWithoutSound}
                >
                  Continue without sound
                </button>
              </div>
              {error && <p className={styles.error} role="status">{error}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default AudioGate;
