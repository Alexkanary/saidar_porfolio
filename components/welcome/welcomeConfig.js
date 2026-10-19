export const welcomeConfig = {
  effect: {
    // Simulation resolution: 256px keeps fluid motion smooth without a full-screen buffer.
    bufferSize: 256,
    // Cursor response spring strength; lower values give the light more inertia.
    cursorLag: 0.08,
    // Amount of trail retained per frame; 0.968 produces a slow smoky fade.
    trailDissipation: 0.968,
    // FBM contribution to the display threshold for torn, organic glow edges.
    edgeRaggedness: 0.18,
    // Glow remains detailed to this multiple of the logo radius.
    maskSize: 1.8,
    // Maximum trail strength away from the logo, including the text block.
    maxGlowOutsideLogo: 0.45,
    // Autonomous light brightness after the cursor has been idle.
    idleIntensity: 0.3,
    // Base gaussian splat radius in the low-resolution simulation buffer.
    trailRadius: 0.075,
    // Full Y-axis rotation periods (seconds), ordered outer to inner ring.
    ringRotationPeriods: [14, 11, 8],
    diamondRotationPeriod: 12,
  },
  audio: {
    src: "/audio/portfolio-music.mp3",
    targetVolume: 0.5,
    fadeInDuration: 2000,
    preferenceKey: "sai-dar-portfolio-sound-enabled",
  },
  copy: {
    label: "SAI DAR · PORTFOLIO",
    heading: "Continue with music?",
    description: "A little sound for the journey.",
    primaryAction: "CONTINUE WITH MUSIC",
    secondaryAction: "Continue without sound",
  },
  colors: {
    background: "#0d111c",
    center: "#151b2b",
    edge: "#05070d",
    text: "#f2f4f8",
    muted: "#9aa3b5",
    deepBlue: "#1b3a6b",
    blue: "#2f6fb5",
    paleBlue: "#a8d4ff",
    silver: "#d5deef",
  },
};
