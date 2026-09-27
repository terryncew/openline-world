import { STATION_FOCUS, type Focus } from "../scene/Room";

export interface Beat {
  /** demo step index (1-based) this beat advances to */
  step: number;
  /** plain-language caption shown while the beat holds */
  caption: string;
  /** pause after the step's real outcome lands, ms (normal pace) */
  holdMs: number;
  focus: Focus | { helper: string };
}

const HELPER_FOCUS: Record<string, Focus> = {
  wren: { pos: [-3.2, 4.2, 8], target: [-3.2, 0.8, 2.2] },
  juniper: { pos: [3.2, 4.2, 8], target: [3.2, 0.8, 2.2] },
};

export function resolveFocus(f: Beat["focus"], fallback: Focus): Focus {
  if ("helper" in f) return HELPER_FOCUS[f.helper] ?? fallback;
  return f;
}

export const TOUR_TITLE = "The worker can change. The owner's authority does not.";

export const TOUR_BEATS: Beat[] = [
  {
    step: 1,
    caption: "Your AI can do real work for you. That means it needs real authority.",
    holdMs: 3500,
    focus: STATION_FOCUS.workbench,
  },
  {
    step: 2,
    caption: "Wren can do what the owner allowed.",
    holdMs: 3500,
    focus: STATION_FOCUS.review,
  },
  {
    step: 3,
    caption: "Ordinary work, still inside the rules.",
    holdMs: 3000,
    focus: STATION_FOCUS.workbench,
  },
  {
    step: 4,
    caption: "Wren reaches outside its mandate. The action stops here.",
    holdMs: 6000,
    focus: STATION_FOCUS.gate,
  },
  {
    step: 5,
    caption: "Wren says it is done. Only the receiver's signed receipt counts as accepted.",
    holdMs: 3000,
    focus: STATION_FOCUS.workbench,
  },
  {
    step: 6,
    caption: "The owner revokes Wren. Its old authority no longer works.",
    holdMs: 5500,
    // wide shot: Wren visibly leaves left while the rules board stays right
    focus: { pos: [0, 8, 14.5], target: [-1, 0.8, 3.2] },
  },
  {
    step: 7,
    caption: "Wren tries once more. Stopped — the mandate is gone.",
    holdMs: 4000,
    focus: STATION_FOCUS.review,
  },
  {
    step: 8,
    caption: "Wren goes offline. The owner's rules and records stay exactly where they were. Juniper is authorized and continues the work.",
    holdMs: 6000,
    focus: STATION_FOCUS.board,
  },
  {
    step: 9,
    caption: "Different worker. Same owner. Same rules.",
    holdMs: 4500,
    focus: STATION_FOCUS.review,
  },
];
