# Character-act binding (Track 2 rig, Track 3 spec)

The figures act from real backend workflow state only. The binding spec is
Track 3's `choreography.ts` (`describeStage`): it stages WHERE each party
stands and where the work-item token sits. Track 2 maps that stage +
participant role to a `FigureBehavior`; the `ActRig` performs HOW. The rig
never decides what to do — `setBehavior()` is called from outside, from
real state, and the rig only moves.

## The rig (`actRig.ts`)

`ActRig` is one controller per figure. It owns locomotion (world position +
heading + gait) and a damped pose (torso / head / arms / legs).

Primitives the rig performs:

- **Walking with weight** — two gaits. `stride` (Wren's stilt legs, the
  worker's long legs): alternating hip swings, torso bob at twice the stride
  rate, lateral weight shift and roll, forward lean with speed, arms
  counter-swinging. `waddle` (Juniper's dome, the counterpart's barrel):
  side-to-side rock, small bob, yaw wobble. Turns pivot in place with a
  small dip and a reduced pace — no sliding, no snapping.
- **Reaching** — shoulder-pivot arms extend forward (presenting across a
  counter, placing onto the tray, releasing toward the cabinet).
- **Carrying** — the work-item token rides at the holder's side (Track 3's
  `AgreementToken`, reparented to follow the figure — no second object).
- **Looking** — the head yaws/pitches toward a world gaze target, clamped.
- **Reacting** — layered by each figure (Wren's pride hop / sheepish droop)
  on top of the rig's pose, never instead of it.
- **Idle life** — breathing, blinking, weight shifts, glances. Decorative
  only; never implies productive work.

A behavior is an **entry plan** (go / face / take / place / release / hold /
step-back steps) followed by a **sustain loop** (the pose held while the
workflow state persists). Reduced motion snaps to final poses; disconnected
(frozen) holds still.

## The mapping (`visitorAct` in WorldScene.tsx, from `describeStage`)

| Plan stage (Track 3) | Figure (by role) | Behavior | What the audience sees |
|---|---|---|---|
| `proposal` | worker (proposer) | `proposing` | walks to the receiving counter, presents the work across it, one confirming nod |
| `proposal` | counterpart | `attending` | walks behind their booth, leans in, examines — calm, no verdict implied |
| `production` | worker | `working` | at the bench work end: leans over the papers, right hand writes, left hand tidies the sheet |
| `awaiting-review` | worker | `submitting` | walks bench → review end, sets the work on the receiving tray (built into the ReviewStation, Track 3), steps back — then waits |
| `verdict-accepted` | worker | `accepted` | at the tray, both arms extend in release, steps back, hands open — calm. The object reaches the cabinet via the staged token + record flight |
| `verdict-refused` | worker | `refused` | calmly takes the work back at the tray, walks home. No shake, no red flash, no drama |
| `discovery` / no plan, `worker_state`=`running`, open listing | worker | `discovering` | walks to the exchange board, leans in, head scans the pinned slips |
| no plan, `worker_state`=`awaiting_approval` | — | `awaiting` | still at home, calm |
| no plan, `worker_state`=`paused`/`held_standing`/`stopped_revoked` | — | `still` | holds exactly; no drift |
| anything else / absent | — | `idle` | decorative life only |

**Recorded** is not a figure behavior. The record slip flies from the review
end to the cabinet (`RecordFlight`) only when the real shared-receipt count
increases. The cabinet's folders already count it; the flight is that same
record's visible arrival.

Interpretation note: the task's "Accepted (release object to cabinet/
receiver)" is staged as release-at-the-tray + step-back. Track 3's binding
places the token at the tray on accept and files it to the cabinet; the
figure carrying a second object to the cabinet would double the work. The
visible cabinet arrival is the token's journey plus the record flight.

## Honesty rules enforced by construction

- A figure acts only while the backend state that the act depicts holds.
  When the state ends, the entry plan for the next behavior runs.
- The workbench papers appear only while an agreement is `agreed`
  (`someoneWorking`) — never as decoration.
- The record flight fires only on a real receipt-count increase — mount
  sets the baseline, never a flight.
- Refusal and failure are calm. Reduced motion is respected everywhere.
- Idle decoration never implies productive work.

## What the rig can't do (yet)

- Two-handed manipulation beyond cradle/extend (single-segment arms, no
  elbows or fingers).
- Sitting, climbing, or navigating around furniture (straight-line walks
  between staged anchor points).
- Facial expression beyond blink and gaze (felt-and-wood miniatures).
- Hosts (Wren/Juniper) are not bound to workflow states in this pass —
  they keep their established idle personalities and outcome reactions.
