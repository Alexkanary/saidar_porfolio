"use client";
import Image from "next/image";
import Style from "./heroStyle.module.scss";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import BackgroundParticles from "./BackgroundParticles";

const Hero = () => {
  const firstText = useRef(null);
  const seconfText = useRef(null);
  const slider = useRef(null);
  let xPercent = 0;
  let direction = 1;

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    requestAnimationFrame(animtion);

    // scrolling adjusment for the slider
    gsap.to(slider.current, {
      scrollTrigger: {
        trigger: document.documentElement,
        start: 0,
        end: window.innerHeight,
        scrub: 0.25,
        onUpdate: (e) => {
          direction = e.direction * -1;
        },
      },
      x: "-300px",
    });
  }, []);

  const animtion = () => {
    if (xPercent <= -100) {
      xPercent = 0;
    }
    if (xPercent > 0) {
      xPercent = -100;
    }
    gsap.set(firstText.current, { xPercent: xPercent });
    gsap.set(seconfText.current, { xPercent: xPercent });
    xPercent += 0.1 * direction;
    requestAnimationFrame(animtion);
  };

  return (
    <main className={Style.mainHero}>
      <Image
        src="/images/background-front-clean.jpg"
        fill
        priority
        quality={100}
        sizes="100vw"
        alt="SaiDar"
        className={Style.backgroundImage}
      />
      <BackgroundParticles />
      <div className={Style.slideContainer}>
        <div ref={slider} className={Style.slider}>
          <p ref={firstText}>Lukar-Ghost-Node</p>
          <p ref={seconfText}>Lukar-Ghost-Node</p>
        </div>
      </div>

    </main>
  );
};

export default Hero;
