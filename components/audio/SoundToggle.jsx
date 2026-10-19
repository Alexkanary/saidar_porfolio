"use client";

import { useEffect, useState } from "react";
import { disableMusic, enableMusic } from "./audioManager";
import styles from "./soundToggle.module.scss";

const SoundToggle = ({ enabled, onChange }) => {
  const [error, setError] = useState("");

  useEffect(() => {
    const handleSoundState = (event) => {
      onChange(event.detail.enabled);
    };
    window.addEventListener("portfolio-sound-state", handleSoundState);
    return () => window.removeEventListener("portfolio-sound-state", handleSoundState);
  }, [onChange]);

  const toggleSound = async () => {
    setError("");
    if (enabled) {
      disableMusic();
      onChange(false);
      return;
    }

    try {
      await enableMusic();
      onChange(true);
    } catch (playError) {
      console.error("Unable to enable portfolio music:", playError);
      setError("Music could not be started. Please try again.");
    }
  };

  return (
    <div className={styles.container}>
      <button
        type="button"
        className={styles.toggle}
        onClick={toggleSound}
        aria-label={enabled ? "Turn sound off" : "Turn sound on"}
        aria-pressed={enabled}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 10v4h4l5 4V6l-5 4H4Z" />
          {enabled ? (
            <path d="M16 9.5a4 4 0 0 1 0 5m2.5-7.5a7.5 7.5 0 0 1 0 10" />
          ) : (
            <path d="m16 10 4 4m0-4-4 4" />
          )}
        </svg>
        <span>{enabled ? "Sound on" : "Sound off"}</span>
      </button>
      {error && <span className={styles.error} role="status">{error}</span>}
    </div>
  );
};

export default SoundToggle;
