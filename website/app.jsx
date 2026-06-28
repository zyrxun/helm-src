/* Helm — Landing page app */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "headline": "Take the wheel.",
  "subhead": "One click. Your entire stack is running. Helm is the menu bar instrument for people who don't slow down for their tools.",
  "demoState": "auto",
  "showGrid": true,
  "wheelSpeed": "calm"
}/*EDITMODE-END*/;

function App() {
  const t = TWEAK_DEFAULTS;

  // Apply wheel speed globally via CSS vars
  React.useEffect(() => {
    const root = document.documentElement;
    const speeds = { calm: "16s", standard: "8s", brisk: "4s" };
    root.style.setProperty("--spin-slow", speeds[t.wheelSpeed] || "16s");
  }, [t.wheelSpeed]);

  return (
    <div className={`page ${t.showGrid ? "with-grid" : ""}`}>
      <Nav />
      <Hero
        headline={t.headline}
        sub={t.subhead}
        demoStage={t.demoState}
      />
      <Anatomy />
      <Workflows />
      <Features />
      <FAQ />
      <FinalCTA />
      <Footer />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
