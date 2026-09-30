import type { MotionProps, Transition } from 'motion/react';

// Mirrors --ease-out / --duration in styles.css so CSS and Motion animations feel identical.
export const easeOut = [0.22, 1, 0.36, 1] as const;
export const transition: Transition = { duration: 0.22, ease: easeOut };
const quick: Transition = { duration: 0.12, ease: easeOut };

type Preset = Pick<MotionProps, 'initial' | 'animate' | 'exit' | 'transition'>;

export function slideFrom(side: 'left' | 'right'): Preset {
  const x = side === 'left' ? -12 : 16;
  return {
    initial: { opacity: 0, x },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x, transition: quick },
    transition,
  };
}

export const pop: Preset = {
  initial: { opacity: 0, scale: 0.96, y: 4 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, transition: quick },
  transition: quick,
};

export const rise: Preset = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 6, transition: quick },
  transition,
};

export const fade: Preset = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0, transition: quick },
  transition,
};

/*
 * A frosted panel over a scrim. An ancestor with opacity below 1 stops backdrop-filter
 * from seeing the page, so fading the whole overlay made the blur snap on at the end.
 * The scrim fades its colour instead, and only the panel itself fades, keeping its blur
 * live throughout.
 */
const reveal: Transition = { duration: 0.2, ease: easeOut };
const conceal: Transition = { duration: 0.14, ease: easeOut };

export const scrim: Preset = {
  initial: { backgroundColor: 'rgb(0 0 0 / 0)' },
  animate: { backgroundColor: 'rgb(0 0 0 / 0.16)' },
  exit: { backgroundColor: 'rgb(0 0 0 / 0)', transition: conceal },
  transition: reveal,
};

export const frostedPanel: Preset = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0, transition: conceal },
  transition: reveal,
};

export function staggered(index: number): Transition {
  return { ...transition, delay: Math.min(index, 16) * 0.022, layout: transition };
}
