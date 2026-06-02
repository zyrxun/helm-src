/* Helm — Landing page app */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "headline": "Take the wheel.",
  "subhead": "One click. Your entire stack is running. Helm is the menu bar instrument for people who don't slow down for their tools.",
  "demoState": "auto",
  "showGrid": true,
  "wheelSpeed": "calm"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

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

      <TweaksPanel>
        <TweakSection label="Hero copy" />
        <TweakText
          label="Headline"
          value={t.headline}
          onChange={(v) => setTweak("headline", v)}
        />
        <TweakText
          label="Subhead"
          value={t.subhead}
          onChange={(v) => setTweak("subhead", v)}
          multiline
        />

        <TweakSection label="Demo" />
        <TweakSelect
          label="Popover state"
          value={t.demoState}
          options={["auto", "idle", "approach", "hover", "click", "running", "ready"]}
          onChange={(v) => setTweak("demoState", v)}
        />

        <TweakSection label="Atmosphere" />
        <TweakToggle
          label="Nautical grid"
          value={t.showGrid}
          onChange={(v) => setTweak("showGrid", v)}
        />
        <TweakRadio
          label="Wheel rotation"
          value={t.wheelSpeed}
          options={["calm", "standard", "brisk"]}
          onChange={(v) => setTweak("wheelSpeed", v)}
        />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
