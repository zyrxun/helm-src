/* Helm — Prelaunch page */
const { useState } = React;

/* ============================================================
   Nav
   ============================================================ */
function PrelaunchNav() {
  return (
    <nav style={{
      display: "flex",
      alignItems: "center",
      height: 72,
      padding: "0 56px",
    }}>
      <a href="#" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
        <HelmWheel size={22} spin="slow" />
        <span style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 22,
          color: "var(--helm-gold)",
          letterSpacing: "0.06em",
          lineHeight: 1,
        }}>
          Helm
        </span>
      </a>
      <div style={{ marginLeft: "auto" }}>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--helm-fog)",
          letterSpacing: "0.06em",
        }}>
          Shipping soon · macOS
        </span>
      </div>
    </nav>
  );
}

/* ============================================================
   Email form
   ============================================================ */
function EmailForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [hover, setHover] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setError("Enter a valid email.");
      return;
    }
    setError("");
    try {
      const res = await fetch("https://zyrxun--4209f72a5edc11f1a9731607ee4eb77e.web.val.run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error("server error");
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Try again.");
    }
  }

  if (submitted) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        color: "var(--helm-green)",
        fontFamily: "var(--font-mono)",
        fontSize: 13,
        letterSpacing: "0.04em",
        height: 44,
      }}>
        <span style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: "var(--helm-green)",
          display: "inline-block",
          flexShrink: 0,
        }} />
        You're on the list.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={e => { setEmail(e.target.value); setError(""); }}
          style={{
            background: "var(--helm-navy)",
            border: error ? "0.5px solid var(--helm-alert)" : "0.5px solid rgba(212,175,106,0.25)",
            borderRadius: "var(--r-button)",
            color: "var(--helm-chalk)",
            fontFamily: "var(--font-ui)",
            fontSize: 14,
            padding: "11px 18px",
            outline: "none",
            width: 256,
            transition: "border-color 0.15s",
          }}
          onFocus={e => { if (!error) e.target.style.borderColor = "var(--helm-gold)"; }}
          onBlur={e => { if (!error) e.target.style.borderColor = "rgba(212,175,106,0.25)"; }}
        />
        <button
          type="submit"
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            background: hover ? "var(--helm-gold-pressed)" : "var(--helm-gold)",
            color: "var(--helm-abyss)",
            border: "none",
            borderRadius: "var(--r-button)",
            fontFamily: "var(--font-ui)",
            fontWeight: 600,
            fontSize: 13,
            padding: "11px 22px",
            cursor: "pointer",
            letterSpacing: "var(--track-tight)",
            transition: "background 0.1s",
            whiteSpace: "nowrap",
          }}
        >
          Notify me
        </button>
      </div>
      {error && (
        <span style={{
          color: "var(--helm-alert)",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.04em",
        }}>
          {error}
        </span>
      )}
    </form>
  );
}

/* ============================================================
   Teaser cards
   ============================================================ */
const TEASERS = [
  {
    title: "Menu bar native.",
    body: "No Dock icon. No splash. Helm lives where power users already look — one click from the wheel.",
  },
  {
    title: "One click. Your stack.",
    body: "Apps, tabs, files, terminal sessions, and focus modes — all configured, all at once.",
  },
  {
    title: "Local and private.",
    body: "Workflows live in plain JSON on your machine. Your data never leaves your machine.",
  },
];

/* ============================================================
   How it works
   ============================================================ */
const STEPS = [
  { id: "01", title: "Configure once",   body: "Define a workflow. Apps, tabs, files, focus mode. Plain JSON." },
  { id: "02", title: "Click the wheel",  body: "Helm sits in your menu bar. One click reveals your workflows." },
  { id: "03", title: "Your stack opens", body: "Apps launch. Tabs load. Files open. State preserved." },
  { id: "04", title: "Take the wheel",   body: "Switch contexts in seconds. No Dock dance. No tab graveyard." },
];

function HowItWorks() {
  return (
    <section style={{
      maxWidth: 960,
      margin: "0 auto",
      padding: "0 56px 88px",
      width: "100%",
      boxSizing: "border-box",
    }}>
      <div style={{
        fontFamily: "var(--font-ui)",
        fontSize: 10,
        fontWeight: 600,
        color: "#5a7290",
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        marginBottom: 12,
      }}>
        How it works
      </div>

      <h2 style={{
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize: "clamp(36px, 5vw, 56px)",
        color: "var(--helm-chalk)",
        lineHeight: 1.15,
        letterSpacing: "-0.02em",
        margin: "0 0 48px",
      }}>
        Four steps. One <span style={{ color: "var(--helm-gold)" }}>click.</span>
      </h2>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 20,
      }}>
        {STEPS.map((step) => (
          <div key={step.id} style={{
            background: "var(--helm-navy)",
            border: "0.5px solid rgba(247,244,239,0.06)",
            borderRadius: "var(--r-card)",
            padding: "20px 20px 22px",
            display: "flex",
            flexDirection: "column",
            boxSizing: "border-box",
          }}>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: 28,
              fontWeight: 500,
              color: "var(--helm-gold)",
              letterSpacing: "0.04em",
              lineHeight: 1,
            }}>
              {step.id}
            </div>
            <div style={{
              width: 28,
              height: "0.5px",
              background: "rgba(247,244,239,0.06)",
              marginTop: 12,
              marginBottom: 12,
            }} />
            <h3 style={{
              fontFamily: "var(--font-ui)",
              fontSize: 14,
              fontWeight: 600,
              color: "var(--helm-chalk)",
              letterSpacing: "-0.01em",
              lineHeight: 1.2,
              margin: "0 0 8px",
            }}>
              {step.title}
            </h3>
            <p style={{
              fontFamily: "var(--font-ui)",
              fontSize: 13,
              fontWeight: 400,
              color: "var(--helm-fog)",
              lineHeight: 1.65,
              margin: 0,
            }}>
              {step.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   Scroll prompt
   ============================================================ */
function ScrollPrompt() {
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    function onScroll() {
      if (window.scrollY > 80) {
        setVisible(false);
        window.removeEventListener('scroll', onScroll);
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <div style={{
      marginTop: 32,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 6,
      pointerEvents: 'none',
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.4s cubic-bezier(0.25, 1, 0.5, 1)',
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--helm-fog)',
        letterSpacing: '0.08em',
        opacity: 0.6,
      }}>Scroll to see it in action</span>
      <svg style={{ animation: 'helm-bounce 1.6s ease-in-out infinite', willChange: 'transform' }}
        width="16" height="16" viewBox="0 0 16 16" fill="none">
        <polyline points="2,5 8,11 14,5" stroke="var(--helm-gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}

/* ============================================================
   App root
   ============================================================ */
function PrelaunchPage() {
  return (
    <div className="page with-grid" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      <PrelaunchNav />

      {/* ── Hero ── */}
      <section style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "72px 40px 56px",
      }}>
        <div style={{ marginBottom: 36 }}>
          <HelmWheel size={88} spin="slow" />
        </div>

        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--helm-fog)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom: 22,
        }}>
          Launching July 1
        </div>

        <h1 style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: "clamp(48px, 7vw, 84px)",
          letterSpacing: "0.06em",
          color: "var(--helm-chalk)",
          margin: "0 0 16px",
          lineHeight: 1.05,
        }}>
          Take the <span style={{ color: "var(--helm-gold)" }}>wheel.</span>
        </h1>

        <p style={{
          fontSize: 17,
          color: "var(--helm-fog)",
          maxWidth: 480,
          lineHeight: 1.7,
          margin: "0 0 48px",
        }}>
          A menu bar orchestrator for macOS. One click opens your apps, tabs, and files — exactly as you left them.
        </p>

        <EmailForm />

        <ScrollPrompt />

        <div style={{
          marginTop: 28,
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "#3a5068",
          letterSpacing: "0.04em",
        }}>
          macOS 13+ · Apple Silicon &amp; Intel · Free
        </div>
      </section>

      {/* ── Teaser strip ── */}
      <section style={{
        padding: "0 56px 88px",
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 20,
        maxWidth: 960,
        margin: "0 auto",
        width: "100%",
        boxSizing: "border-box",
      }}>
        {TEASERS.map((t) => (
          <div key={t.title} style={{
            background: "var(--helm-navy)",
            borderRadius: "var(--r-card)",
            padding: "24px 28px",
            border: "0.5px solid rgba(212,175,106,0.12)",
          }}>
            <div style={{
              fontFamily: "var(--font-ui)",
              fontWeight: 600,
              fontSize: 14,
              color: "var(--helm-chalk)",
              marginBottom: 8,
              letterSpacing: "var(--track-tight)",
            }}>
              {t.title}
            </div>
            <div style={{
              fontSize: 13,
              color: "var(--helm-fog)",
              lineHeight: 1.65,
            }}>
              {t.body}
            </div>
          </div>
        ))}
      </section>

      <HowItWorks />

      {/* ── Footer ── */}
      <footer style={{
        padding: "20px 56px",
        borderTop: "0.5px solid rgba(212,175,106,0.10)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "#3a5068",
            letterSpacing: "0.04em",
          }}>
            ~/Library/Application Support/Helm
          </span>
          <a href="/privacy.html" style={{
            fontSize: 11,
            color: "#3a5068",
            textDecoration: "none",
            letterSpacing: "0.04em",
          }}>Privacy</a>
          <a href="/terms.html" style={{
            fontSize: 11,
            color: "#3a5068",
            textDecoration: "none",
            letterSpacing: "0.04em",
          }}>Terms</a>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <HelmWheel size={16} spin="slow" />
          <span style={{
            fontFamily: "var(--font-display)",
            fontSize: 14,
            color: "var(--helm-gold)",
            letterSpacing: "0.06em",
          }}>
            Helm
          </span>
        </div>
      </footer>

    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<PrelaunchPage />);
