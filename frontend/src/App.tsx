import { useCallback, useEffect, useRef, useState } from "react";
import { OVERVIEW, STATION_FOCUS, WorkshopScene, type Focus, type Station } from "./scene/Room";
import { useWorkshop } from "./hooks";
import {
  ConnectionBanner, EventFeed, HelperPanel, ListView, OnboardForm, Onboarding, ReceiptsPanel, ReviewPanel,
} from "./components/Panels";
import { TOUR_BEATS, resolveFocus } from "./tour/beats";
import { useTour } from "./tour/useTour";
import { TourOverlay } from "./tour/TourOverlay";
import { WhatChanged } from "./changed/WhatChanged";
import { SharedWorld } from "./world/SharedWorld";
import { VizView } from "./viz/VizView";
import { AuthorityDemoView } from "./viz/AuthorityDemoView";
import { SquareHost } from "./square/SquareHost";
import { HeroView } from "./hero/HeroView";
import { PromptInjectionView } from "./scenarios/PromptInjectionView";
import { BountyView } from "./bounty/BountyView";
import "./styles.css";

const HELPER_FOCUS: Record<string, Focus> = {
  wren: { pos: [-3.2, 4.2, 8], target: [-3.2, 0.8, 2.2] },
  juniper: { pos: [3.2, 4.2, 8], target: [3.2, 0.8, 2.2] },
};

// demo step index -> camera focus after the step completes (explore mode)
const STORY_FOCUS: (Focus | { helper: string })[] = [
  STATION_FOCUS.workbench,
  STATION_FOCUS.review,
  STATION_FOCUS.workbench,
  STATION_FOCUS.review,
  { helper: "wren" },
  { helper: "wren" },
  STATION_FOCUS.review,
  { helper: "juniper" },
  STATION_FOCUS.review,
];

function focusFor(step: number, fallback: Focus): Focus {
  const f = STORY_FOCUS[step - 1];
  if (!f) return fallback;
  if ("helper" in f) return HELPER_FOCUS[f.helper] ?? fallback;
  return f;
}

type View = "watch" | "explore" | "changed" | "world" | "viz" | "authority" | "hero" | "square";

export default function App() {
  const [view, setView] = useState<View>(() => {
    const v = new URLSearchParams(window.location.search).get("view");
    // The Square is the home screen of the world layer; every existing
    // view stays reachable by its explicit ?view= param.
    return v === "viz" || v === "watch" || v === "explore" || v === "changed" || v === "world" || v === "authority" || v === "hero"
      ? v
      : "square";
  });

  if (new URLSearchParams(window.location.search).get("scenario") === "prompt-injection") return <PromptInjectionView />;
  if (new URLSearchParams(window.location.search).get("scenario") === "bounty") return <BountyView />;

  if (view === "hero") return <HeroView />;

  // The Square mounts with zero backend contact: no subscriptions, no
  // snapshot gate. It lives in an opaque-origin sandboxed iframe whose
  // only channel to this page is a validated navigation intent.
  if (view === "square") {
    return (
      <div className="app">
        <SquareHost />
      </div>
    );
  }

  return <BackendApp view={view} setView={setView} />;
}

function BackendApp({ view, setView }: { view: View; setView: (v: View) => void }) {
  const w = useWorkshop();
  const [walk, setWalk] = useState(false);
  const [listView, setListView] = useState(false);
  const [showRecords, setShowRecords] = useState(false);
  const [showOnboard, setShowOnboard] = useState(false);
  const [selectedHelper, setSelectedHelper] = useState<string | null>(null);
  const [focus, setFocus] = useState<Focus>(OVERVIEW);
  const [onboarded, setOnboarded] = useState(() => localStorage.getItem("workshop-onboarded") === "1");
  const [fixtureNote, setFixtureNote] = useState<string | null>(null);

  const snap = w.snap;
  const demoStep = snap?.demo.step ?? 0;

  const advance = useCallback(async () => {
    await w.advance();
  }, [w]);
  const reset = useCallback(async () => {
    await w.reset();
  }, [w]);
  const refresh = useCallback(() => {
    w.refresh();
  }, [w]);

  const tour = useTour({ step: demoStep, advance, reset, refresh });
  const autostarted = useRef(false);

  const selectStation = useCallback((s: Station) => {
    setFocus(STATION_FOCUS[s]);
    if (s === "records") setShowRecords(true);
  }, []);

  const selectHelper = useCallback((id: string) => {
    setSelectedHelper(id);
    setFocus(HELPER_FOCUS[id] ?? OVERVIEW);
  }, []);

  // explore mode: follow the story with the camera after each demo step
  useEffect(() => {
    if (view !== "explore") return;
    setFocus((f) => focusFor(demoStep, f));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoStep, view]);

  // watch mode: camera follows the tour beats
  useEffect(() => {
    if (view !== "watch") return;
    setFocus((f) => resolveFocus(TOUR_BEATS[Math.min(tour.beatIndex, TOUR_BEATS.length - 1)].focus, f));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, tour.beatIndex]);

  // watch mode: start the tour automatically (StrictMode-safe)
  useEffect(() => {
    if (view !== "watch" || !snap || autostarted.current) return;
    autostarted.current = true;
    const t = setTimeout(() => {
      tour.play();
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, !!snap]);

  const sendFixture = useCallback(async () => {
    setFixtureNote(null);
    try {
      const res = await fetch(`/api/adapter/hooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Read", session_id: "fixture-1" }),
      });
      const data = await res.json();
      setFixtureNote(res.ok ? `Fixture accepted as activity (${data.event_id.slice(0, 8)}…). No receipt minted.` : `Rejected: ${data.error}`);
    } catch (e) {
      setFixtureNote(`Could not reach backend: ${String(e)}`);
    }
  }, []);

  if (!snap) {
    return (
      <div className="boot">
        <p>Starting the workshop…</p>
        {w.error && <p className="err">{w.error}</p>}
      </div>
    );
  }

  const helper = snap.helpers.find((h) => h.helper_id === selectedHelper) ?? null;

  if (view === "changed") {
    return (
      <div className="app">
        <WhatChanged
          onExit={() => {
            setView("explore");
            refresh();
          }}
        />
      </div>
    );
  }

  if (view === "world") {
    return (
      <div className="app">
        <SharedWorld
          onExit={() => {
            setView("explore");
            refresh();
          }}
        />
      </div>
    );
  }

  if (view === "viz") {
    return (
      <div className="app">
        <VizView
          onExit={() => {
            setView("explore");
            refresh();
          }}
        />
      </div>
    );
  }

  if (view === "authority") {
    return (
      <div className="app">
        <AuthorityDemoView
          onExit={() => {
            setView("explore");
            refresh();
          }}
        />
      </div>
    );
  }

  if (view === "watch") {
    return (
      <div className="app watch">
        <main className="watch-stage">
          <WorkshopScene
            helpers={snap.helpers}
            review={snap.review}
            receiptCount={snap.receipts}
            focus={focus}
            walk={false}
            tour
            onSelectHelper={selectHelper}
            onSelectStation={selectStation}
            onFloorTap={() => {}}
          />
          <TourOverlay
            phase={tour.phase}
            beatIndex={tour.beatIndex}
            paused={tour.paused}
            onTogglePause={() => tour.setPaused(!tour.paused)}
            onReplay={() => tour.play()}
            onEvidence={() => setShowRecords(true)}
            onExplore={() => setView("explore")}
          />
        </main>
        {showRecords && <ReceiptsPanel onClose={() => setShowRecords(false)} />}
      </div>
    );
  }

  return (
    <div className="app">
      {!onboarded && (
        <Onboarding
          onStart={() => {
            localStorage.setItem("workshop-onboarded", "1");
            setOnboarded(true);
            advance();
          }}
          onSkip={() => {
            localStorage.setItem("workshop-onboarded", "1");
            setOnboarded(true);
          }}
        />
      )}

      <header className="topbar">
        <div className="brand">
          <strong>OpenLine Workshop</strong>
          <span className="tagline">Change your AI. Keep your rules.</span>
        </div>
        <div className="controls">
          <button onClick={() => setView("watch")}>Watch the tour</button>
          <button onClick={() => setView("viz")}>Visualize</button>
          <button onClick={() => setView("world")}>World</button>
          <a href="/?scenario=bounty">Local bounty</a>
          <button onClick={() => setView("changed")}>What changed?</button>
          <button onClick={() => w.setMode(snap.mode === "demo" ? "connected" : "demo")}>
            Mode: {snap.mode === "demo" ? "Demo" : "Connected"}
          </button>
          {!snap.demo.finished && snap.mode === "demo" && (
            <button className="primary" onClick={advance}>
              Next: {snap.demo.next ?? "finish"} →
            </button>
          )}
          {snap.demo.finished && <span className="done">Story complete</span>}
          <button onClick={() => w.reset()}>Restart</button>
          <button onClick={() => setWalk(!walk)}>{walk ? "Overlook" : "Walk"}</button>
          <button onClick={() => setListView(!listView)}>{listView ? "3D view" : "Text view"}</button>
          <button onClick={() => setShowRecords(true)}>Records ({snap.receipts})</button>
        </div>
      </header>

      <ConnectionBanner snap={snap} />
      {w.error && <div className="errbar">{w.error}</div>}

      {snap.mode === "connected" && (
        <div className="fixturebar">
          <span>Wire Claude Code hooks to <code>POST 127.0.0.1:8471/api/adapter/hooks</code> — hook events become activity only, never receipts.</span>
          <button onClick={sendFixture}>Send test hook</button>
          {fixtureNote && <span className="note">{fixtureNote}</span>}
        </div>
      )}

      <main className="stage">
        {listView ? (
          <ListView snap={snap} events={w.events} />
        ) : (
          <WorkshopScene
            helpers={snap.helpers}
            review={snap.review}
            receiptCount={snap.receipts}
            focus={focus}
            walk={walk}
            onSelectHelper={selectHelper}
            onSelectStation={selectStation}
            onFloorTap={() => {}}
          />
        )}

        <aside className="side">
          <div className="taskcard">
            <div className="panel-title">Current task</div>
            <p>{snap.task.title}</p>
            <p className="fine">Helpers: {snap.helpers.map((h) => `${h.helper_id}${h.active ? "" : " (revoked)"}`).join(", ")}</p>
          </div>
          <ReviewPanel review={snap.review} />
          <HelperPanel
            helper={helper}
            onPropose={(action) => selectedHelper && w.propose(selectedHelper, action)}
            onRevoke={() => selectedHelper && w.revoke(selectedHelper)}
          />
          <button className="ghost" onClick={() => setShowOnboard(!showOnboard)}>
            {showOnboard ? "Hide onboarding" : "Onboard a helper"}
          </button>
          {showOnboard && (
            <OnboardForm
              onOnboard={(id, scopes) => {
                w.onboard(id, scopes);
                setShowOnboard(false);
              }}
            />
          )}
          <EventFeed events={w.events} />
        </aside>
      </main>

      {showRecords && <ReceiptsPanel onClose={() => setShowRecords(false)} />}

      <footer className="foot">
        <span>{snap.notice}</span>
        {walk && <span className="hint">Walk: WASD / arrows on desktop, tap the floor on touch.</span>}
      </footer>
    </div>
  );
}
