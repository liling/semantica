import type { CSSProperties } from "react";

import { graph } from "../../store/graphStore";
import { GRAPH_THEME } from "./graphTheme";

export type LinkPrediction = {
  target: string;
  type: string;
  label?: string;
  score: number;
};

export type PathResponse = {
  path: string[];
  edge_ids?: string[];
  total_weight: number;
};

export interface GraphInspectorPanelProps {
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
}

const PROVENANCE_KEYS = ["source", "source_url", "pmid", "pmids", "evidence", "provenance", "confidence"] as const;

function sourceAttribution(properties: Record<string, unknown>) {
  return PROVENANCE_KEYS
    .filter((key) => key in properties)
    .map((key) => ({ key, value: properties[key] }));
}

export function GraphInspectorPanel({
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
}: GraphInspectorPanelProps) {
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

const inputStyle: CSSProperties = {
  width: "100%",
  background: "rgba(4, 10, 18, 0.5)",
  border: `1px solid ${GRAPH_THEME.palette.background.shellBorder}`,
  color: "#edf5ff",
  borderRadius: 12,
  padding: "11px 13px",
  fontSize: 13,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
};

const actionButtonStyle: CSSProperties = {
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

const secondaryActionButtonStyle: CSSProperties = {
  ...actionButtonStyle,
  background: "rgba(255, 255, 255, 0.03)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  color: "#c6d4e3",
  fontWeight: 600,
};

const predictionCardStyle: CSSProperties = {
  textAlign: "left",
  padding: 12,
  background: "rgba(88, 166, 255, 0.08)",
  border: "1px solid rgba(88, 166, 255, 0.12)",
  borderRadius: 10,
  cursor: "pointer",
};

const pathStepStyle: CSSProperties = {
  color: "#e6edf3",
  fontSize: 13,
  padding: "8px 10px",
  background: "rgba(255, 255, 255, 0.03)",
  borderRadius: 8,
};

const propertyCardStyle: CSSProperties = {
  background: "rgba(0, 0, 0, 0.2)",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255, 255, 255, 0.05)",
};

const emptyTextStyle: CSSProperties = {
  color: "#8b949e",
  fontSize: 12,
  lineHeight: 1.5,
};

const subtleChipStyle: CSSProperties = {
  background: "rgba(255, 255, 255, 0.04)",
  color: "#9fb6d2",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 11,
  border: "1px solid rgba(255, 255, 255, 0.06)",
};

const sectionStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: 14,
  background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))",
  border: "1px solid rgba(255, 255, 255, 0.06)",
  borderRadius: 14,
};

const sectionTitleStyle: CSSProperties = {
  color: "#8b949e",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};
