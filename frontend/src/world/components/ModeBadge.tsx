/**
 * ModeBadge — frontend/src/world/components/ModeBadge.tsx
 *
 * Every participant/agent carries a mode badge. Icon + text + shape — never
 * color alone:
 *   LIVE — connected runtime       · filled-circle icon · pill shape
 *   DETERMINISTIC AUTOMATION      · gear icon          · hexagon shape
 *   SCRIPTED — tutorial playback   · play-chevron icon  · sharp rectangle
 *   YOU — manual                   · spark icon         · dashed rounded square
 *
 * Rendered only when the mode is known: the backend reports it verbatim,
 * or the parent has local ground truth (the guided tour is scripted
 * playback; the visitor's own figure moves by their own taps). An unknown
 * mode renders nothing — never a guess.
 *
 * The "manual" text reads "YOU — manual" for the viewer's own figure —
 * their taps are the only driver. For other participants the backend
 * reports "manual" as the join default (human-driven browser sessions);
 * there the label reads "MANUAL — human-driven" via the label prop, so
 * the badge never claims someone else's figure is you. Shape and icon
 * stay identical; the text stays honest.
 */
import type { ActivityMode } from "../api";

const MODE_META: Record<ActivityMode, { icon: string; text: string; cls: string }> = {
  live: { icon: "●", text: "LIVE — connected runtime", cls: "mode-live" },
  automation: { icon: "⚙", text: "DETERMINISTIC AUTOMATION", cls: "mode-automation" },
  scripted: { icon: "▸", text: "SCRIPTED — tutorial playback", cls: "mode-scripted" },
  manual: { icon: "✦", text: "YOU — manual", cls: "mode-manual" },
};

export function ModeBadge({ mode, label }: { mode: ActivityMode; label?: string }) {
  const m = MODE_META[mode];
  const text = label ?? m.text;
  return (
    <span className={`mode-badge ${m.cls}`} title={text} aria-label={`Mode: ${text}`} role="img">
      <span className="mode-badge-icon" aria-hidden="true">{m.icon}</span>
      <span className="mode-badge-text">{text}</span>
    </span>
  );
}
