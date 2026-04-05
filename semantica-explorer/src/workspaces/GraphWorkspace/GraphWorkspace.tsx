/**
 * src/workspaces/GraphWorkspace/GraphWorkspace.tsx
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { GraphCanvas } from "./GraphCanvas";
import type { GraphCanvasHandle } from "./GraphCanvas";
import { TimelinePanel } from "./TimelinePanel";
import { useLoadGraph, useReloadGraph } from "./useLoadGraph";
import { graph } from "../../store/graphStore";

// Utils

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const h = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(h);
  }, [value, delay]);
  return debouncedValue;
}

// Styles

const HUD_CSS = `
  .palantir-bg {
    background: radial-gradient(ellipse at center, #0d1117 0%, #010409 100%);
  }
  .palantir-grid {
    position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(88,166,255,0.05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(88,166,255,0.05) 1px, transparent 1px);
    background-size: 40px 40px;
    pointer-events: none; z-index: 1;
  }
  .palantir-vignette {
    position: absolute; inset: 0;
    background: radial-gradient(ellipse at center, transparent 30%, rgba(1,4,9,0.85) 100%);
    pointer-events: none; z-index: 2;
  }
  .glass-header {
    background: linear-gradient(180deg, rgba(13,17,23,0.9) 0%, rgba(13,17,23,0) 100%);
    border-bottom: 1px solid rgba(88,166,255,0.1);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
  .glass-hud {
    background: linear-gradient(135deg, rgba(13,17,23,0.78), rgba(22,27,34,0.62));
    backdrop-filter: blur(16px) saturate(1.2);
    -webkit-backdrop-filter: blur(16px) saturate(1.2);
    border-left: 1px solid rgba(88,166,255,0.2);
    box-shadow: -8px 0 32px rgba(0,0,0,0.5), inset 1px 0 0 rgba(255,255,255,0.05);
  }
  .hud-scrollbar::-webkit-scrollbar { width: 4px; }
  .hud-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .hud-scrollbar::-webkit-scrollbar-thumb { background: rgba(88,166,255,0.3); border-radius: 4px; }
`;

// Node detail panel

function NodePanel({ nodeId }: { nodeId: string }) {
  if (!nodeId) {
    return (
      <div style={{ padding: "32px 24px", textAlign: "center" }}>
        <p style={{ color: "#8b949e", fontSize: 14, margin: 0 }}>
          Select a node to view details
        </p>
      </div>
    );
  }

  const attrs = graph.getNodeAttributes(nodeId);
  const accentColor = attrs?.color || "#58a6ff";

  return (
    <aside style={{ padding: 24 }}>
      <div style={{ borderBottom: "1px solid rgba(88,166,255,0.2)", paddingBottom: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{
            background: accentColor,
            boxShadow: `0 0 10px ${accentColor}`,
            width: 8, height: 8, borderRadius: "50%",
          }} />
          <span style={{ color: accentColor, fontSize: 12, fontWeight: 600 }}>
            {attrs?.nodeType || "Entity"}
          </span>
        </div>
        <h3 style={{ margin: 0, color: "#fff", fontSize: 20, fontWeight: 600, wordBreak: "break-word" }}>
          {String(attrs?.label ?? nodeId)}
        </h3>
      </div>

      {/* Temporal bounds badge */}
      {(attrs?.valid_from || attrs?.valid_until) && (
        <div style={{
          marginBottom: 16,
          padding: "8px 12px",
          background: "rgba(88,166,255,0.08)",
          border: "1px solid rgba(88,166,255,0.2)",
          borderRadius: 6,
          fontSize: 12,
          color: "#79c0ff",
          fontFamily: "monospace",
        }}>
          {attrs?.valid_from && <div>▶ from: {attrs.valid_from}</div>}
          {attrs?.valid_until && <div>◀ until: {attrs.valid_until}</div>}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {Object.entries(attrs?.properties || {})
          .filter(([k]) => !["x", "y", "valid_from", "valid_until", "content"].includes(k))
          .map(([k, v]) => (
            <div
              key={k}
              style={{
                background: "rgba(0,0,0,0.2)",
                padding: "10px 14px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <div style={{ color: "rgba(88,166,255,0.7)", fontSize: 11, marginBottom: 4 }}>{k}</div>
              <div style={{ color: "#e6edf3", fontSize: 13, fontFamily: "monospace", wordBreak: "break-word" }}>
                {typeof v === "object" ? JSON.stringify(v) : String(v)}
              </div>
            </div>
          ))}
      </div>
    </aside>
  );
}

// Main component

export function GraphWorkspace() {
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [isLayoutRunning, setIsLayoutRunning] = useState(false);
  const reload = useReloadGraph();

  // Scrubber time state
  const [scrubberTime, setScrubberTime] = useState<Date | null>(null);
  const debouncedTime = useDebounce(scrubberTime, 150);

  const prevActiveIdsRef = useRef<Set<string>>(new Set());

  const canvasRef = useRef<GraphCanvasHandle>(null);

  const [activeNodeCount, setActiveNodeCount] = useState<number | null>(null);

  const handleTimeChange = useCallback((time: Date) => {
    setScrubberTime(time);
  }, []);

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);

  const { data: summary, isLoading, isError, error } = useLoadGraph({
    enabled: true,
    onGraphReady: () => {
      setIsLayoutRunning(true);
    },
  });

  // Temporal filtering
  useEffect(() => {
    if (!debouncedTime || isLoading) return;

    let cancelled = false;

    const applySnapshot = async () => {
      try {
        const at = debouncedTime.toISOString();
        const res = await fetch(`/api/temporal/snapshot?at=${encodeURIComponent(at)}`);
        if (!res.ok || cancelled) return;

        const data: { active_node_ids: string[]; active_node_count: number } = await res.json();
        if (cancelled) return;

        const newActiveIds = new Set(data.active_node_ids);


        requestAnimationFrame(() => {
          if (cancelled) return;

          const prev = prevActiveIdsRef.current;


          prev.forEach((id) => {
            if (!newActiveIds.has(id) && graph.hasNode(id)) {
              graph.setNodeAttribute(id, "hidden", true);
            }
          });


          newActiveIds.forEach((id) => {
            if (!prev.has(id) && graph.hasNode(id)) {
              graph.setNodeAttribute(id, "hidden", false);
            }
          });

          prevActiveIdsRef.current = newActiveIds;
          setActiveNodeCount(data.active_node_count);

          canvasRef.current?.getSigma()?.refresh();
        });
      } catch (err) {
        if (!cancelled) {
          console.error("[Temporal] Snapshot fetch failed:", err);
        }
      }
    };

    applySnapshot();
    return () => { cancelled = true; };
  }, [debouncedTime, isLoading]);


  return (
    <div
      className="palantir-bg"
      style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}
    >
      <style>{HUD_CSS}</style>
      <div className="palantir-grid" />
      <div className="palantir-vignette" />


      <div style={{ flex: 1, position: "relative", zIndex: 3, minHeight: 0 }}>
        <GraphCanvas
          ref={canvasRef}
          onNodeClick={handleNodeClick}
          selectedNodeId={selectedNodeId}
          isLayoutRunning={isLayoutRunning}
        />
      </div>


      <TimelinePanel onTimeChange={handleTimeChange} />


      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 10 }}>

        <header
          className="glass-header"
          style={{ pointerEvents: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px" }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: 18, color: "#fff", fontWeight: 600 }}>Graph Explorer</h2>

            {isLoading && (
              <span style={{ color: "rgba(88,166,255,0.8)", fontSize: 13 }}>Loading graph…</span>
            )}

            {summary && (
              <span style={{
                background: "rgba(88,166,255,0.1)",
                color: "#58a6ff",
                padding: "4px 10px",
                borderRadius: 4,
                fontSize: 12,
                border: "1px solid rgba(88,166,255,0.2)",
              }}>
                {summary.nodeCount.toLocaleString()} nodes · {summary.edgeCount.toLocaleString()} edges
              </span>
            )}

            {activeNodeCount !== null && (
              <span style={{
                background: "rgba(63,185,80,0.12)",
                color: "#3fb950",
                padding: "4px 10px",
                borderRadius: 4,
                fontSize: 12,
                border: "1px solid rgba(63,185,80,0.25)",
              }}>
                ⏱ {activeNodeCount.toLocaleString()} active
              </span>
            )}

            {isError && (
              <span style={{ color: "#ff7b72", fontSize: 13 }}>
                ⚠ {(error as Error).message}
              </span>
            )}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => setIsLayoutRunning((v) => !v)}
              style={btnStyle(isLayoutRunning ? "rgba(56,139,253,0.15)" : "rgba(255,255,255,0.05)", isLayoutRunning ? "#58a6ff" : "#e6edf3")}
              disabled={isLoading}
            >
              <span style={{
                display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                background: isLayoutRunning ? "#58a6ff" : "#8b949e", marginRight: 8,
              }} />
              {isLayoutRunning ? "Pause Layout" : "Run Layout"}
            </button>
            <button onClick={reload} style={btnStyle("rgba(255,255,255,0.05)", "#e6edf3")} disabled={isLoading}>
              ↺ Reload
            </button>
          </div>
        </header>


        <div
          className="glass-hud hud-scrollbar"
          style={{
            pointerEvents: "auto",
            position: "absolute",
            right: 0,
            top: 52,
            bottom: 90,
            width: 360,
            overflowY: "auto",
            transition: "transform 0.3s cubic-bezier(0.16,1,0.3,1)",
            transform: selectedNodeId ? "translateX(0)" : "translateX(100%)",
          }}
        >
          <NodePanel nodeId={selectedNodeId} />
        </div>

      </div>
    </div>
  );
}

const btnStyle = (bg: string, color: string): React.CSSProperties => ({
  background: bg,
  color,
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 4,
  padding: "8px 16px",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
  transition: "all 0.2s",
  backdropFilter: "blur(4px)",
});