/**
 * src/workspaces/DecisionWorkspace/DecisionWorkspace.tsx
 */
import { useState, useEffect } from "react";

const THEME_CSS = `
  .glass-panel {
    background: linear-gradient(135deg, rgba(13,17,23,0.75), rgba(22,27,34,0.6));
    backdrop-filter: blur(16px) saturate(1.2);
    -webkit-backdrop-filter: blur(16px) saturate(1.2);
    border: 1px solid rgba(88,166,255,0.2);
    box-shadow: 0 8px 32px rgba(0,0,0,0.5), inset 1px 1px 0 rgba(255,255,255,0.05);
  }
`;



function CausalChainNode({ hop, title, desc }: { hop: number, title: string, desc: string }) {
  return (
    <div style={{ marginLeft: hop * 24, paddingLeft: 16, borderLeft: "2px solid rgba(88,166,255,0.3)", position: "relative", marginBottom: 16 }}>
      <div style={{ position: "absolute", left: -6, top: 4, width: 10, height: 10, borderRadius: "50%", background: "#58a6ff", boxShadow: "0 0 8px #58a6ff" }} />
      <h4 style={{ margin: "0 0 4px 0", color: "#e6edf3", fontSize: 14 }}>{title}</h4>
      <p style={{ margin: 0, color: "#8b949e", fontSize: 13 }}>{desc}</p>
    </div>
  );
}

export function DecisionWorkspace() {
  const [decisions, setDecisions] = useState<any[]>([]);
  const [selectedDecision, setSelectedDecision] = useState<any | null>(null);
  const [chain, setChain] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("http://localhost:8000/api/decisions")
      .then(res => res.json())
      .then(data => {
        setDecisions(data);
        if (data.length > 0) handleSelectDecision(data[0]);
      })
      .catch(console.error);
  }, []);

  const handleSelectDecision = async (d: any) => {
    setSelectedDecision(d);
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/api/decisions/${d.decision_id}/chain`);
      const data = await res.json();
      setChain(data.chain || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", background: "#0d1117", overflow: "hidden" }}>
      <style>{THEME_CSS}</style>

      {/* Left Column: Decisions List */}
      <div className="glass-panel" style={{ width: 320, padding: 24, display: "flex", flexDirection: "column", gap: 16, borderRight: "1px solid rgba(88,166,255,0.2)", borderTop: "none", borderLeft: "none", borderBottom: "none", borderRadius: 0 }}>
        <h2 style={{ color: "#ffffff", margin: 0, fontSize: 18, borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: 12 }}>
          Decision Tree
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {decisions.map(d => (
            <button
              key={d.decision_id}
              onClick={() => handleSelectDecision(d)}
              style={{
                textAlign: "left", padding: "12px 16px", borderRadius: 8, cursor: "pointer",
                background: selectedDecision?.decision_id === d.decision_id ? "rgba(88,166,255,0.15)" : "transparent",
                border: `1px solid ${selectedDecision?.decision_id === d.decision_id ? "#58a6ff" : "rgba(255,255,255,0.1)"}`,
                color: selectedDecision?.decision_id === d.decision_id ? "#ffffff" : "#c9d1d9",
                transition: "all 0.2s"
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14 }}>{d.decision_id}</div>
              <div style={{ fontSize: 12, color: "#8b949e", marginTop: 4 }}>{d.category || 'Uncategorized'}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Right Column: Causal Chains */}
      <div style={{ flex: 1, padding: 32, overflowY: "auto", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at top right, rgba(88,166,255,0.05), transparent 60%)", pointerEvents: "none" }} />

        {selectedDecision ? (
          <>
            <h1 style={{ color: "#ffffff", fontSize: 28, margin: "0 0 8px 0" }}>{selectedDecision.decision_id}</h1>
            <div style={{ color: "#58a6ff", fontSize: 14, marginBottom: 40 }}>Outcome: {selectedDecision.outcome}</div>

            <div className="glass-panel" style={{ padding: 32, borderRadius: 12 }}>
              <h3 style={{ color: "#ffffff", margin: "0 0 24px 0", fontSize: 16 }}>Causal Chain</h3>
              {loading ? (
                <div style={{ color: "#8b949e" }}>Loading chain...</div>
              ) : chain.length > 0 ? (
                chain.map((c, i) => (
                  <CausalChainNode key={i} hop={i} title={`${c.relationship} ${c.id}`} desc={c.content || '...'} />
                ))
              ) : (
                <div style={{ color: "#8b949e" }}>No causal chain found.</div>
              )}
            </div>
          </>
        ) : (
          <div style={{ color: "#8b949e", textAlign: "center", marginTop: 100 }}>Select a decision to view details</div>
        )}
      </div>
    </div>
  );
}
