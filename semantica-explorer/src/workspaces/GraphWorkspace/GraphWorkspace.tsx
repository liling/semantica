/**
 * src/workspaces/GraphWorkspace/GraphWorkspace.tsx
 */

import { useState, useCallback } from "react";
import { GraphCanvas } from "./GraphCanvas";
import { useLoadGraph, useReloadGraph } from "./useLoadGraph";
import { graph } from "../../store/graphStore";

// ─── Node Properties Side Panel ────────────────────────────────────────────
function NodePanel({ nodeId }: { nodeId: string }) {
  if (!nodeId) {
    return (
      <aside style={panelStyle}>
        <p style={{ color: "#8b949e", fontSize: 13, marginTop: 20, textAlign: "center" }}>
          Click a node to inspect its properties.
        </p>
      </aside>
    );
  }

  // Read directly from the graphology singleton! 
  // We NEVER put the 50k nodes into React state to do this lookup.
  const attrs = graph.getNodeAttributes(nodeId);

  return (
    <aside style={panelStyle}>
      <h3 style={{ margin: "0 0 12px", color: "#e6edf3", fontSize: 16 }}>
        {String(attrs?.label ?? nodeId)}
      </h3>
      
      <div style={{ marginBottom: 16 }}>
        <span style={{ 
          background: attrs?.color || "#6c8ebf", 
          color: "#fff", 
          padding: "2px 8px", 
          borderRadius: 12, 
          fontSize: 11, 
          fontWeight: "bold" 
        }}>
          {attrs?.nodeType || "Entity"}
        </span>
      </div>

      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
        <tbody>
          {/* Render standard attributes safely */}
          {Object.entries(attrs?.properties || {}).map(([k, v]) => (
            <tr key={k} style={{ borderBottom: "1px solid #21262d" }}>
              <td style={{ color: "#8b949e", padding: "6px 8px 6px 0", fontWeight: 600 }}>{k}</td>
              <td style={{ color: "#e6edf3", padding: "6px 0", wordBreak: "break-word" }}>
                {typeof v === "object" ? JSON.stringify(v) : String(v)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </aside>
  );
}

// ─── Main Workspace Component ──────────────────────────────────────────────
export function GraphWorkspace() {
  // THE ONLY REACT STATE FOR THE GRAPH
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [isLayoutRunning, setIsLayoutRunning] = useState(false);

  const reload = useReloadGraph();

  // Stable callback to prevent unnecessary re-renders
  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);

  // Fetch data into the mutable singleton
  const { data: summary, isLoading, isError, error } = useLoadGraph({
    enabled: true,
    onGraphReady: () => {
      // Auto-start the ForceAtlas2 layout once data finishes downloading
      setIsLayoutRunning(true);
    },
  });

  return (
    <div style={rootStyle}>
      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <header style={headerStyle}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 16, color: "#e6edf3" }}>Graph Explorer</h2>
          
          {isLoading && <span style={{ color: "#8b949e", fontSize: 13 }}>Fetching graph data...</span>}
          {summary && (
            <span style={{ color: "#8b949e", fontSize: 13 }}>
              {summary.nodeCount.toLocaleString()} nodes · {summary.edgeCount.toLocaleString()} edges
            </span>
          )}
          {isError && (
            <span style={{ color: "#f85149", fontSize: 13 }}>Error: {(error as Error).message}</span>
          )}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setIsLayoutRunning((v) => !v)}
            style={btnStyle(isLayoutRunning ? "#388bfd" : "#21262d", isLayoutRunning ? "#fff" : "#e6edf3")}
            disabled={isLoading}
          >
            {isLayoutRunning ? "⏸ Pause Layout" : "▶ Run Layout"}
          </button>
          <button onClick={reload} style={btnStyle("#21262d", "#e6edf3")} disabled={isLoading}>
            ↺ Reload Graph
          </button>
        </div>
      </header>

      {/* ── Main Layout ──────────────────────────────────────────────── */}
      <main style={mainStyle}>
        {/* WebGL Canvas Area */}
        <div style={{ flex: 1, minWidth: 0, height: "100%", position: "relative" }}>
          <GraphCanvas
            onNodeClick={handleNodeClick}
            isLayoutRunning={isLayoutRunning}
          />
        </div>

        {/* Right Side Panel */}
        <NodePanel nodeId={selectedNodeId} />
      </main>
    </div>
  );
}

// ─── Inline Styles ──────────────────────────────────────────────────────────
const rootStyle: React.CSSProperties = { display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#0d1117", overflow: "hidden" };
const headerStyle: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", background: "#161b22", borderBottom: "1px solid #30363d", flexShrink: 0 };
const mainStyle: React.CSSProperties = { display: "flex", flex: 1, overflow: "hidden" };
const panelStyle: React.CSSProperties = { width: 320, flexShrink: 0, background: "#161b22", borderLeft: "1px solid #30363d", padding: 16, overflowY: "auto" };
const btnStyle = (bg: string, color: string): React.CSSProperties => ({ background: bg, color, border: "1px solid #30363d", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 13, transition: "all 0.15s", fontWeight: 500 });