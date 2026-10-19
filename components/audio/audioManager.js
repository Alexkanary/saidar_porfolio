import { welcomeConfig } from "@/components/welcome/welcomeConfig";

let audioInstance = null;
let isEnabled = false;
let fadeFrame = 0;

const notifySoundState = () => {
  window.dispatchEvent(new CustomEvent("portfolio-sound-state", {
    detail: { enabled: isEnabled },
  }));
};

const persistPreference = (enabled) => {
  try {
    window.localStorage.setItem(welcomeConfig.audio.preferenceKey, String(enabled));
  } catch (error) {
    console.error("Unable to save the sound preference:", error);
  }
};

const getAudio = () => {
  if (!audioInstance) {
    audioInstance = new Audio(welcomeConfig.audio.src);
    audioInstance.loop = true;
    audioInstance.preload = "none";
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }

  return audioInstance;
};

const fadeIn = (audio) => {
  if (fadeFrame) window.cancelAnimationFrame(fadeFrame);
  const startTime = performance.now();
  const duration = welcomeConfig.audio.fadeInDuration;
  const targetVolume = welcomeConfig.audio.targetVolume;

  const updateVolume = (now) => {
    const progress = Math.min((now - startTime) / duration, 1);
    audio.volume = targetVolume * progress;
    if (progress < 1 && isEnabled && !document.hidden) {
      fadeFrame = window.requestAnimationFrame(updateVolume);
    } else {
      fadeFrame = 0;
    }
  };

  fadeFrame = window.requestAnimationFrame(updateVolume);
};

const handleVisibilityChange = () => {
  if (!audioInstance) return;

  if (document.hidden) {
    if (fadeFrame) window.cancelAnimationFrame(fadeFrame);
    fadeFrame = 0;
    audioInstance.pause();
  } else if (isEnabled) {
    audioInstance.play().then(() => {
      if (audioInstance.volume < welcomeConfig.audio.targetVolume) fadeIn(audioInstance);
    }).catch((error) => {
      isEnabled = false;
      persistPreference(false);
      notifySoundState();
      console.error("Unable to resume portfolio music:", error);
    });
  }
};

export const enableMusic = async () => {
  const audio = getAudio();
  isEnabled = true;
  audio.volume = 0;

  try {
    await audio.play();
    persistPreference(true);
    notifySoundState();
    fadeIn(audio);
  } catch (error) {
    isEnabled = false;
    audio.pause();
    persistPreference(false);
    notifySoundState();
    throw error;
  }
};

export const disableMusic = () => {
  isEnabled = false;
  persistPreference(false);
  if (fadeFrame) window.cancelAnimationFrame(fadeFrame);
  fadeFrame = 0;
  audioInstance?.pause();
  notifySoundState();
};

export const getStoredMusicPreference = () => {
  try {
    return window.localStorage.getItem(welcomeConfig.audio.preferenceKey) === "true";
  } catch (error) {
    console.error("Unable to read the sound preference:", error);
    return false;
  }
};
