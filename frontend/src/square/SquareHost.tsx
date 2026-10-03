/**
 * SquareHost: the Square's parent-side shell.
 * frontend/src/square/SquareHost.tsx
 *
 * The decorative town runs in an opaque-origin sandboxed iframe
 * (<iframe sandbox="allow-scripts"> — no allow-same-origin). The ONLY
 * thing the parent accepts from it is one navigation intent, validated
 * by EXACT shape AND by source frame:
 *
 *   { type: "openline:navigate", intent: "enter-workshop" }
 *
 * Anything else — wrong shape, extra fields, wrong intent, or a message
 * from any other source — is ignored. The parent never writes into the
 * frame, never passes callbacks or objects, and never reads the frame's
 * document (it can't: opaque origin). The mirror of this check lives in
 * src/town/protocol.ts, duplicated deliberately — no shared module
 * crosses the frame boundary.
 *
 * This component mounts with ZERO backend contact: no subscriptions, no
 * snapshot gate. Entering the workshop mounts the proven custody
 * visualization (VizView), which owns its own read-only replay path.
 */
import { useEffect, useRef, useState } from "react";
import { VizView } from "../viz/VizView";
import { isNavigateMessage } from "./navigate";
import "./square.css";

export function SquareHost() {
  const [place, setPlace] = useState<"square" | "workshop">("square");
  const [fading, setFading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      // Bind to the frame element, not the origin: the child's origin is
      // opaque ("null"), so origin checks are meaningless. Only messages
      // from OUR iframe's window are even considered.
      const frame = iframeRef.current;
      if (!frame || ev.source !== frame.contentWindow) return;
      if (!isNavigateMessage(ev.data)) return;
      // Exact message shape is necessary but not sufficient: a replaced or
      // compromised child could send it from script. Only honor the intent
      // while the browser reports a transient user activation propagated
      // from a deliberate click/tap in the child frame.
      if (!navigator.userActivation?.isActive) return;
      setFading(true);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setPlace("workshop"), 450);
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  const exit = () => {
    setPlace("square");
    setFading(false);
  };

  if (place === "workshop") {
    return (
      <div className="square-host">
        <VizView onExit={exit} autoRunDemo exitLabel="Back to the Square" />
      </div>
    );
  }

  return (
    <div className="square-host">
      <iframe
        ref={iframeRef}
        // allow-scripts ONLY: no same-origin (opaque origin), no top
        // navigation, no forms, no popups, no pointer lock.
        sandbox="allow-scripts"
        src={`${import.meta.env.BASE_URL}town.html`}
        title="OpenLine World Square"
        className="square-frame"
      />
      <div className={`square-fade${fading ? " on" : ""}`}>
        {fading && <span>The workshop — where every consequential action is approved, or stopped.</span>}
      </div>
    </div>
  );
}
