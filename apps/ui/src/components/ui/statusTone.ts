import { type CSSProperties } from 'react';

export type StatusTone = {
  background: string;
  hover: string;
  border: string;
  text: string;
};

export function statusToneStyle(tone: StatusTone): CSSProperties {
  return {
    '--status-bg': tone.background,
    '--status-hover': tone.hover,
    '--status-accent': tone.border,
    '--status-text': tone.text,
  } as CSSProperties;
}
