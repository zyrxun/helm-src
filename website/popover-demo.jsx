/* Helm — Hero popover demo
 *
 * Auto-playing state machine that simulates a user opening Helm,
 * launching "Mornings", seeing the running state, and seeing the
 * confirmation. Loops forever; respects prefers-reduced-motion by
 * sitting on the idle state.
 *
 * Stages:
 *   idle      — popover open, cursor offscreen, all rows quiet
 *   approach  — cursor moves to "Mornings" row
 *   hover     — row gets gold hover border, cursor sits
 *   click     — pulse ring, status flips to "Launching"
 *   running   — Mornings row: gold border, green spinning wheel button
 *               other rows dim to 0.38
 *   ready     — toast "Your stack is ready.", everything resets
 *
 * Stage can be forced via props.forceStage (used by Tweaks).
 */

const DEMO_WORKFLOWS = [
  { id: "mornings",  name: "Mornings",  summary: "Mail · Calendar · Notion · Slack",         hotkey: "⌃⌥1" },
  { id: "deepwork",  name: "Deep work", summary: "VS Code · Linear · Spotify · Do Not Disturb", hotkey: "⌃⌥2" },
  { id: "oncall",    name: "On-call",   summary: "Datadog · PagerDuty · Terminal · Zoom",     hotkey: "⌃⌥3" },
];

const STAGE_SEQUENCE = [
  { name: "idle",     duration: 1400 },
  { name: "approach", duration: 900  },
  { name: "hover",    duration: 600  },
  { name: "click",    duration: 380  },
  { name: "running",  duration: 3200 },
  { name: "ready",    duration: 1800 },
];

function HeroDemo({ forceStage = "auto" }) {
  const [stageIdx, setStageIdx] = React.useState(0);
  const stage = forceStage === "auto" ? STAGE_SEQUENCE[stageIdx].name : forceStage;

  // Auto-advance only when not forced
  React.useEffect(() => {
    if (forceStage !== "auto") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const t = setTimeout(() => {
      setStageIdx((i) => (i + 1) % STAGE_SEQUENCE.length);
    }, STAGE_SEQUENCE[stageIdx].duration);
    return () => clearTimeout(t);
  }, [stageIdx, forceStage]);

  const isHovering = stage === "approach" || stage === "hover" || stage === "click";
  const isRunning  = stage === "running" || stage === "click";
  const showToast  = stage === "ready";

  // Cursor placement — coordinates are relative to the bridge desktop.
  // We have three positions: hidden (offscreen), approaching, and on the row.
  const cursorPos =
    stage === "idle"     ? { top: 320, left: 40,  visible: false } :
    stage === "approach" ? { top: 138, left: 240, visible: true  } :
    stage === "hover"    ? { top: 132, left: 296, visible: true  } :
    stage === "click"    ? { top: 132, left: 296, visible: true, clicking: true } :
    stage === "running"  ? { top: 380, left: 60,  visible: false } :
                           { top: 380, left: 60,  visible: false };

  return (
    <div className="bridge">
      <div className="bridge-frame">
        {/* macOS menubar with the Helm icon lit when popover is open */}
        <div className="bridge-menubar">
          <div className="bridge-menubar-left">
            <span className="app">Helm</span>
            <span>File</span>
            <span>Edit</span>
            <span>View</span>
            <span>Window</span>
            <span>Help</span>
          </div>
          <div className="bridge-menubar-right">
            <span className={`bridge-helm-icon lit`}>
              <HelmWheel
                size={18}
                state={isRunning ? "running" : "idle"}
                spin={isRunning ? "fast" : "slow"}
              />
            </span>
            <span>100%</span>
            <span>Tue 9:14 AM</span>
          </div>
        </div>

        {/* Desktop area with the popover */}
        <div className="bridge-desktop">
          <div className="bridge-caption">
            <div className="bridge-caption-line gold">Menu bar</div>
            <div className="bridge-caption-line">Click → stack launches</div>
          </div>

          {/* Animated cursor */}
          <div
            className={`demo-cursor ${cursorPos.visible ? "is-visible" : ""} ${cursorPos.clicking ? "is-clicking" : ""}`}
            style={{ top: cursorPos.top, left: cursorPos.left }}
          >
            <Glyph name="cursor" size={16} />
          </div>

          {/* Popover */}
          <div className="demo-popover-wrap">
            <div className="demo-popover-arrow" />
            <div className="demo-popover">
              <div className="demo-pop-header">
                <HelmWheel size={16} state={isRunning ? "running" : "idle"} spin={isRunning ? "fast" : "slow"} />
                <span className="wordmark">Helm</span>
                <span className={`demo-pop-status ${isRunning ? "is-running" : ""}`}>
                  <span className="dot" />
                  {isRunning ? "Launching" : "Ready"}
                </span>
              </div>

              <div className="demo-pop-section-label">Workflows</div>

              <div className="demo-wf-list">
                {DEMO_WORKFLOWS.map((wf) => {
                  const active = wf.id === "mornings";
                  const cls = [
                    "demo-wf-row",
                    active && isHovering && !isRunning ? "is-hovered" : "",
                    active && isRunning ? "is-running" : "",
                    !active && isRunning ? "is-dim" : "",
                  ].filter(Boolean).join(" ");
                  return (
                    <div key={wf.id} className={cls}>
                      <div className={`demo-run-btn ${active && isRunning ? "is-running" : ""}`}>
                        {active && isRunning ? (
                          <HelmWheel size={18} state="running" spin="fast" />
                        ) : (
                          <span className="play-tri" />
                        )}
                      </div>
                      <div className="demo-wf-text">
                        <div className="demo-wf-name">{wf.name}</div>
                        <div className={`demo-wf-summary ${active && isRunning ? "is-running" : ""}`}>
                          {active && isRunning ? "Launching 4 apps · 2 tabs" : wf.summary}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="demo-pop-footer">
                <button className="demo-pop-footer-link">Settings</button>
                <button className="demo-pop-footer-link gold">+ New workflow</button>
              </div>
            </div>
          </div>

          {/* Toast */}
          {showToast && (
            <div className="demo-toast">Your stack is ready.</div>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { HeroDemo, DEMO_WORKFLOWS });
