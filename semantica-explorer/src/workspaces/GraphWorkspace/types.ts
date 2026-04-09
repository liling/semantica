export type GraphViewMode = "focused" | "full";
export type GraphLayoutSource = "provided" | "carried" | "runtime";
export type GraphLayoutState = "idle" | "bootstrapping" | "running" | "stabilized" | "interactive" | "failed";
export type GraphNodeInteractionState = "default" | "hovered" | "selected" | "neighbor" | "path" | "inactive" | "muted";
export type GraphEdgeInteractionState = "default" | "hovered" | "selected" | "neighbor" | "path" | "inactive" | "muted";

export interface GraphCameraState {
  x: number;
  y: number;
  ratio: number;
}

export interface GraphInteractionState {
  hoveredNodeId: string | null;
  selectedNodeId: string;
  focusedNodeId: string;
  activePath: string[];
  viewMode: GraphViewMode;
  zoomTier: "overview" | "structure" | "inspection";
  isLayoutRunning: boolean;
}

export type GraphEffectToggle =
  | "pathPulseEnabled"
  | "pathFlowEnabled"
  | "lensEnabled"
  | "legendEnabled"
  | "diagnosticsEnabled";

export interface GraphEffectsState {
  pathPulseEnabled: boolean;
  pathFlowEnabled: boolean;
  lensEnabled: boolean;
  legendEnabled: boolean;
  diagnosticsEnabled: boolean;
  lensMode: "neighborhood";
  effectQuality: "bounded";
}

export interface GraphEffectAvailability {
  enabled: boolean;
  available: boolean;
  reason: string;
  detail?: string;
  visibleSegments?: number;
  segmentCap?: number;
}

export interface GraphDiagnosticsSnapshot {
  interactionState: GraphInteractionState;
  activePluginIds: string[];
  openPanelIds: string[];
  effectsState: GraphEffectsState;
  effectAvailability: {
    pathPulse: GraphEffectAvailability;
    pathFlow: GraphEffectAvailability;
    lens: GraphEffectAvailability;
    legend: GraphEffectAvailability;
    diagnostics: GraphEffectAvailability;
  };
}

export interface ApiNode {
  id: string;
  type: string;
  content: string;
  x?: number | null;
  y?: number | null;
  properties: Record<string, unknown>;
  valid_from?: string | null;
  valid_until?: string | null;
}

export interface ApiEdge {
  source: string;
  target: string;
  type: string;
  weight: number;
  properties: Record<string, unknown>;
}

export interface GraphLoadSummary {
  nodeCount: number;
  edgeCount: number;
  loadTimeMs: number;
  hasCoordinates?: boolean;
  layoutSource?: GraphLayoutSource;
  layoutReady?: boolean;
}

export interface GraphLoadProgress {
  phase: "nodes" | "edges" | "styling" | "rendering";
  nodesLoaded: number;
  nodesTotal: number | null;
  edgesLoaded: number;
  edgesTotal: number | null;
  message: string;
  progress: number;
}

export interface GraphDataSnapshot {
  nodes: ApiNode[];
  edges: ApiEdge[];
  summary: GraphLoadSummary;
  fetchedAt: number;
}

export interface GraphLayoutStatus {
  state: GraphLayoutState;
  source: GraphLayoutSource;
  hasCoordinates: boolean;
  layoutReady: boolean;
  displacement: number | null;
  elapsedMs: number;
  stableSamples: number;
  timedOut?: boolean;
}

export type GraphPath = string[];

export interface GraphSelectedNodeState {
  id: string;
  label: string;
  content: string;
  nodeType: string;
  color?: string;
  valid_from?: string | null;
  valid_until?: string | null;
  properties: Record<string, unknown>;
  neighborCount: number;
}

export interface GraphStageHandle {
  fitView: () => void;
  focusNode: (nodeId: string) => void;
}
