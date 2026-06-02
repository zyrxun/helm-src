/* Helm — Landing page sections */

const { useState, useEffect, useRef } = React;

/* ============================================================
   Reveal-on-scroll wrapper.
   - If element is already in the viewport at mount, show after delay.
   - Otherwise observe with IntersectionObserver and fire once.
   ============================================================ */
function Reveal({ children, delay = 0, className = "" }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    // If already in view at mount, reveal right away (with stagger).
    const rect = ref.current.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    if (rect.top < vh * 0.9) {
      const t = setTimeout(() => setShown(true), delay + 60);
      return () => clearTimeout(t);
    }
    if (!("IntersectionObserver" in window)) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          setTimeout(() => setShown(true), delay);
          io.disconnect();
        }
      });
    }, { threshold: 0, rootMargin: "0px 0px -10% 0px" });
    io.observe(ref.current);
    // Safety: if IO never fires after several seconds, show anyway.
    const safety = setTimeout(() => setShown(true), 4000);
    return () => { io.disconnect(); clearTimeout(safety); };
  }, [delay]);
  return (
    <div ref={ref} className={`reveal ${shown ? "is-in" : ""} ${className}`.trim()}>
      {children}
    </div>);

}

/* ============================================================
   Nav
   ============================================================ */
function Nav() {
  return (
    <nav className="container nav">
      <a href="#" className="nav-mark">
        <HelmWheel size={22} spin="slow" />
        <span className="nav-wordmark">Helm</span>
      </a>
      <div className="nav-links">
        <a className="nav-link" href="#anatomy">How it works</a>
        <a className="nav-link" href="#workflows">Workflows</a>
        <a className="nav-link" href="#features">Features</a>
        <a className="nav-link" href="#faq">FAQ</a>
      </div>
      <div className="nav-right">
        <span className="nav-version">v0.4.2 · macOS</span>
        <a className="btn btn-primary" href="#download">
          <Glyph name="download" size={14} />
          Download for Mac
        </a>
      </div>
    </nav>);

}

/* ============================================================
   Hero
   ============================================================ */
function Hero({ headline, sub, demoStage }) {
  // Headline rendered with the final word gold per brand
  // ("Take the wheel." — "wheel." in Sovereign Gold)
  const parts = (() => {
    const m = headline.match(/^(.*?)(\S+\.?)\s*$/);
    if (!m) return [headline, ""];
    return [m[1], m[2]];
  })();

  return (
    <section className="container hero">
      <div className="hero-left" style={{ textAlign: "left" }}>
        <div className="eyebrow">macOS menu bar orchestrator</div>
        <h1 className="hero-h1">
          {parts[0]}<span className="accent">{parts[1]}</span>
        </h1>
        <p className="hero-sub">{sub}</p>
        <div className="hero-ctas">
          <a className="btn btn-primary btn-lg" href="#download">
            <Glyph name="download" size={16} />
            Download for macOS
          </a>
          <a className="btn btn-ghost btn-lg" href="#workflows">
            See workflows
            <Glyph name="arrow-right" size={14} />
          </a>
        </div>
        <div className="hero-spec">
          <span>macOS 13+</span>
          <span>Apple Silicon &amp; Intel</span>
          <span>4.2 MB</span>
          <span>Free</span>
        </div>
      </div>
      <HeroDemo forceStage={demoStage} />
    </section>);

}

/* ============================================================
   Anatomy — How it works (3 numbered steps)
   ============================================================ */
function Anatomy() {
  return (
    <section className="container section" id="anatomy">
      <Reveal>
        <div className="section-head">
          <div />
          <h2 className="section-title">Three steps. No more, no less.</h2>
        </div>
      </Reveal>

      <div className="steps">
          {[0, 1, 2].map((i) => (
            <Reveal key={i} delay={i * 100} className="step-reveal">
              {i === 0 && (
                <div className="step">
                  <h3 className="step-title">Define a workflow.</h3>
                  <p className="step-body">
                    Name a stack. Add apps, browser tabs, files, and a focus mode. Configure once.
                  </p>
                  <div className="step-visual">
                    <pre className="config-snippet" style={{ margin: 0 }}>
{`{`}
{`  `}<span className="k">"name"</span><span className="pun">: </span><span className="s">"Mornings"</span><span className="pun">,</span>
{`  `}<span className="k">"hotkey"</span><span className="pun">: </span><span className="s">"⌃⌥1"</span><span className="pun">,</span>
{`  `}<span className="k">"apps"</span><span className="pun">: </span>[<span className="s">"Mail"</span><span className="pun">, </span><span className="s">"Notion"</span>]<span className="pun">,</span>
{`  `}<span className="k">"tabs"</span><span className="pun">: </span>[<span className="s">"linear.app"</span>]
{`}`}
                    </pre>
                  </div>
                </div>
              )}
              {i === 1 && (
                <div className="step">
                  <h3 className="step-title">Click once.</h3>
                  <p className="step-body">
                    Open Helm from the menu bar. Pick a workflow, or press the hotkey from anywhere.
                  </p>
                  <div className="step-visual">
                    <div className="step-click">
                      <div className="step-click-cursor"><Glyph name="cursor" size={14} /></div>
                      <div className="step-click-target">
                        <HelmWheel size={16} spin="slow" />
                        <span className="label">Mornings</span>
                        <span className="hot">⌃⌥1</span>
                      </div>
                    </div>
                    <p style={{ margin: "16px 0 0", fontSize: 12, color: "#5a7290", fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
                      {`> launch.workflow("Mornings")`}
                    </p>
                  </div>
                </div>
              )}
              {i === 2 && (
                <div className="step">
                  <h3 className="step-title">Your stack is ready.</h3>
                  <p className="step-body">
                    Apps open in order. Tabs load. Window state restores. Focus mode engages. You start.
                  </p>
                  <div className="step-visual">
                    <div className="step-apps">
                      <span className="step-app lit">M</span>
                      <span className="step-app lit">N</span>
                      <span className="step-app lit">L</span>
                      <span className="step-app lit">S</span>
                      <span className="step-app">·</span>
                      <span className="step-app">·</span>
                    </div>
                    <p style={{ margin: "16px 0 0", fontSize: 12, color: "var(--helm-green)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
                      4 apps · 2 tabs · 1 file · ready in 1.2s
                    </p>
                  </div>
                </div>
              )}
            </Reveal>
          ))}
        </div>
    </section>);

}

/* ============================================================
   Workflow examples
   ============================================================ */
const WORKFLOW_EXAMPLES = [
{
  name: "Mornings",
  hotkey: "⌃⌥1",
  summary: "Inbox triage, calendar review, and a clean slate for the day's first deep block.",
  items: [
  { label: "Mail", kind: "App" },
  { label: "Calendar — Today", kind: "App" },
  { label: "Notion · Daily note", kind: "Tab" },
  { label: "Slack — DMs", kind: "App" },
  { label: "linear.app/inbox", kind: "Tab" }]

},
{
  name: "Deep work",
  hotkey: "⌃⌥2",
  summary: "Editor, project tracker, and music. Slack quiet, notifications off, two hours.",
  items: [
  { label: "VS Code · /repo/api", kind: "App" },
  { label: "Linear — Current cycle", kind: "Tab" },
  { label: "Spotify · Focus playlist", kind: "App" },
  { label: "Do Not Disturb", kind: "Mode" },
  { label: "Terminal · dev server", kind: "App" }]

},
{
  name: "On-call",
  hotkey: "⌃⌥3",
  summary: "Open every dashboard and tool you'd reach for during an incident, in 1.2 seconds.",
  items: [
  { label: "Datadog — Production", kind: "Tab" },
  { label: "PagerDuty — Active", kind: "Tab" },
  { label: "Terminal · prod-shell", kind: "App" },
  { label: "Slack — #incident", kind: "App" },
  { label: "Zoom — Bridge", kind: "App" }]

}];


function Workflows() {
  return (
    <section className="container section" id="workflows">
      <Reveal>
        <div className="section-head">
          <div />
          <h2 className="section-title">
            A named stack for every mode you work in.
          </h2>
        </div>
      </Reveal>

      <div className="workflows">
          {WORKFLOW_EXAMPLES.map((wf, i) =>
          <Reveal key={wf.name} delay={i * 100}>
            <div className="workflow-card">
              <div className="workflow-card-head">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <HelmWheel size={18} spin="slow" />
                  <span className="workflow-name">{wf.name}</span>
                </div>
                <span className="workflow-hotkey">{wf.hotkey}</span>
              </div>
              <p className="workflow-summary">{wf.summary}</p>
              <div className="workflow-items">
                {wf.items.map((it) =>
              <div className="workflow-item" key={it.label}>
                    <span className="bullet" />
                    <span>{it.label}</span>
                    <span className="kind">{it.kind}</span>
                  </div>
              )}
              </div>
            </div>
          </Reveal>
          )}
        </div>
    </section>);

}

/* ============================================================
   Features strip
   ============================================================ */
const FEATURES = [
{
  icon: "menubar",
  title: "Menu bar native",
  body: "No Dock icon. No splash. Helm lives where power users already look — one click from the wheel."
},
{
  icon: "bolt",
  title: "JXA automation",
  body: "Talks directly to macOS via JavaScript for Automation. Not URL schemes. Not shortcuts hacks."
},
{
  icon: "lock",
  title: "Local config",
  body: "Workflows live in ~/Library/Application Support/Helm. Your data never leaves your machine."
},
{
  icon: "sliders",
  title: "Everything is editable",
  body: "Add, rename, reorder, and delete workflows from the popover. No preferences window to dig through."
}];


function Features() {
  return (
    <section className="container section" id="features">
      <Reveal>
        <div className="section-head">
          <div />
          <h2 className="section-title">A precision instrument, not a productivity app.</h2>
        </div>
      </Reveal>
      <div className="features">
          {FEATURES.map((f, i) =>
          <Reveal key={f.title} delay={i * 80}>
            <div className="feature">
              <div className="feature-icon"><Glyph name={f.icon} size={22} /></div>
              <h3 className="feature-title">{f.title}</h3>
              <p className="feature-body">{f.body}</p>
            </div>
          </Reveal>
          )}
        </div>
    </section>);

}

/* ============================================================
   FAQ
   ============================================================ */
const FAQS = [
{
  q: "Does Helm need accessibility permissions?",
  a: "Yes. Helm uses JavaScript for Automation to talk directly to macOS — that requires the Automation permission for each app you orchestrate. You grant it once, per app, on first launch."
},
{
  q: "Where are my workflows stored?",
  a: "In ~/Library/Application Support/Helm/workflows.json. Plain JSON. Edit it by hand if you want. Sync it with your dotfiles. It never leaves your machine."
},
{
  q: "What can a workflow include?",
  a: "Apps, browser tabs (Safari, Chrome, Arc), files, terminal sessions with starting directories, calendar events to open, and a macOS focus mode to engage. Add as many as you need."
},
{
  q: "Can I trigger workflows without opening the popover?",
  a: "Yes. Every workflow can be assigned a global hotkey. Press the keys from anywhere — Helm runs the stack without ever showing UI."
},
{
  q: "Apple Silicon or Intel?",
  a: "Universal binary. Native on M-series. Runs on Intel back to macOS 13."
},
{
  q: "What if an app isn't installed?",
  a: "Helm names what failed and continues with the rest of the stack. 'Couldn't open Slack. Slack is not installed.' — no celebration, no apology, just the fact."
}];


function FAQItem({ q, a, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className={`faq-item ${open ? "open" : ""}`}>
      <button className="faq-q" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>{q}</span>
        <span className="sign" aria-hidden="true" />
      </button>
      {open && <p className="faq-a">{a}</p>}
    </div>);

}

function FAQ() {
  return (
    <section className="container section" id="faq">
      <Reveal>
        <div className="section-head">
          <div />
          <h2 className="section-title">Answers, plainly.</h2>
        </div>
      </Reveal>
      <Reveal delay={80}>
        <div className="faq">
          {FAQS.map((f, i) =>
          <FAQItem key={f.q} q={f.q} a={f.a} defaultOpen={i === 0} />
          )}
        </div>
      </Reveal>
    </section>);

}

/* ============================================================
   Final CTA
   ============================================================ */
function FinalCTA() {
  return (
    <section className="container final-cta" id="download">
      <Reveal>
        <h2>
          Take the <span className="accent">wheel.</span>
        </h2>
        <p>One click. Your entire stack is running.</p>
        <a className="btn btn-primary btn-lg" href="#">
          <Glyph name="download" size={16} />
          Download for macOS
        </a>
        <div style={{ marginTop: 28, fontFamily: "var(--font-mono)", fontSize: 11, color: "#5a7290", letterSpacing: "0.04em" }}>
          v0.4.2 · 4.2 MB · macOS 13+ · Free
        </div>
      </Reveal>
    </section>);

}

/* ============================================================
   Footer
   ============================================================ */
function Footer() {
  return (
    <footer className="container footer">
      <div className="footer-meta">
        <span>~/Library/Application Support/Helm</span>
        <span>v0.4.2</span>
        <span>Built for macOS</span>
      </div>
      <div className="footer-right">
        <HelmWheel size={18} spin="slow" />
        <span className="footer-wordmark">Helm</span>
      </div>
    </footer>);

}

Object.assign(window, { Nav, Hero, Anatomy, Workflows, Features, FAQ, FinalCTA, Footer, Reveal });