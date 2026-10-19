'use client'
import Hero from "@/components/hero/Hero";
import Project from "@/components/project";
import styles from "./page.module.scss";
import { useEffect, useState } from "react";
import Decs from "@/components/descripction/Decs";
import SliderImages from "@/components/sliderImages/SliderImages";
import Contact from "@/components/contact/Contact";
import Preloader from "@/components/preloader/Preloader";
import { AnimatePresence } from "framer-motion";
import Welcome from "@/components/welcome/Welcome";

export default function Home() {
  const [hasEntered, setHasEntered] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!hasEntered) return;

    let locomotiveScroll;
    let isCancelled = false;

    import("locomotive-scroll").then(({ default: LocomotiveScroll }) => {
      if (!isCancelled) {
        locomotiveScroll = new LocomotiveScroll();
      }
    });

    const loadingTimer = window.setTimeout(() => {
      setIsLoading(false);
      document.body.style.cursor = "default";
      window.scrollTo(0, 0);
    }, 3000);

    return () => {
      isCancelled = true;
      window.clearTimeout(loadingTimer);
      locomotiveScroll?.destroy();
    };
  }, [hasEntered]);

  return (
    <>
      <main className={styles.main}>
        {!hasEntered && (
          <Welcome
            onContinue={() => {
              setIsLoading(true);
              setHasEntered(true);
            }}
          />
        )}
        {hasEntered && (
          <>
            <AnimatePresence mode="wait">
              {isLoading && <Preloader />}
            </AnimatePresence>
            <Hero />
            <Decs />
            <Project />
            <SliderImages />
            <Contact />
          </>
        )}
      </main>
    </>
  );
}
