import { Variants } from 'framer-motion';

export const container: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.05,
    },
  },
  exit: { opacity: 0, y: -10 },
};

export const wifiDotVariants: Variants = {
  animate: {
    opacity: [0.4, 1, 0.4],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
};

export const wifiWave1Variants: Variants = {
  animate: {
    opacity: [0.2, 1, 0.2],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: "easeInOut",
      delay: 0.2,
    },
  },
};

export const wifiWave2Variants: Variants = {
  animate: {
    opacity: [0.1, 1, 0.1],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: "easeInOut",
      delay: 0.4,
    },
  },
};

export const wifiWave3Variants: Variants = {
  animate: {
    opacity: [0.05, 1, 0.05],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: "easeInOut",
      delay: 0.6,
    },
  },
};

export const wifiSlashVariants: Variants = {
  initial: { pathLength: 0 },
  animate: {
    pathLength: 1,
    transition: {
      duration: 0.5,
      ease: "easeOut",
    },
  },
};
