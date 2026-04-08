import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { batchMergeEdges, batchMergeNodes, graph } from "../../store/graphStore";
import type { EdgeAttributes, NodeAttributes } from "../../store/graphStore";
import { GraphCanvas } from "./GraphCanvas";
import type { GraphCanvasHandle, GraphViewMode } from "./GraphCanvas";
import { TimelinePanel } from "./TimelinePanel";
import { useLoadGraph, useReloadGraph } from "./useLoadGraph";
import type { GraphLoadProgress } from "./useLoadGraph";
import { GRAPH_THEME, withAlpha } from "./graphTheme";
import {
  legendPlugin,
  neighborhoodPanelPlugin,
  temporalOverlayPlugin,
  type GraphPlugin,
  type GraphPluginActionRequest,
  type GraphPluginContext,
  type GraphPluginOverlayDescriptor,
  type GraphPluginPanelDescriptor,
  type GraphPluginRegistryEntry,
  type GraphPluginRuntime,
  type GraphPluginToolbarItem,
} from "./plugins";
import type { GraphInteractionState, GraphLoadSummary, GraphSelectedNodeState } from "./types";

type SearchResult = {
  node: {
    id: string;
    type: string;
    content: string;
    properties: Record<string, unknown>;
  };
  score: number;
};

type LinkPrediction = {
  target: string;
  type: string;
  label?: string;
  score: number;
};

type PathResponse = {
  path: string[];
  total_weight: number;
};

type TemporalBounds = {
  min?: string | null;
  max?: string | null;
};

const PROVENANCE_KEYS = ["source", "source_url", "pmid", "pmids", "evidence", "provenance", "confidence"] as const;

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timeout);
  }, [delay, value]);
  return debouncedValue;
}

const HUD_CSS = `
  .palantir-bg {
    background:
      radial-gradient(circle at top, rgba(77, 157, 255, 0.08), transparent 22%),
      linear-gradient(180deg, #060b17 0%, #02060d 100%);
  }
  .palantir-grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(88, 166, 255, 0.038) 1px, transparent 1px),
      linear-gradient(90deg, rgba(88, 166, 255, 0.038) 1px, transparent 1px);
    background-size: 42px 42px;
    pointer-events: none;
    z-index: 1;
  }
  .palantir-vignette {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at center, transparent 34%, rgba(1, 4, 10, 0.78) 100%);
    pointer-events: none;
    z-index: 2;
  }
  .glass-header {
    background: linear-gradient(180deg, rgba(7, 14, 25, 0.88) 0%, rgba(10, 18, 31, 0.62) 100%);
    border-bottom: 1px solid rgba(112, 196, 255, 0.1);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }
  .glass-hud {
    background: linear-gradient(135deg, rgba(8, 15, 27, 0.76), rgba(10, 19, 32, 0.58));
    backdrop-filter: blur(14px) saturate(1.08);
    -webkit-backdrop-filter: blur(14px) saturate(1.08);
    border-left: 1px solid rgba(112, 196, 255, 0.14);
    box-shadow: -10px 0 28px rgba(0, 0, 0, 0.34), inset 1px 0 0 rgba(255, 255, 255, 0.04);
  }
  .hud-scrollbar::-webkit-scrollbar { width: 6px; }
  .hud-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .hud-scrollbar::-webkit-scrollbar-thumb { background: rgba(88, 166, 255, 0.25); border-radius: 6px; }
  .node-panel-collapse {
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.14);
    overflow: hidden;
  }
  .node-panel-collapse + .node-panel-collapse {
    margin-top: 12px;
  }
  .node-panel-summary {
    list-style: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    color: #c6d4e3;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .node-panel-summary::-webkit-details-marker {
    display: none;
  }
  .node-panel-summary::after {
    content: "+";
    color: rgba(127, 208, 255, 0.8);
    font-size: 16px;
    line-height: 1;
  }
  .node-panel-collapse[open] .node-panel-summary::after {
    content: "−";
  }
  .node-panel-body {
    padding: 0 14px 14px;
  }
  .graph-loading-overlay {
    position: absolute;
    inset: 0;
    z-index: 9;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }
  .graph-loading-card {
    width: min(460px, calc(100% - 48px));
    border-radius: 20px;
    padding: 22px 22px 18px;
    background: linear-gradient(135deg, rgba(7, 17, 31, 0.9), rgba(14, 28, 48, 0.78));
    border: 1px solid rgba(127, 208, 255, 0.16);
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.38), inset 0 1px 0 rgba(255,255,255,0.04);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
  }
  .graph-loading-dots {
    display: inline-flex;
    gap: 8px;
    align-items: center;
  }
  .graph-loading-dot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: linear-gradient(135deg, rgba(127, 208, 255, 0.96), rgba(242, 182, 109, 0.96));
    box-shadow: 0 0 18px rgba(127, 208, 255, 0.35);
    animation: sem-loader-pulse 1.2s ease-in-out infinite;
  }
  .graph-loading-dot:nth-child(2) {
    animation-delay: 0.14s;
  }
  .graph-loading-dot:nth-child(3) {
    animation-delay: 0.28s;
  }
  @keyframes sem-loader-pulse {
    0%, 100% {
      transform: translateY(0) scale(0.92);
      opacity: 0.55;
    }
    50% {
      transform: translateY(-4px) scale(1.08);
      opacity: 1;
    }
  }
  .graph-loading-bar {
    width: 100%;
    height: 10px;
    border-radius: 999px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(127, 208, 255, 0.1);
  }
  .graph-loading-bar > span {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, rgba(74, 163, 255, 0.9), rgba(127, 208, 255, 0.95), rgba(242, 182, 109, 0.92));
    box-shadow: 0 0 28px rgba(74, 163, 255, 0.3);
    transition: width 180ms ease;
  }
`;

function phaseLabel(phase: GraphLoadProgress["phase"]) {
  switch (phase) {
    case "nodes":
      return "Loading nodes";
    case "edges":
      return "Loading edges";
    case "styling":
      return "Computing layout and styling";
    case "rendering":
      return "Rendering graph";
    default:
      return "Loading graph";
  }
}

function LoadingOverlay({
  progress,
  showGraphBehind,
}: {
  progress: GraphLoadProgress | null;
  showGraphBehind: boolean;
}) {
  const safeProgress = progress ?? {
    phase: "nodes" as const,
    nodesLoaded: 0,
    nodesTotal: null,
    edgesLoaded: 0,
    edgesTotal: null,
    message: "Preparing graph load",
    progress: 0.06,
  };

  return (
    <div
      className="graph-loading-overlay"
      style={{
        background: showGraphBehind
          ? "linear-gradient(180deg, rgba(1,4,9,0.08), rgba(1,4,9,0.28))"
          : "linear-gradient(180deg, rgba(1,4,9,0.32), rgba(1,4,9,0.58))",
      }}
    >
      <div className="graph-loading-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, marginBottom: 14 }}>
          <div>
            <div style={{ color: "#ffffff", fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Loading Graph</div>
            <div style={{ color: "#8fa8c6", fontSize: 13 }}>{phaseLabel(safeProgress.phase)}</div>
          </div>
          <div className="graph-loading-dots" aria-hidden="true">
            <span className="graph-loading-dot" />
            <span className="graph-loading-dot" />
            <span className="graph-loading-dot" />
          </div>
        </div>

        <div style={{ color: "#c6d4e3", fontSize: 13, marginBottom: 12 }}>
          {safeProgress.message}
        </div>

        <div className="graph-loading-bar" style={{ marginBottom: 14 }}>
          <span style={{ width: `${Math.round(Math.max(6, safeProgress.progress * 100))}%` }} />
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span style={loadingMetricStyle}>
            {safeProgress.nodesLoaded.toLocaleString()}
            {safeProgress.nodesTotal ? ` / ${safeProgress.nodesTotal.toLocaleString()}` : ""} nodes
          </span>
          <span style={loadingMetricStyle}>
            {safeProgress.edgesLoaded.toLocaleString()}
            {safeProgress.edgesTotal ? ` / ${safeProgress.edgesTotal.toLocaleString()}` : ""} edges
          </span>
        </div>
      </div>
    </div>
  );
}

function sourceAttribution(properties: Record<string, unknown>) {
  return PROVENANCE_KEYS
    .filter((key) => key in properties)
    .map((key) => ({ key, value: properties[key] }));
}

function getProvenanceCount(properties: Record<string, unknown>) {
  return PROVENANCE_KEYS.reduce(
    (count, key) => (properties[key] !== undefined && properties[key] !== null ? count + 1 : count),
    0,
  );
}

function buildRealtimeNodeAttributes(payload: {
  id: string;
  type?: string;
  properties?: Record<string, unknown>;
}): NodeAttributes {
  const properties = payload.properties || {};
  const label = String(properties.content || payload.id);
  const baseColor = GRAPH_THEME.palette.accent.path;
  const hasTemporalBounds = Boolean(properties.valid_from || properties.valid_until);
  const provenanceCount = getProvenanceCount(properties);

  return {
    label,
    x: Number(properties.x ?? Math.random() * 1000 - 500),
    y: Number(properties.y ?? Math.random() * 1000 - 500),
    nodeType: payload.type || "inferred",
    content: label,
    valid_from: (properties.valid_from as string | null | undefined) ?? null,
    valid_until: (properties.valid_until as string | null | undefined) ?? null,
    properties,
    size: 8,
    baseSize: 8,
    semanticGroup: payload.type || "inferred",
    color: baseColor,
    baseColor,
    mutedColor: withAlpha(baseColor, GRAPH_THEME.nodes.mutedAlpha),
    glowColor: withAlpha(baseColor, 0.36),
    visualPriority: 0.82,
    labelPriority: 0.82,
    strokeColor: GRAPH_THEME.palette.background.nodeBorder,
    borderColor: GRAPH_THEME.palette.background.nodeBorder,
    borderSize: 0.85,
    nodeVariant: "inferred",
    nodeShapeVariant: "inferred",
    badgeKind: hasTemporalBounds ? "temporal" : provenanceCount > 0 ? "provenance" : "inferred",
    badgeCount: provenanceCount || undefined,
    ringColor: GRAPH_THEME.nodes.selectedRing.color,
    haloColor: withAlpha(baseColor, 0.42),
    labelVisibilityPolicy: "local",
  };
}

function buildRealtimeEdgeAttributes(payload: {
  source_id: string;
  target_id: string;
  type?: string;
  weight?: number;
  properties?: Record<string, unknown>;
}): EdgeAttributes {
  const properties = payload.properties || {};
  const isInferred = Boolean(properties.inferred);
  const isBidirectional = graph.hasDirectedEdge(payload.target_id, payload.source_id);
  const baseColor = isInferred ? GRAPH_THEME.palette.accent.path : GRAPH_THEME.palette.muted.edgeStructure;

  return {
    weight: Number(payload.weight ?? 1),
    edgeType: payload.type || "related_to",
    properties,
    size: 1,
    baseSize: 1,
    color: baseColor,
    baseColor,
    mutedColor: GRAPH_THEME.palette.muted.edgeOverview,
    visualPriority: isInferred ? 0.95 : 0.5,
    isBidirectional,
    edgeFamily: isInferred ? "path" : isBidirectional ? "bidirectional" : "line",
    curveGroup: isBidirectional ? [payload.source_id, payload.target_id].sort().join("::") : null,
    type: "line",
    edgeVariant: isInferred ? "pathSignal" : isBidirectional ? "bidirectionalCurve" : "directional",
    arrowVisibilityPolicy: isInferred ? "always" : "contextual",
    relationshipStrength: isInferred ? 0.95 : 0.52,
    isParallelPair: false,
    parallelIndex: 0,
    parallelCount: 1,
  };
}

function buildSelectedNodeState(nodeId: string): GraphSelectedNodeState | null {
  if (!nodeId || !graph.hasNode(nodeId)) {
    return null;
  }

  const attributes = graph.getNodeAttributes(nodeId) as {
    label?: string;
    content?: string;
    nodeType?: string;
    color?: string;
    valid_from?: string | null;
    valid_until?: string | null;
    properties?: Record<string, unknown>;
  };

  return {
    id: nodeId,
    label: String(attributes.label ?? nodeId),
    content: String(attributes.content ?? attributes.label ?? nodeId),
    nodeType: String(attributes.nodeType ?? "Entity"),
    color: typeof attributes.color === "string" ? attributes.color : undefined,
    valid_from: attributes.valid_from ?? null,
    valid_until: attributes.valid_until ?? null,
    properties: attributes.properties ?? {},
    neighborCount: graph.neighbors(nodeId).length,
  };
}

function collectPluginToolbarItems(
  plugins: GraphPlugin[],
  context: GraphPluginContext,
): GraphPluginToolbarItem[] {
  const items: GraphPluginToolbarItem[] = [];

  for (const plugin of plugins) {
    try {
      const nextItems = plugin.toolbarItems?.(context) ?? [];
      items.push(...nextItems);
    } catch (error) {
      console.error(`[GraphPlugin:${plugin.id}] toolbar collection failed`, error);
    }
  }

  return items.sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
}

function collectPluginPanels(
  plugins: GraphPlugin[],
  context: GraphPluginContext,
): GraphPluginPanelDescriptor[] {
  const panels: GraphPluginPanelDescriptor[] = [];

  for (const plugin of plugins) {
    try {
      const result = plugin.renderPanel?.(context);
      if (!result) {
        continue;
      }
      if (Array.isArray(result)) {
        panels.push(...result);
      } else {
        panels.push(result);
      }
    } catch (error) {
      console.error(`[GraphPlugin:${plugin.id}] panel render failed`, error);
    }
  }

  return panels.sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
}

function collectPluginOverlays(
  plugins: GraphPlugin[],
  context: GraphPluginContext,
): GraphPluginOverlayDescriptor[] {
  const overlays: GraphPluginOverlayDescriptor[] = [];

  for (const plugin of plugins) {
    try {
      const result = plugin.renderOverlay?.(context);
      if (!result) {
        continue;
      }
      if (Array.isArray(result)) {
        overlays.push(...result);
      } else {
        overlays.push(result);
      }
    } catch (error) {
      console.error(`[GraphPlugin:${plugin.id}] overlay render failed`, error);
    }
  }

  return overlays.sort((left, right) => {
    if ((left.layer ?? 0) !== (right.layer ?? 0)) {
      return (left.layer ?? 0) - (right.layer ?? 0);
    }
    return (left.order ?? 0) - (right.order ?? 0);
  });
}

function NodePanel({
  nodeId,
  predictions,
  predictionType,
  onPredictionTypeChange,
  onRunPredictions,
  pathTargetId,
  onPathTargetChange,
  onTracePath,
  pathResult,
  onDownloadProvenance,
}: {
  nodeId: string;
  predictions: LinkPrediction[];
  predictionType: string;
  onPredictionTypeChange: (value: string) => void;
  onRunPredictions: () => void;
  pathTargetId: string;
  onPathTargetChange: (value: string) => void;
  onTracePath: () => void;
  pathResult: PathResponse | null;
  onDownloadProvenance: (format: "json" | "markdown") => void;
}) {
  if (!nodeId) {
    return (
      <div style={{ padding: 32, textAlign: "center" }}>
        <p style={{ color: "#8b949e", fontSize: 14, margin: 0 }}>
          Search for a node or click one in the canvas to inspect its properties.
        </p>
      </div>
    );
  }

  const attributes = graph.getNodeAttributes(nodeId) as {
    color?: string;
    content?: string;
    label?: string;
    nodeType?: string;
    valid_from?: string | null;
    valid_until?: string | null;
    properties?: Record<string, unknown>;
  };
  const properties = attributes?.properties ?? {};
  const attribution = sourceAttribution(properties);
  const accentColor = attributes?.color || "#58a6ff";
  const propertyEntries = Object.entries(properties).filter(
    ([key]) =>
      ![
        "x",
        "y",
        "valid_from",
        "valid_until",
        "content",
        "source",
        "source_url",
        "pmid",
        "pmids",
        "evidence",
        "provenance",
        "confidence",
      ].includes(key),
  );

  return (
    <aside style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ borderBottom: "1px solid rgba(88, 166, 255, 0.2)", paddingBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span
            style={{
              background: accentColor,
              boxShadow: `0 0 10px ${accentColor}`,
              width: 8,
              height: 8,
              borderRadius: "50%",
            }}
          />
          <span style={{ color: accentColor, fontSize: 12, fontWeight: 700 }}>{attributes?.nodeType || "Entity"}</span>
        </div>
        <h3 style={{ margin: 0, color: "#fff", fontSize: 20, fontWeight: 700, wordBreak: "break-word" }}>
          {String(attributes?.label ?? nodeId)}
        </h3>
        <div style={{ color: "#8b949e", fontSize: 12, marginTop: 6 }}>{nodeId}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {attributes?.valid_from || attributes?.valid_until ? (
            <span style={subtleChipStyle}>temporal</span>
          ) : null}
          {attribution.length ? <span style={subtleChipStyle}>{attribution.length} source fields</span> : null}
          {predictions.length ? <span style={subtleChipStyle}>{predictions.length} candidate links</span> : null}
        </div>
      </div>

      {(attributes?.valid_from || attributes?.valid_until) && (
        <div
          style={{
            padding: "10px 12px",
            background: "rgba(88, 166, 255, 0.08)",
            border: "1px solid rgba(88, 166, 255, 0.2)",
            borderRadius: 8,
            fontSize: 12,
            color: "#79c0ff",
            fontFamily: "monospace",
          }}
        >
          {attributes?.valid_from ? <div>from: {attributes.valid_from}</div> : null}
          {attributes?.valid_until ? <div>until: {attributes.valid_until}</div> : null}
        </div>
      )}

      <section style={sectionStyle}>
        <div style={sectionTitleStyle}>Actions</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button style={{ ...actionButtonStyle, width: "100%", justifyContent: "center" }} onClick={onRunPredictions}>
            Run Link Prediction
          </button>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={secondaryActionButtonStyle} onClick={() => onDownloadProvenance("json")}>
              Provenance JSON
            </button>
            <button style={secondaryActionButtonStyle} onClick={() => onDownloadProvenance("markdown")}>
              Provenance MD
            </button>
          </div>
        </div>
        <input
          value={predictionType}
          onChange={(event) => onPredictionTypeChange(event.target.value)}
          placeholder="Optional candidate type filter, e.g. disease"
          style={inputStyle}
        />
      </section>

      <section style={sectionStyle}>
        <div style={sectionTitleStyle}>Trace Path</div>
        <input
          value={pathTargetId}
          onChange={(event) => onPathTargetChange(event.target.value)}
          placeholder="Target node ID"
          style={inputStyle}
        />
        <button style={actionButtonStyle} onClick={onTracePath}>Trace Causal Path</button>
        {pathResult?.path?.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
            {pathResult.path.map((step, index) => (
              <div key={`${step}-${index}`} style={pathStepStyle}>{index + 1}. {step}</div>
            ))}
            <div style={{ color: "#79c0ff", fontSize: 12, marginTop: 4 }}>
              total weight: {pathResult.total_weight.toFixed(3)}
            </div>
          </div>
        ) : (
          <div style={emptyTextStyle}>Choose a target or click a candidate prediction to prepare a path trace.</div>
        )}
      </section>

      <details className="node-panel-collapse" open={predictions.length > 0}>
        <summary className="node-panel-summary">Candidate Links</summary>
        <div className="node-panel-body">
          {predictions.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {predictions.map((prediction) => (
                <button
                  key={`${prediction.target}-${prediction.type}`}
                  style={predictionCardStyle}
                  onClick={() => onPathTargetChange(prediction.target)}
                >
                  <div style={{ color: "#fff", fontWeight: 600 }}>{prediction.label || prediction.target}</div>
                  <div style={{ color: "#8b949e", fontSize: 12 }}>{prediction.type}</div>
                  <div style={{ color: "#58a6ff", fontSize: 12, marginTop: 4 }}>
                    confidence {prediction.score.toFixed(3)}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div style={emptyTextStyle}>Run link prediction to surface likely next-hop relationships.</div>
          )}
        </div>
      </details>

      <details className="node-panel-collapse">
        <summary className="node-panel-summary">Source Attribution</summary>
        <div className="node-panel-body">
          {attribution.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {attribution.map(({ key, value }) => (
                <div key={key} style={propertyCardStyle}>
                  <div style={{ color: "rgba(88, 166, 255, 0.7)", fontSize: 11, marginBottom: 4 }}>{key}</div>
                  <div style={{ color: "#e6edf3", fontSize: 13, wordBreak: "break-word" }}>
                    {typeof value === "object" ? JSON.stringify(value) : String(value)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={emptyTextStyle}>No explicit attribution metadata was found on this node.</div>
          )}
        </div>
      </details>

      <details className="node-panel-collapse">
        <summary className="node-panel-summary">Properties</summary>
        <div className="node-panel-body">
          {propertyEntries.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {propertyEntries.map(([key, value]) => (
                <div key={key} style={propertyCardStyle}>
                  <div style={{ color: "rgba(88, 166, 255, 0.7)", fontSize: 11, marginBottom: 4 }}>{key}</div>
                  <div style={{ color: "#e6edf3", fontSize: 13, wordBreak: "break-word" }}>
                    {typeof value === "object" ? JSON.stringify(value) : String(value)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={emptyTextStyle}>No additional properties are attached to this node.</div>
          )}
        </div>
      </details>
    </aside>
  );
}

export function GraphWorkspace() {
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [isLayoutRunning, setIsLayoutRunning] = useState(false);
  const [viewMode, setViewMode] = useState<GraphViewMode>("focused");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState("");
  const [predictionType, setPredictionType] = useState("");
  const [predictions, setPredictions] = useState<LinkPrediction[]>([]);
  const [pathTargetId, setPathTargetId] = useState("");
  const [pathResult, setPathResult] = useState<PathResponse | null>(null);
  const [activeNodeCount, setActiveNodeCount] = useState<number | null>(null);
  const [temporalBounds, setTemporalBounds] = useState<TemporalBounds | null>(null);
  const [scrubberTime, setScrubberTime] = useState<Date | null>(null);
  const [loadingProgress, setLoadingProgress] = useState<GraphLoadProgress | null>(null);
  const [pluginPanelState, setPluginPanelState] = useState<Record<string, boolean>>({
    "legend-panel": false,
    "neighborhood-panel": false,
    "temporal-panel": false,
  });
  const [pluginRuntimeVersion, setPluginRuntimeVersion] = useState(0);

  const debouncedTime = useDebounce(scrubberTime, 150);
  const prevActiveIdsRef = useRef<Set<string>>(new Set());
  const canvasRef = useRef<GraphCanvasHandle>(null);
  const pluginRuntimeRef = useRef<GraphPluginRuntime | null>(null);
  const pluginInteractionStateRef = useRef<GraphInteractionState>({
    hoveredNodeId: null,
    selectedNodeId: "",
    focusedNodeId: "",
    activePath: [],
    viewMode: "focused",
    zoomTier: "overview",
    isLayoutRunning: false,
  });
  const reload = useReloadGraph();

  const { data: summary, isLoading, isFetching, isError, error } = useLoadGraph({
    enabled: true,
    onGraphReady: () => {
      setIsLayoutRunning(true);
      setLoadingProgress(null);
    },
    onProgress: setLoadingProgress,
  });

  useEffect(() => {
    let cancelled = false;
    const loadBounds = async () => {
      try {
        const response = await fetch("/api/temporal/bounds");
        if (!response.ok || cancelled) return;
        const data: TemporalBounds = await response.json();
        if (!cancelled) {
          setTemporalBounds(data);
        }
      } catch {
        if (!cancelled) {
          setTemporalBounds(null);
        }
      }
    };
    loadBounds();
    return () => {
      cancelled = true;
    };
  }, [summary?.nodeCount, summary?.edgeCount]);

  useEffect(() => {
    if (!debouncedTime || isLoading) return;
    let cancelled = false;

    const applySnapshot = async () => {
      try {
        const at = debouncedTime.toISOString();
        const response = await fetch(`/api/temporal/snapshot?at=${encodeURIComponent(at)}`);
        if (!response.ok || cancelled) return;

        const data: { active_node_ids: string[]; active_node_count: number } = await response.json();
        if (cancelled) return;

        const nextActiveIds = new Set(data.active_node_ids);
        requestAnimationFrame(() => {
          if (cancelled) return;
          const previous = prevActiveIdsRef.current;
          previous.forEach((id) => {
            if (!nextActiveIds.has(id) && graph.hasNode(id)) {
              graph.setNodeAttribute(id, "hidden", true);
            }
          });
          nextActiveIds.forEach((id) => {
            if (graph.hasNode(id)) {
              graph.setNodeAttribute(id, "hidden", false);
            }
          });
          prevActiveIdsRef.current = nextActiveIds;
          setActiveNodeCount(data.active_node_count);
          canvasRef.current?.getSigma()?.refresh();
        });
      } catch (fetchError) {
        if (!cancelled) {
          console.error("[Temporal] Snapshot fetch failed", fetchError);
        }
      }
    };

    applySnapshot();
    return () => {
      cancelled = true;
    };
  }, [debouncedTime, isLoading]);

  const focusNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    setPathResult(null);
    if (nodeId) {
      setIsLayoutRunning(false);
    }
  }, []);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchError("");
    try {
      const response = await fetch("/api/graph/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, limit: 8 }),
      });
      if (!response.ok) {
        throw new Error(`Search failed with status ${response.status}`);
      }
      const data = await response.json();
      setSearchResults(data.results || []);
      if (data.results?.length) {
        focusNode(data.results[0].node.id);
      }
    } catch (searchFetchError) {
      setSearchError(searchFetchError instanceof Error ? searchFetchError.message : "Search failed");
    }
  }, [focusNode, searchQuery]);

  const handleRunPredictions = useCallback(async () => {
    if (!selectedNodeId) return;
    try {
      const response = await fetch("/api/enrich/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          node_id: selectedNodeId,
          top_n: 6,
          candidate_type: predictionType || undefined,
          min_score: 0,
        }),
      });
      if (!response.ok) {
        throw new Error(`Link prediction failed with status ${response.status}`);
      }
      const data = await response.json();
      setPredictions(data.predictions || []);
    } catch (predictionError) {
      console.error("[GraphWorkspace] prediction failed", predictionError);
      setPredictions([]);
    }
  }, [predictionType, selectedNodeId]);

  const handleTracePath = useCallback(async () => {
    if (!selectedNodeId || !pathTargetId.trim()) return;
    try {
      const response = await fetch(
        `/api/graph/node/${encodeURIComponent(selectedNodeId)}/path?target=${encodeURIComponent(pathTargetId.trim())}&algorithm=dijkstra`
      );
      if (!response.ok) {
        throw new Error(`Path lookup failed with status ${response.status}`);
      }
      const data: PathResponse = await response.json();
      setPathResult(data);
      if (data.path?.length) {
        const lastStep = data.path[data.path.length - 1];
        if (graph.hasNode(lastStep)) {
          canvasRef.current?.focusNode(lastStep);
        }
      }
    } catch (pathError) {
      console.error("[GraphWorkspace] path trace failed", pathError);
      setPathResult(null);
    }
  }, [pathTargetId, selectedNodeId]);

  const handleDownloadProvenance = useCallback(async (format: "json" | "markdown") => {
    if (!selectedNodeId) return;
    const suffix = format === "markdown" ? "markdown" : "json";
    const response = await fetch(`/api/provenance/report?node_id=${encodeURIComponent(selectedNodeId)}&format=${suffix}`);
    if (!response.ok) {
      throw new Error(`Provenance report failed with status ${response.status}`);
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selectedNodeId}_provenance.${format === "markdown" ? "md" : "json"}`;
    document.body.appendChild(anchor);
    anchor.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(anchor);
  }, [selectedNodeId]);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/graph-updates`);

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.event === "connection_ack") {
          return;
        }
        if (message.event !== "graph_mutation") {
          return;
        }
        const eventType = message.data?.event_type;
        const payload = message.data?.payload;
        if (eventType === "ADD_NODE" && payload?.id) {
          batchMergeNodes([
            {
              id: payload.id,
              attributes: buildRealtimeNodeAttributes(payload),
            },
          ]);
          canvasRef.current?.getSigma()?.refresh();
        }
        if (eventType === "ADD_EDGE") {
          batchMergeEdges([
            {
              source: payload.source_id,
              target: payload.target_id,
              attributes: buildRealtimeEdgeAttributes(payload),
            },
          ]);
          canvasRef.current?.getSigma()?.refresh();
        }
      } catch (socketError) {
        console.error("[GraphWorkspace] websocket update failed", socketError);
      }
    };

    return () => {
      socket.close();
    };
  }, []);

  const searchSummary = useMemo(() => {
    if (!searchResults.length) return null;
    return `${searchResults.length} search result${searchResults.length === 1 ? "" : "s"}`;
  }, [searchResults.length]);

  const focusedSummary = useMemo(() => {
    if (!selectedNodeId || !graph.hasNode(selectedNodeId)) {
      return null;
    }

    const localNeighborCount = graph.neighbors(selectedNodeId).length;
    if (viewMode === "focused") {
      const visibleNeighbors = Math.min(localNeighborCount, 16);
      return `${visibleNeighbors + 1} nodes in focused view`;
    }

    return `${localNeighborCount} direct neighbors highlighted`;
  }, [selectedNodeId, viewMode]);

  const showLoadingOverlay = isLoading || isFetching;
  const hasGraphContent = Boolean(summary?.nodeCount);
  const activePath = pathResult?.path ?? [];
  const graphSummary = summary as GraphLoadSummary | null;
  const selectedNodeState = useMemo(
    () => buildSelectedNodeState(selectedNodeId),
    [selectedNodeId, summary?.nodeCount, summary?.edgeCount],
  );
  const temporalState = useMemo(
    () => ({
      currentTime: scrubberTime,
      activeNodeCount,
      minDate: temporalBounds?.min ?? undefined,
      maxDate: temporalBounds?.max ?? undefined,
    }),
    [activeNodeCount, scrubberTime, temporalBounds?.max, temporalBounds?.min],
  );

  const pluginRegistry = useMemo<GraphPluginRegistryEntry[]>(
    () => [
      { plugin: legendPlugin, enabled: true },
      { plugin: neighborhoodPanelPlugin, enabled: true },
      { plugin: temporalOverlayPlugin, enabled: true },
    ],
    [],
  );
  const activePlugins = useMemo(
    () => pluginRegistry.filter((entry) => entry.enabled !== false).map((entry) => entry.plugin),
    [pluginRegistry],
  );

  const handlePluginAction = useCallback((action: GraphPluginActionRequest) => {
    switch (action.type) {
      case "fitView":
        canvasRef.current?.fitView();
        return;
      case "focusNode":
        canvasRef.current?.focusNode(action.nodeId);
        return;
      case "selectNode":
        focusNode(action.nodeId);
        return;
      case "setViewMode":
        setViewMode(action.viewMode);
        return;
      case "togglePanel":
        setPluginPanelState((current) => ({
          ...current,
          [action.panelId]: !current[action.panelId],
        }));
        return;
      case "openPanel":
        setPluginPanelState((current) => ({
          ...current,
          [action.panelId]: true,
        }));
        return;
      case "closePanel":
        setPluginPanelState((current) => ({
          ...current,
          [action.panelId]: false,
        }));
        return;
    }
  }, [focusNode]);

  const pluginContext = useMemo<GraphPluginContext>(() => ({
    get sigma() {
      return pluginRuntimeRef.current?.sigma ?? null;
    },
    get graph() {
      return graph;
    },
    get displayGraph() {
      return pluginRuntimeRef.current?.displayGraph ?? graph;
    },
    theme: GRAPH_THEME,
    getInteractionState: () => pluginInteractionStateRef.current,
    getSelectedNodeState: () => selectedNodeState,
    getGraphSummary: () => graphSummary,
    getTemporalState: () => temporalState,
    isPanelOpen: (panelId: string) => Boolean(pluginPanelState[panelId]),
    dispatchAction: handlePluginAction,
  }), [graphSummary, handlePluginAction, pluginPanelState, selectedNodeState, temporalState]);

  const handlePluginRuntimeChange = useCallback((runtime: GraphPluginRuntime | null) => {
    pluginRuntimeRef.current = runtime;
    setPluginRuntimeVersion((version) => version + 1);
  }, []);

  const handleInteractionStateChange = useCallback((interactionState: GraphInteractionState) => {
    pluginInteractionStateRef.current = interactionState;
    for (const plugin of activePlugins) {
      try {
        plugin.onStateChange(pluginContext, interactionState);
      } catch (error) {
        console.error(`[GraphPlugin:${plugin.id}] state update failed`, error);
      }
    }
  }, [activePlugins, pluginContext]);

  useEffect(() => {
    if (!pluginRuntimeRef.current) {
      return;
    }

    const mountedPlugins: GraphPlugin[] = [];
    for (const plugin of activePlugins) {
      try {
        plugin.mount(pluginContext);
        mountedPlugins.push(plugin);
      } catch (error) {
        console.error(`[GraphPlugin:${plugin.id}] mount failed`, error);
      }
    }

    return () => {
      for (const plugin of mountedPlugins.reverse()) {
        try {
          plugin.unmount(pluginContext);
        } catch (error) {
          console.error(`[GraphPlugin:${plugin.id}] unmount failed`, error);
        }
      }
    };
  }, [activePlugins, pluginContext, pluginRuntimeVersion]);

  const pluginToolbarItems = useMemo(
    () => collectPluginToolbarItems(activePlugins, pluginContext),
    [activePlugins, pluginContext],
  );
  const pluginPanels = useMemo(
    () => collectPluginPanels(activePlugins, pluginContext),
    [activePlugins, pluginContext],
  );
  const pluginOverlays = useMemo(
    () => collectPluginOverlays(activePlugins, pluginContext),
    [activePlugins, pluginContext],
  );
  const sidePluginPanels = pluginPanels.filter((panel) => panel.placement === "side");
  const bottomPluginPanels = pluginPanels.filter((panel) => panel.placement === "bottom");

  return (
    <div className="palantir-bg" style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <style>{HUD_CSS}</style>
      <div className="palantir-grid" />
      <div className="palantir-vignette" />

      <div style={{ flex: 1, position: "relative", zIndex: 3, minHeight: 0 }}>
        <GraphCanvas
          ref={canvasRef}
          onNodeClick={focusNode}
          selectedNodeId={selectedNodeId}
          activePath={activePath}
          isLayoutRunning={isLayoutRunning}
          viewMode={viewMode}
          pluginOverlays={pluginOverlays.map((overlay) => overlay.element)}
          onPluginRuntimeChange={handlePluginRuntimeChange}
          onInteractionStateChange={handleInteractionStateChange}
        />
        {showLoadingOverlay ? (
          <LoadingOverlay progress={loadingProgress} showGraphBehind={hasGraphContent} />
        ) : null}
      </div>

      <TimelinePanel
        onTimeChange={setScrubberTime}
        minDate={temporalBounds?.min ?? undefined}
        maxDate={temporalBounds?.max ?? undefined}
      />

      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 10 }}>
        <header className="glass-header" style={{ pointerEvents: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", gap: 20 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            {showLoadingOverlay && loadingProgress ? (
              <span style={{ color: "rgba(127, 208, 255, 0.9)", fontSize: 13 }}>{phaseLabel(loadingProgress.phase)}</span>
            ) : null}
            {summary ? (
              <span style={metricPillStyle}>
                {summary.nodeCount.toLocaleString()} nodes · {summary.edgeCount.toLocaleString()} edges
              </span>
            ) : null}
            {activeNodeCount !== null ? (
              <span style={{ ...metricPillStyle, color: "#3fb950", borderColor: "rgba(63, 185, 80, 0.25)" }}>
                {activeNodeCount.toLocaleString()} active at selected time
              </span>
            ) : null}
            {searchSummary ? <span style={metricPillStyle}>{searchSummary}</span> : null}
            {focusedSummary ? (
              <span style={{ ...metricPillStyle, color: "#f2b66d", borderColor: "rgba(242, 182, 109, 0.24)" }}>
                {focusedSummary}
              </span>
            ) : null}
            {isError ? <span style={{ color: "#ff7b72", fontSize: 13 }}>{(error as Error).message}</span> : null}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {selectedNodeId ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  onClick={() => setViewMode("focused")}
                  style={{
                    ...actionButtonStyle,
                    background: viewMode === "focused" ? "rgba(31, 111, 235, 0.38)" : actionButtonStyle.background,
                    borderColor: viewMode === "focused" ? "rgba(127, 208, 255, 0.42)" : "rgba(88, 166, 255, 0.3)",
                  }}
                  title="Inspect the selected node in a local focused graph"
                >
                  Focused View
                </button>
                <button
                  onClick={() => setViewMode("full")}
                  style={{
                    ...actionButtonStyle,
                    background: viewMode === "full" ? "rgba(31, 111, 235, 0.38)" : actionButtonStyle.background,
                    borderColor: viewMode === "full" ? "rgba(127, 208, 255, 0.42)" : "rgba(88, 166, 255, 0.3)",
                  }}
                >
                  Full Graph
                </button>
              </div>
            ) : null}
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleSearch();
                }
              }}
              placeholder="Search a node, e.g. Metformin"
              style={{ ...inputStyle, minWidth: 280, margin: 0 }}
            />
            <button onClick={() => void handleSearch()} style={actionButtonStyle} disabled={showLoadingOverlay}>Search</button>
            <button onClick={() => setIsLayoutRunning((value) => !value)} style={actionButtonStyle} disabled={showLoadingOverlay}>
              {isLayoutRunning ? "Pause Layout" : "Run Layout"}
            </button>
            <button onClick={reload} style={actionButtonStyle} disabled={showLoadingOverlay}>Reload</button>
            {pluginToolbarItems.length ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {pluginToolbarItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={item.onClick}
                    title={item.title}
                      style={{
                        ...secondaryActionButtonStyle,
                        background: item.active ? "rgba(31, 111, 235, 0.28)" : secondaryActionButtonStyle.background,
                        borderColor: item.active ? "rgba(127, 208, 255, 0.35)" : "rgba(255, 255, 255, 0.08)",
                        color: item.active ? "#e6f2ff" : secondaryActionButtonStyle.color,
                      }}
                    >
                      {item.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </header>

        {searchError ? (
          <div style={{ position: "absolute", top: 70, left: 24, color: "#ff7b72", fontSize: 12, pointerEvents: "auto" }}>
            {searchError}
          </div>
        ) : null}

        {searchResults.length ? (
          <div
            className="glass-hud hud-scrollbar"
            style={{ position: "absolute", top: 72, left: 24, width: 320, maxHeight: 280, overflowY: "auto", pointerEvents: "auto", borderRadius: 12, border: "1px solid rgba(88, 166, 255, 0.14)", padding: 12 }}
          >
            <div style={{ color: "#8b949e", fontSize: 12, marginBottom: 8 }}>Search results</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {searchResults.map((result) => (
                <button key={result.node.id} style={predictionCardStyle} onClick={() => focusNode(result.node.id)}>
                  <div style={{ color: "#fff", fontWeight: 600 }}>{result.node.content || result.node.id}</div>
                  <div style={{ color: "#8b949e", fontSize: 12 }}>{result.node.type}</div>
                  <div style={{ color: "#58a6ff", fontSize: 12, marginTop: 4 }}>score {result.score.toFixed(3)}</div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {sidePluginPanels.length ? (
          <div
            className="glass-hud hud-scrollbar"
            style={{
              pointerEvents: "auto",
              position: "absolute",
              left: 24,
              top: searchResults.length ? 370 : 72,
              width: 320,
              maxHeight: selectedNodeId ? 280 : 340,
              overflowY: "auto",
              borderRadius: 14,
              border: "1px solid rgba(88, 166, 255, 0.14)",
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {sidePluginPanels.map((panel) => (
              <div key={panel.id} style={pluginPanelCardStyle}>
                <div style={pluginPanelTitleStyle}>{panel.title}</div>
                {panel.content}
              </div>
            ))}
          </div>
        ) : null}

        {bottomPluginPanels.length ? (
          <div
            style={{
              position: "absolute",
              left: 24,
              bottom: 104,
              width: 340,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              pointerEvents: "auto",
            }}
          >
            {bottomPluginPanels.map((panel) => (
              <div key={panel.id} className="glass-hud" style={{ ...pluginPanelCardStyle, padding: 14 }}>
                <div style={pluginPanelTitleStyle}>{panel.title}</div>
                {panel.content}
              </div>
            ))}
          </div>
        ) : null}

        <div
          className="glass-hud hud-scrollbar"
          style={{
            pointerEvents: "auto",
            position: "absolute",
            right: 0,
            top: 52,
            bottom: 90,
            width: 380,
            overflowY: "auto",
            transition: "transform 0.3s cubic-bezier(0.16,1,0.3,1)",
            transform: selectedNodeId ? "translateX(0)" : "translateX(100%)",
          }}
        >
          <NodePanel
            nodeId={selectedNodeId}
            predictions={predictions}
            predictionType={predictionType}
            onPredictionTypeChange={setPredictionType}
            onRunPredictions={() => void handleRunPredictions()}
            pathTargetId={pathTargetId}
            onPathTargetChange={setPathTargetId}
            onTracePath={() => void handleTracePath()}
            pathResult={pathResult}
            onDownloadProvenance={(format) => void handleDownloadProvenance(format)}
          />
        </div>
      </div>
    </div>
  );
}

const metricPillStyle: React.CSSProperties = {
  background: "rgba(77, 157, 255, 0.09)",
  color: "#7fc6ff",
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 11,
  border: `1px solid ${GRAPH_THEME.palette.background.shellBorder}`,
  backdropFilter: "blur(8px)",
};

const sectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: 14,
  background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))",
  border: "1px solid rgba(255, 255, 255, 0.06)",
  borderRadius: 14,
};

const sectionTitleStyle: React.CSSProperties = {
  color: "#8b949e",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(4, 10, 18, 0.5)",
  border: `1px solid ${GRAPH_THEME.palette.background.shellBorder}`,
  color: "#edf5ff",
  borderRadius: 12,
  padding: "11px 13px",
  fontSize: 13,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
};

const actionButtonStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, rgba(24, 63, 133, 0.42), rgba(35, 85, 176, 0.28))",
  color: "#fff",
  border: `1px solid ${GRAPH_THEME.palette.background.shellBorder}`,
  borderRadius: 12,
  padding: "9px 12px",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 12,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: `0 8px 22px ${GRAPH_THEME.palette.background.shellGlow}`,
};

const secondaryActionButtonStyle: React.CSSProperties = {
  ...actionButtonStyle,
  background: "rgba(255, 255, 255, 0.03)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  color: "#c6d4e3",
  fontWeight: 600,
};

const predictionCardStyle: React.CSSProperties = {
  textAlign: "left",
  padding: 12,
  background: "rgba(88, 166, 255, 0.08)",
  border: "1px solid rgba(88, 166, 255, 0.12)",
  borderRadius: 10,
  cursor: "pointer",
};

const pathStepStyle: React.CSSProperties = {
  color: "#e6edf3",
  fontSize: 13,
  padding: "8px 10px",
  background: "rgba(255, 255, 255, 0.03)",
  borderRadius: 8,
};

const propertyCardStyle: React.CSSProperties = {
  background: "rgba(0, 0, 0, 0.2)",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255, 255, 255, 0.05)",
};

const emptyTextStyle: React.CSSProperties = {
  color: "#8b949e",
  fontSize: 12,
  lineHeight: 1.5,
};

const subtleChipStyle: React.CSSProperties = {
  background: "rgba(255, 255, 255, 0.04)",
  color: "#9fb6d2",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 11,
  border: "1px solid rgba(255, 255, 255, 0.06)",
};

const pluginPanelCardStyle: React.CSSProperties = {
  borderRadius: 14,
  border: "1px solid rgba(88, 166, 255, 0.14)",
  background: "linear-gradient(180deg, rgba(7, 14, 25, 0.76), rgba(10, 18, 31, 0.66))",
  boxShadow: "0 14px 38px rgba(0, 0, 0, 0.24)",
  padding: 14,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const pluginPanelTitleStyle: React.CSSProperties = {
  color: "#f3f7fd",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const loadingMetricStyle: React.CSSProperties = {
  background: "rgba(255, 255, 255, 0.04)",
  color: "#cfe3ff",
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  border: "1px solid rgba(127, 208, 255, 0.12)",
};
