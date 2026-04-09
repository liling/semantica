import { useEffect, useMemo, useRef, useCallback, forwardRef, useImperativeHandle, useState, type ReactNode } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import FA2Layout from "graphology-layout-forceatlas2/worker";
import { graph, type EdgeAttributes, type NodeAttributes } from "../../store/graphStore";
import type { GraphBehavior, GraphBehaviorContext, GraphBehaviorActionRequest } from "./behaviors/types";
import { hoverActivationBehavior } from "./behaviors/hoverActivationBehavior";
import { clickSelectionBehavior } from "./behaviors/clickSelectionBehavior";
import { focusCameraBehavior } from "./behaviors/focusCameraBehavior";
import { createSearchFocusBehavior } from "./behaviors/searchFocusBehavior";
import { createPathHighlightBehavior } from "./behaviors/pathHighlightBehavior";
import { fitViewBehavior } from "./behaviors/fitViewBehavior";
import { createViewModeSwitchBehavior } from "./behaviors/viewModeSwitchBehavior";
import {
  GRAPH_THEME,
  getZoomTier,
  type GraphArrowVisibilityPolicy,
  type GraphBadgeKind,
  type GraphEdgeVariant,
  type GraphEdgeVisualState,
  type GraphLabelVisibilityPolicy,
  type GraphNodeShapeVariant,
  type GraphNodeVisualState,
  type GraphTheme,
  type GraphZoomTier,
  withAlpha,
  zoomTierAtLeast,
} from "./graphTheme";
import type {
  GraphCameraState,
  GraphDiagnosticsSnapshot,
  GraphEffectsState,
  GraphInteractionState,
  GraphLayoutStatus,
  GraphViewMode,
} from "./types";
import type { GraphPluginRuntime } from "./plugins";

export type { GraphViewMode } from "./types";

export interface GraphCanvasHandle {
  getSigma: () => Sigma | null;
  fitView: () => void;
  focusNode: (nodeId: string) => void;
}

export interface GraphCanvasProps {
  onNodeClick: (nodeId: string) => void;
  selectedNodeId: string;
  activePath?: string[];
  effectsState: GraphEffectsState;
  isLayoutRunning: boolean;
  onLayoutRunningChange?: (running: boolean) => void;
  layoutSource?: string;
  onLayoutStatusChange?: (status: GraphLayoutStatus) => void;
  viewMode: GraphViewMode;
  className?: string;
  showFitViewButton?: boolean;
  pluginOverlays?: ReactNode[];
  onPluginRuntimeChange?: (runtime: GraphPluginRuntime | null) => void;
  onInteractionStateChange?: (interactionState: GraphInteractionState) => void;
  onDiagnosticsChange?: (effectAvailability: GraphDiagnosticsSnapshot["effectAvailability"]) => void;
}

const FA2_SETTINGS = {
  iterations: 50,
  settings: {
    barnesHutOptimize: true,
    barnesHutTheta: 0.5,
    adjustSizes: false,
    gravity: 1,
    slowDown: 10,
  },
};

const SIGMA_SETTINGS = {
  allowInvalidContainer: true,
  labelRenderedSizeThreshold: 3,
  defaultNodeType: "circle",
  defaultEdgeType: "line",
  hideEdgesOnMove: true,
  webGLTarget: "webgl2" as const,
};

const MAX_FOCUS_NEIGHBORS = GRAPH_THEME.focus.maxNeighbors;
const FOCUS_RING_CAPACITY = GRAPH_THEME.focus.ringCapacity;
const FOCUS_RING_GAP = GRAPH_THEME.focus.ringGap;
const FOCUS_PRIMARY_LABELS = GRAPH_THEME.focus.primaryLabels;

type ResolvedNodeStyle = {
  color: string;
  size: number;
  forceLabel: boolean;
  label: string;
  zIndex: number;
  hidden: boolean;
  borderColor: string;
  borderSize: number;
  nodeVariant: GraphNodeShapeVariant;
  badgeKind?: GraphBadgeKind;
  badgeCount?: number;
  showBadge: boolean;
  showRing: boolean;
  ringColor?: string;
  showHalo: boolean;
  haloColor: string;
};

type ResolvedEdgeStyle = {
  hidden: boolean;
  type?: "line" | "arrow";
  color?: string;
  size?: number;
  zIndex: number;
  edgeVariant: GraphEdgeVariant;
  arrowVisibilityPolicy: GraphArrowVisibilityPolicy;
  curveStrength: number;
  drawCurvedOverlay: boolean;
};

type ViewportPoint = { x: number; y: number };
type PathSegmentOverlay = {
  sourceId: string;
  targetId: string;
  source: ViewportPoint;
  target: ViewportPoint;
  color: string;
  size: number;
  curveStrength: number;
};

function buildPathEdgeSet(path: string[]): Set<string> {
  const edgeIds = new Set<string>();
  for (let index = 0; index < path.length - 1; index += 1) {
    edgeIds.add(`${path[index]}::${path[index + 1]}`);
    edgeIds.add(`${path[index + 1]}::${path[index]}`);
  }
  return edgeIds;
}

function isPointNearViewport(point: ViewportPoint, width: number, height: number, padding = 96) {
  return point.x >= -padding
    && point.y >= -padding
    && point.x <= width + padding
    && point.y <= height + padding;
}

function collectPathSegments(
  sigma: Sigma,
  path: string[],
  zoomTier: GraphZoomTier,
  viewportWidth: number,
  viewportHeight: number,
): PathSegmentOverlay[] {
  const segments: PathSegmentOverlay[] = [];

  for (let index = 0; index < path.length - 1; index += 1) {
    const sourceId = path[index];
    const targetId = path[index + 1];
    const sourceData = sigma.getNodeDisplayData(sourceId);
    const targetData = sigma.getNodeDisplayData(targetId);
    if (!sourceData || !targetData) {
      continue;
    }

    const source = sigma.graphToViewport({ x: sourceData.x, y: sourceData.y });
    const target = sigma.graphToViewport({ x: targetData.x, y: targetData.y });
    if (!isPointNearViewport(source, viewportWidth, viewportHeight) && !isPointNearViewport(target, viewportWidth, viewportHeight)) {
      continue;
    }

    const attrs = graph.hasDirectedEdge(sourceId, targetId)
      ? (graph.getDirectedEdgeAttributes(sourceId, targetId) as EdgeAttributes)
      : ({
          baseColor: GRAPH_THEME.palette.accent.path,
          baseSize: 1.2,
          edgeVariant: "pathSignal",
          arrowVisibilityPolicy: "always",
        } as EdgeAttributes);
    const pathStyle = resolveEdgeElementStyle(GRAPH_THEME, zoomTier, "path", attrs);
    if (!pathStyle.color || !pathStyle.size) {
      continue;
    }

    segments.push({
      sourceId,
      targetId,
      source,
      target,
      color: pathStyle.color,
      size: pathStyle.size,
      curveStrength: pathStyle.curveStrength || GRAPH_THEME.edges.variants.pathSignal.curveStrength,
    });
  }

  return segments;
}

function buildEffectAvailability(
  interactionState: GraphInteractionState,
  effectsState: GraphEffectsState,
  sigma: Sigma | null,
  viewportWidth: number,
  viewportHeight: number,
): GraphDiagnosticsSnapshot["effectAvailability"] {
  const visiblePathSegments = sigma
    ? collectPathSegments(sigma, interactionState.activePath, interactionState.zoomTier, viewportWidth, viewportHeight).length
    : 0;
  const hasActivePath = interactionState.activePath.length > 1;
  const pulseTierReady = zoomTierAtLeast(interactionState.zoomTier, GRAPH_THEME.effects.pathPulse.minZoomTier);
  const flowTierReady = zoomTierAtLeast(interactionState.zoomTier, GRAPH_THEME.effects.pathFlow.minZoomTier);
  const lensTierReady = zoomTierAtLeast(interactionState.zoomTier, GRAPH_THEME.effects.lens.minZoomTier);
  const hasPrimaryNode = Boolean(interactionState.hoveredNodeId || interactionState.selectedNodeId);

  const pathPulse = !effectsState.pathPulseEnabled
    ? { enabled: false, available: false, reason: "Disabled by toggle" }
    : !hasActivePath
      ? { enabled: true, available: false, reason: "No active path" }
      : !pulseTierReady
        ? {
            enabled: true,
            available: false,
            reason: "Disabled by zoom tier",
            detail: `Requires ${GRAPH_THEME.effects.pathPulse.minZoomTier}`,
          }
        : visiblePathSegments === 0
          ? { enabled: true, available: false, reason: "Path is off-screen" }
          : visiblePathSegments > GRAPH_THEME.effects.pathPulse.maxSegments
            ? {
                enabled: true,
                available: false,
                reason: "Disabled by path size cap",
                detail: `${visiblePathSegments} visible segments`,
                visibleSegments: visiblePathSegments,
                segmentCap: GRAPH_THEME.effects.pathPulse.maxSegments,
              }
            : {
                enabled: true,
                available: true,
                reason: "Ready",
                visibleSegments: visiblePathSegments,
                segmentCap: GRAPH_THEME.effects.pathPulse.maxSegments,
              };

  const pathFlow = !effectsState.pathFlowEnabled
    ? { enabled: false, available: false, reason: "Disabled by toggle" }
    : !hasActivePath
      ? { enabled: true, available: false, reason: "No active path" }
      : !flowTierReady
        ? {
            enabled: true,
            available: false,
            reason: "Disabled by zoom tier",
            detail: `Requires ${GRAPH_THEME.effects.pathFlow.minZoomTier}`,
          }
        : visiblePathSegments === 0
          ? { enabled: true, available: false, reason: "Path is off-screen" }
          : visiblePathSegments > GRAPH_THEME.effects.pathFlow.maxSegments
            ? {
                enabled: true,
                available: false,
                reason: "Disabled by path size cap",
                detail: `${visiblePathSegments} visible segments`,
                visibleSegments: visiblePathSegments,
                segmentCap: GRAPH_THEME.effects.pathFlow.maxSegments,
              }
            : {
                enabled: true,
                available: true,
                reason: "Ready",
                visibleSegments: visiblePathSegments,
                segmentCap: GRAPH_THEME.effects.pathFlow.maxSegments,
              };

  const lens = !effectsState.lensEnabled
    ? { enabled: false, available: false, reason: "Disabled by toggle" }
    : !hasPrimaryNode
      ? { enabled: true, available: false, reason: "No focal node" }
      : !lensTierReady
        ? {
            enabled: true,
            available: false,
            reason: "Disabled by zoom tier",
            detail: `Requires ${GRAPH_THEME.effects.lens.minZoomTier}`,
          }
        : { enabled: true, available: true, reason: "Ready" };

  const legend = effectsState.legendEnabled
    ? { enabled: true, available: true, reason: "Panel enabled" }
    : { enabled: false, available: false, reason: "Disabled by toggle" };

  const diagnostics = !GRAPH_THEME.effects.diagnostics.enabledInDev
    ? { enabled: false, available: false, reason: "Disabled in production" }
    : effectsState.diagnosticsEnabled
      ? { enabled: true, available: true, reason: "Ready" }
      : { enabled: false, available: false, reason: "Disabled by toggle" };

  return { pathPulse, pathFlow, lens, legend, diagnostics };
}

function getEdgeWeightBetween(source: string, target: string): number {
  let weight = 0;

  if (graph.hasDirectedEdge(source, target)) {
    const attrs = graph.getDirectedEdgeAttributes(source, target) as { weight?: number };
    weight = Math.max(weight, Number(attrs?.weight ?? 0));
  }

  if (graph.hasDirectedEdge(target, source)) {
    const attrs = graph.getDirectedEdgeAttributes(target, source) as { weight?: number };
    weight = Math.max(weight, Number(attrs?.weight ?? 0));
  }

  return weight;
}

function rankNeighbors(nodeId: string): string[] {
  return graph
    .neighbors(nodeId)
    .map((neighborId) => ({
      id: neighborId,
      weight: getEdgeWeightBetween(nodeId, neighborId),
      degree: graph.degree(neighborId),
    }))
    .sort((left, right) => {
      if (right.weight !== left.weight) {
        return right.weight - left.weight;
      }
      if (right.degree !== left.degree) {
        return right.degree - left.degree;
      }
      return left.id.localeCompare(right.id);
    })
    .map((item) => item.id);
}

function buildFocusSet(nodeId: string): Set<string> {
  const ranked = rankNeighbors(nodeId).slice(0, MAX_FOCUS_NEIGHBORS);
  return new Set<string>([nodeId, ...ranked]);
}

function resolveNodeColor(theme: GraphTheme, state: GraphNodeVisualState, attrs: NodeAttributes, fallbackColor?: string) {
  const baseColor = String(attrs.baseColor || fallbackColor || theme.palette.semantic[0]);

  switch (theme.nodes.states[state].color) {
    case "selected":
      return theme.palette.accent.selected;
    case "hovered":
      return theme.palette.accent.hovered;
    case "path":
      return theme.palette.accent.path;
    case "muted":
      return String(attrs.mutedColor || withAlpha(baseColor, theme.nodes.mutedAlpha));
    case "base":
    default:
      return baseColor;
  }
}

function resolveEdgeColor(theme: GraphTheme, state: GraphEdgeVisualState, attrs: EdgeAttributes, fallbackColor?: string) {
  const baseColor = String(attrs.baseColor || fallbackColor || theme.palette.muted.edgeInspection);

  switch (theme.edges.states[state].color) {
    case "hover":
      return theme.palette.accent.hovered;
    case "path":
      return theme.palette.accent.path;
    case "focus":
      return theme.palette.muted.edgeFocus;
    case "overview":
      return theme.palette.muted.edgeOverview;
    case "structure":
      return theme.palette.muted.edgeStructure;
    case "inspection":
      return theme.palette.muted.edgeInspection;
    case "muted":
      return String(attrs.mutedColor || theme.palette.muted.edgeOverview);
    default:
      return baseColor;
  }
}

function resolveNodeVisualState(
  nodeId: string,
  hoveredNodeId: string | null,
  selectedNodeId: string,
  focusIds: Set<string>,
  pathNodeIds: Set<string>,
): GraphNodeVisualState {
  if (hoveredNodeId && nodeId === hoveredNodeId) {
    return "hovered";
  }
  if (selectedNodeId && nodeId === selectedNodeId) {
    return "selected";
  }
  if (pathNodeIds.has(nodeId)) {
    return "path";
  }
  if (focusIds.has(nodeId)) {
    return "neighbor";
  }
  if (hoveredNodeId || selectedNodeId || pathNodeIds.size > 0) {
    return "muted";
  }
  return "default";
}

function resolveEdgeVisualState(
  source: string,
  target: string,
  hoveredNodeId: string | null,
  selectedNodeId: string,
  focusIds: Set<string>,
  pathEdgeIds: Set<string>,
): GraphEdgeVisualState {
  const edgeKey = `${source}::${target}`;
  const primaryNodeId = hoveredNodeId || selectedNodeId;

  if (pathEdgeIds.has(edgeKey)) {
    return "path";
  }

  if (primaryNodeId && (source === primaryNodeId || target === primaryNodeId)) {
    return hoveredNodeId ? "hovered" : "selected";
  }

  if (focusIds.has(source) && focusIds.has(target)) {
    return "neighbor";
  }

  if (hoveredNodeId || selectedNodeId || pathEdgeIds.size > 0) {
    return "muted";
  }

  return "default";
}

function resolveNodeVariant(state: GraphNodeVisualState, attrs: NodeAttributes): GraphNodeShapeVariant {
  if (state === "selected") {
    return "selected";
  }

  return attrs.nodeShapeVariant || attrs.nodeVariant || "default";
}

function resolveEdgeVariant(state: GraphEdgeVisualState, attrs: EdgeAttributes): GraphEdgeVariant {
  if (state === "path") {
    return "pathSignal";
  }

  if (attrs.edgeVariant) {
    return attrs.edgeVariant;
  }

  if (attrs.isBidirectional) {
    return "bidirectionalCurve";
  }

  if (attrs.arrowVisibilityPolicy === "contextual") {
    return "directional";
  }

  return "line";
}

function shouldForceNodeLabel(
  theme: GraphTheme,
  zoomTier: GraphZoomTier,
  state: GraphNodeVisualState,
  attrs: NodeAttributes,
  labelPriority: number,
): boolean {
  const tierConfig = theme.zoomTiers[zoomTier];
  const forceVisibleState = theme.labels.forceVisibleStates.includes(state);
  const policy = attrs.labelVisibilityPolicy || "priority";

  if (forceVisibleState || theme.nodes.states[state].forceLabel) {
    return true;
  }

  switch (policy as GraphLabelVisibilityPolicy) {
    case "always":
      return true;
    case "local":
      return zoomTier !== "overview" && state !== "default" && state !== "muted" && state !== "inactive";
    case "priority":
      return labelPriority >= tierConfig.labelThreshold;
    case "none":
    default:
      return false;
  }
}

function resolveNodeBorderColor(
  theme: GraphTheme,
  state: GraphNodeVisualState,
  variant: GraphNodeShapeVariant,
  attrs: NodeAttributes,
  baseColor: string,
) {
  if (state === "selected" || variant === "selected") {
    return attrs.ringColor || theme.nodes.selectedRing.color;
  }
  if (state === "hovered") {
    return theme.palette.accent.hovered;
  }
  if (state === "path") {
    return theme.palette.accent.path;
  }
  if (state === "muted" || state === "inactive") {
    return withAlpha(attrs.strokeColor || attrs.borderColor || theme.palette.background.nodeBorder, 0.7);
  }

  if (variant === "temporal") {
    return theme.palette.accent.temporal;
  }
  if (variant === "provenance") {
    return theme.palette.accent.provenance;
  }
  if (variant === "inferred") {
    return theme.palette.accent.inferred;
  }

  return attrs.strokeColor || attrs.borderColor || theme.palette.background.nodeBorder || baseColor;
}

function resolveNodeElementStyle(
  theme: GraphTheme,
  zoomTier: GraphZoomTier,
  state: GraphNodeVisualState,
  attrs: NodeAttributes,
  label: string,
): ResolvedNodeStyle {
  const tierConfig = theme.zoomTiers[zoomTier];
  const stateConfig = theme.nodes.states[state];
  const nodeVariant = resolveNodeVariant(state, attrs);
  const variantConfig = theme.nodes.variants[nodeVariant];
  const baseSize = Number(attrs.baseSize || attrs.size || 4);
  const labelPriority = Number(attrs.labelPriority ?? 0);
  const color = resolveNodeColor(theme, state, attrs, attrs.color);
  const sizeMultiplier = (state === "default" ? tierConfig.nodeScale : stateConfig.sizeMultiplier) * variantConfig.sizeMultiplier;
  const forceLabel = shouldForceNodeLabel(theme, zoomTier, state, attrs, labelPriority);
  const badgeKind = attrs.badgeKind || variantConfig.badgeKind;
  const forceVisibleState = theme.labels.forceVisibleStates.includes(state);
  const showBadge = Boolean(
    badgeKind
    && (forceVisibleState || (tierConfig.showBadges && zoomTierAtLeast(zoomTier, variantConfig.badgeVisibleFrom)))
    && state !== "muted"
    && state !== "inactive",
  );
  const showRing = state === "selected" && zoomTierAtLeast(zoomTier, theme.nodes.selectedRing.visibleFrom);
  const showHalo = state === "hovered" || state === "selected" || state === "path";
  const strokeBase = state === "muted" || state === "inactive"
    ? theme.nodes.strokeHierarchy[zoomTier].muted
    : forceVisibleState
      ? theme.nodes.strokeHierarchy[zoomTier].emphasis
      : theme.nodes.strokeHierarchy[zoomTier].base;

  return {
    color,
    size: Math.max(baseSize * sizeMultiplier, stateConfig.minSize),
    forceLabel,
    label: forceLabel ? label : "",
    zIndex: forceLabel && stateConfig.zIndex === 0 ? 1 : stateConfig.zIndex,
    hidden: false,
    borderColor: resolveNodeBorderColor(theme, state, nodeVariant, attrs, color),
    borderSize: Math.max(
      0.4,
      Number(attrs.borderSize ?? 0.85) + strokeBase + stateConfig.borderBoost + variantConfig.borderBoost - 0.8,
    ),
    nodeVariant,
    badgeKind,
    badgeCount: attrs.badgeCount,
    showBadge,
    showRing,
    ringColor: attrs.ringColor || theme.nodes.selectedRing.color,
    showHalo,
    haloColor: attrs.haloColor || attrs.glowColor || withAlpha(color, theme.overlays.hoverGlowAlpha + variantConfig.haloBoost),
  };
}

function resolveEdgeType(
  theme: GraphTheme,
  zoomTier: GraphZoomTier,
  state: GraphEdgeVisualState,
  variant: GraphEdgeVariant,
  attrs: EdgeAttributes,
): "line" | "arrow" {
  const variantConfig = theme.edges.variants[variant];

  if (theme.edges.states[state].forceArrow || variantConfig.arrowPolicy === "always") {
    return "arrow";
  }

  if (variantConfig.arrowPolicy === "contextual" && theme.zoomTiers[zoomTier].showContextualArrows) {
    return "arrow";
  }

  if (state !== "default") {
    return (attrs.type as "line" | "arrow" | undefined) || variantConfig.baseType;
  }

  return Number(attrs.visualPriority ?? 0) >= theme.zoomTiers[zoomTier].arrowPriorityThreshold && theme.zoomTiers[zoomTier].showContextualArrows
    ? "arrow"
    : "line";
}

function resolveEdgeElementStyle(
  theme: GraphTheme,
  zoomTier: GraphZoomTier,
  state: GraphEdgeVisualState,
  attrs: EdgeAttributes,
): ResolvedEdgeStyle {
  const tierConfig = theme.zoomTiers[zoomTier];
  const stateConfig = theme.edges.states[state];
  const edgeVariant = resolveEdgeVariant(state, attrs);
  const variantConfig = theme.edges.variants[edgeVariant];
  const baseSize = Number(attrs.baseSize || attrs.size || 0.9);
  const visualPriority = Number(attrs.visualPriority ?? 0);
  const belowPriorityThreshold = state === "default"
    && visualPriority < tierConfig.edgePriorityThreshold
    && edgeVariant === "line";

  if (stateConfig.hide || belowPriorityThreshold) {
    return {
      hidden: true,
      zIndex: 0,
      edgeVariant,
      arrowVisibilityPolicy: variantConfig.arrowPolicy,
      curveStrength: variantConfig.curveStrength,
      drawCurvedOverlay: false,
    };
  }

  const sizeMultiplier = (state === "default" ? tierConfig.edgeSizeScale : stateConfig.sizeMultiplier) * variantConfig.sizeMultiplier;
  const drawCurvedOverlay = tierConfig.showCurves
    && (edgeVariant === "bidirectionalCurve" || edgeVariant === "parallelCurve" || edgeVariant === "pathSignal")
    && zoomTier !== "overview";

  return {
    hidden: false,
    type: resolveEdgeType(theme, zoomTier, state, edgeVariant, attrs),
    color: resolveEdgeColor(theme, state, attrs, attrs.color),
    size: Math.max(baseSize * sizeMultiplier, stateConfig.minSize),
    zIndex: stateConfig.zIndex,
    edgeVariant,
    arrowVisibilityPolicy: variantConfig.arrowPolicy,
    curveStrength: variantConfig.curveStrength,
    drawCurvedOverlay,
  };
}

function createFocusedGraph(nodeId: string, activePath: string[]): Graph<NodeAttributes, EdgeAttributes> {
  const focused = new Graph<NodeAttributes, EdgeAttributes>({
    type: "directed",
    multi: false,
    allowSelfLoops: false,
  });

  const rankedNeighbors = rankNeighbors(nodeId).slice(0, MAX_FOCUS_NEIGHBORS);
  const focusIds = new Set<string>([nodeId, ...rankedNeighbors]);
  const labelledNeighborIds = new Set(rankedNeighbors.slice(0, FOCUS_PRIMARY_LABELS));
  const pathNodeIds = new Set(activePath);
  const pathEdgeIds = buildPathEdgeSet(activePath);

  const addNode = (id: string, attrs: NodeAttributes) => {
    if (!focused.hasNode(id)) {
      focused.addNode(id, attrs);
    }
  };

  const selectedAttrs = graph.getNodeAttributes(nodeId) as NodeAttributes;
  const selectedState = resolveNodeElementStyle(GRAPH_THEME, "inspection", "selected", selectedAttrs, selectedAttrs.label);
  addNode(nodeId, {
    ...selectedAttrs,
    x: 0,
    y: 0,
    color: selectedState.color,
    size: Math.max(selectedState.size, 22),
    label: selectedState.label,
  });

  rankedNeighbors.forEach((neighborId, index) => {
    const baseAttrs = graph.getNodeAttributes(neighborId) as NodeAttributes;
    const ring = Math.floor(index / FOCUS_RING_CAPACITY);
    const ringIndex = index % FOCUS_RING_CAPACITY;
    const itemsInRing = Math.min(
      FOCUS_RING_CAPACITY,
      rankedNeighbors.length - ring * FOCUS_RING_CAPACITY,
    );
    const radius = FOCUS_RING_GAP * (ring + 1);
    const angle = (Math.PI * 2 * ringIndex) / itemsInRing - Math.PI / 2;
    const visualState: GraphNodeVisualState = pathNodeIds.has(neighborId)
      ? "path"
      : labelledNeighborIds.has(neighborId)
        ? "neighbor"
        : "default";
    const style = resolveNodeElementStyle(
      GRAPH_THEME,
      "inspection",
      visualState,
      {
        ...baseAttrs,
        labelPriority: labelledNeighborIds.has(neighborId) || pathNodeIds.has(neighborId)
          ? Math.max(Number(baseAttrs.labelPriority ?? 0), 1)
          : 0,
      },
      baseAttrs.label,
    );

    addNode(neighborId, {
      ...baseAttrs,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      color: style.color,
      size: Math.max(style.size, 8.5),
      label: style.label,
    });
  });

  for (const source of focusIds) {
    for (const target of focusIds) {
      if (source === target || !graph.hasDirectedEdge(source, target)) {
        continue;
      }
      const attrs = graph.getDirectedEdgeAttributes(source, target) as EdgeAttributes;
      const state: GraphEdgeVisualState = pathEdgeIds.has(`${source}::${target}`)
        ? "path"
        : source === nodeId || target === nodeId
          ? "selected"
          : "neighbor";
      const style = resolveEdgeElementStyle(GRAPH_THEME, "inspection", state, attrs);
      focused.mergeDirectedEdge(source, target, {
        ...attrs,
        type: style.type,
        size: style.size,
        color: style.color,
      });
    }
  }

  return focused;
}

function drawGlowHalo(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
) {
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

function drawNodeRing(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  width: number,
  glowAlpha: number,
) {
  context.strokeStyle = withAlpha(color, glowAlpha);
  context.lineWidth = width * 2.4;
  context.beginPath();
  context.arc(x, y, radius + width * 1.9, 0, Math.PI * 2);
  context.stroke();

  context.strokeStyle = color;
  context.lineWidth = width;
  context.beginPath();
  context.arc(x, y, radius + width * 1.45, 0, Math.PI * 2);
  context.stroke();
}

function drawNodeBadge(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  nodeRadius: number,
  badgeKind: GraphBadgeKind,
  badgeCount: number | undefined,
) {
  const badgeTheme = GRAPH_THEME.nodes.badges[badgeKind];
  const radius = GRAPH_THEME.nodes.badge.radius;
  const offset = GRAPH_THEME.nodes.badge.offset;
  const badgeX = x + Math.max(nodeRadius * 0.62, radius + offset);
  const badgeY = y - Math.max(nodeRadius * 0.62, radius + offset);

  drawGlowHalo(
    context,
    badgeX,
    badgeY,
    GRAPH_THEME.overlays.badgeGlowRadius,
    withAlpha(badgeTheme.color, GRAPH_THEME.nodes.badge.glowAlpha),
  );

  context.fillStyle = badgeTheme.color;
  context.beginPath();
  context.arc(badgeX, badgeY, radius, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = GRAPH_THEME.nodes.badge.stroke;
  context.lineWidth = 1;
  context.beginPath();
  context.arc(badgeX, badgeY, radius, 0, Math.PI * 2);
  context.stroke();

  context.fillStyle = GRAPH_THEME.nodes.badge.textColor;
  context.font = `700 ${GRAPH_THEME.nodes.badge.fontSize}px Inter, system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const label = badgeKind === "provenance" && badgeCount && badgeCount > 1
    ? String(Math.min(9, badgeCount))
    : badgeTheme.label;
  context.fillText(label, badgeX, badgeY + 0.5);
}

function drawCurvedEdge(
  context: CanvasRenderingContext2D,
  source: { x: number; y: number },
  target: { x: number; y: number },
  color: string,
  width: number,
  curvature: number,
  glowAlpha: number,
) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.max(Math.hypot(dx, dy), 1);
  const nx = -dy / length;
  const ny = dx / length;
  const curveOffset = length * curvature;
  const controlX = (source.x + target.x) / 2 + nx * curveOffset;
  const controlY = (source.y + target.y) / 2 + ny * curveOffset;

  context.strokeStyle = withAlpha(color, glowAlpha);
  context.lineWidth = width + GRAPH_THEME.overlays.curveGlowWidth;
  context.beginPath();
  context.moveTo(source.x, source.y);
  context.quadraticCurveTo(controlX, controlY, target.x, target.y);
  context.stroke();

  context.strokeStyle = color;
  context.lineWidth = width;
  context.beginPath();
  context.moveTo(source.x, source.y);
  context.quadraticCurveTo(controlX, controlY, target.x, target.y);
  context.stroke();
}

function drawPathPulseOverlay(
  context: CanvasRenderingContext2D,
  segments: PathSegmentOverlay[],
  now: number,
) {
  segments.forEach((segment, index) => {
    const t = ((now * GRAPH_THEME.effects.pathPulse.speed) + index * 0.17) % 1;
    const x = segment.source.x + (segment.target.x - segment.source.x) * t;
    const y = segment.source.y + (segment.target.y - segment.source.y) * t;
    const glow = context.createRadialGradient(x, y, 0, x, y, GRAPH_THEME.effects.pathPulse.radius);
    glow.addColorStop(0, withAlpha(GRAPH_THEME.palette.accent.path, GRAPH_THEME.effects.pathPulse.glowAlpha));
    glow.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = glow;
    context.beginPath();
    context.arc(x, y, GRAPH_THEME.effects.pathPulse.radius, 0, Math.PI * 2);
    context.fill();
  });
}

function drawPathFlowAccentOverlay(
  context: CanvasRenderingContext2D,
  segments: PathSegmentOverlay[],
  now: number,
) {
  segments.forEach((segment, index) => {
    const t = ((now * GRAPH_THEME.effects.pathFlow.speed) + index * GRAPH_THEME.effects.pathFlow.spacing) % 1;
    const headX = segment.source.x + (segment.target.x - segment.source.x) * t;
    const headY = segment.source.y + (segment.target.y - segment.source.y) * t;
    const tailT = Math.max(0, t - 0.08);
    const tailX = segment.source.x + (segment.target.x - segment.source.x) * tailT;
    const tailY = segment.source.y + (segment.target.y - segment.source.y) * tailT;

    context.strokeStyle = withAlpha(segment.color, 0.28);
    context.lineWidth = Math.max(segment.size + 3.6, 4.6);
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(tailX, tailY);
    context.lineTo(headX, headY);
    context.stroke();

    context.strokeStyle = withAlpha(GRAPH_THEME.palette.accent.selected, GRAPH_THEME.effects.pathFlow.opacity);
    context.lineWidth = Math.max(segment.size + 1.3, 2.4);
    context.beginPath();
    context.moveTo(tailX, tailY);
    context.lineTo(headX, headY);
    context.stroke();

    drawGlowHalo(
      context,
      headX,
      headY,
      GRAPH_THEME.effects.pathFlow.radius,
      withAlpha(GRAPH_THEME.palette.accent.selected, 0.32),
    );
  });
}

function drawNeighborhoodLensOverlay(
  context: CanvasRenderingContext2D,
  sigma: Sigma,
  primaryNodeId: string,
  focusIds: Set<string>,
) {
  const primaryData = sigma.getNodeDisplayData(primaryNodeId);
  if (!primaryData) {
    return;
  }

  const center = sigma.graphToViewport({ x: primaryData.x, y: primaryData.y });
  drawGlowHalo(
    context,
    center.x,
    center.y,
    GRAPH_THEME.effects.lens.radius,
    withAlpha(GRAPH_THEME.palette.accent.hovered, GRAPH_THEME.effects.lens.glowAlpha),
  );

  focusIds.forEach((neighborId) => {
    if (neighborId === primaryNodeId || !graph.hasNode(neighborId)) {
      return;
    }

    if (
      !graph.hasDirectedEdge(primaryNodeId, neighborId)
      && !graph.hasDirectedEdge(neighborId, primaryNodeId)
    ) {
      return;
    }

    const neighborData = sigma.getNodeDisplayData(neighborId);
    if (!neighborData) {
      return;
    }

    const neighborPoint = sigma.graphToViewport({ x: neighborData.x, y: neighborData.y });
    context.strokeStyle = withAlpha(GRAPH_THEME.palette.accent.hovered, GRAPH_THEME.effects.lens.edgeAlpha * 0.38);
    context.lineWidth = GRAPH_THEME.effects.lens.edgeLineWidth + 3.2;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(center.x, center.y);
    context.lineTo(neighborPoint.x, neighborPoint.y);
    context.stroke();

    context.strokeStyle = withAlpha(GRAPH_THEME.palette.accent.hovered, GRAPH_THEME.effects.lens.edgeAlpha);
    context.lineWidth = GRAPH_THEME.effects.lens.edgeLineWidth;
    context.beginPath();
    context.moveTo(center.x, center.y);
    context.lineTo(neighborPoint.x, neighborPoint.y);
    context.stroke();

    drawGlowHalo(
      context,
      neighborPoint.x,
      neighborPoint.y,
      GRAPH_THEME.effects.lens.feather * 0.18,
      withAlpha(GRAPH_THEME.palette.accent.hovered, 0.12),
    );
  });
}

function applySceneState(
  sigma: Sigma,
  interactionState: GraphInteractionState,
) {
  const { zoomTier, hoveredNodeId, selectedNodeId, activePath } = interactionState;
  const primaryNodeId = hoveredNodeId || selectedNodeId;
  const focusIds = primaryNodeId && graph.hasNode(primaryNodeId) ? buildFocusSet(primaryNodeId) : new Set<string>();
  const pathNodeIds = new Set(activePath);
  const pathEdgeIds = buildPathEdgeSet(activePath);

  sigma.setSetting("nodeReducer", (node, data) => {
    const attrs = data as NodeAttributes;
    const state = resolveNodeVisualState(node, hoveredNodeId, selectedNodeId, focusIds, pathNodeIds);
    const style = resolveNodeElementStyle(GRAPH_THEME, zoomTier, state, attrs, data.label);

    return {
      ...data,
      color: style.color,
      size: style.size,
      forceLabel: style.forceLabel,
      label: style.label,
      zIndex: style.zIndex,
      hidden: style.hidden,
      borderColor: style.borderColor,
      borderSize: style.borderSize,
    };
  });

  sigma.setSetting("edgeReducer", (edge, data) => {
    const attrs = data as EdgeAttributes;
    const [source, target] = graph.extremities(edge);
    const state = resolveEdgeVisualState(source, target, hoveredNodeId, selectedNodeId, focusIds, pathEdgeIds);
    const style = resolveEdgeElementStyle(GRAPH_THEME, zoomTier, state, attrs);

    return {
      ...data,
      hidden: style.hidden,
      type: style.type,
      color: style.color,
      size: style.size,
      zIndex: style.zIndex,
    };
  });

  sigma.refresh();
}

function createInteractionState(
  hoveredNodeId: string | null,
  selectedNodeId: string,
  activePath: string[],
  viewMode: GraphViewMode,
  zoomTier: GraphZoomTier,
  isLayoutRunning: boolean,
): GraphInteractionState {
  return {
    hoveredNodeId,
    selectedNodeId,
    focusedNodeId: selectedNodeId,
    activePath,
    viewMode,
    zoomTier,
    isLayoutRunning,
  };
}

function dispatchBehaviorAction(
  behaviors: GraphBehavior[],
  context: GraphBehaviorContext,
  action: GraphBehaviorActionRequest,
) {
  for (const behavior of behaviors) {
    if (behavior.performAction?.(context, action)) {
      return;
    }
  }
}

export const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(
  function GraphCanvas(
    {
      onNodeClick,
      selectedNodeId,
      activePath = [],
      effectsState,
      isLayoutRunning,
      viewMode,
      className,
      showFitViewButton = true,
      pluginOverlays = [],
      onPluginRuntimeChange,
      onInteractionStateChange,
      onDiagnosticsChange,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const overlayRef = useRef<HTMLCanvasElement>(null);
    const sigmaRef = useRef<Sigma | null>(null);
    const fa2Ref = useRef<FA2Layout | null>(null);
    const behaviorContextRef = useRef<GraphBehaviorContext | null>(null);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [zoomTier, setZoomTier] = useState<GraphZoomTier>("overview");

    const behaviors = useMemo<GraphBehavior[]>(
      () => [
        hoverActivationBehavior,
        clickSelectionBehavior,
        focusCameraBehavior,
        createSearchFocusBehavior(),
        createPathHighlightBehavior(),
        fitViewBehavior,
        createViewModeSwitchBehavior(),
      ],
      [],
    );

    const isFocusedView = viewMode === "focused" && Boolean(selectedNodeId) && graph.hasNode(selectedNodeId);
    const displayGraph = useMemo(() => {
      if (isFocusedView && selectedNodeId) {
        return createFocusedGraph(selectedNodeId, activePath);
      }
      return graph;
    }, [activePath, isFocusedView, selectedNodeId]);

    const interactionState = useMemo(
      () => createInteractionState(hoveredNodeId, selectedNodeId, activePath, viewMode, zoomTier, isLayoutRunning),
      [activePath, hoveredNodeId, isLayoutRunning, selectedNodeId, viewMode, zoomTier],
    );
    const interactionStateRef = useRef<GraphInteractionState>(interactionState);
    interactionStateRef.current = interactionState;

    const focusNodeInView = useCallback((nodeId: string) => {
      const sigma = sigmaRef.current;
      if (!sigma) {
        return;
      }

      if (isFocusedView) {
        sigma.getCamera().animatedReset({ duration: GRAPH_THEME.motion.cameraMs });
        sigma.refresh();
        return;
      }

      const data = sigma.getNodeDisplayData(nodeId);
      if (!data) {
        sigma.getCamera().animatedReset({ duration: GRAPH_THEME.motion.cameraMs });
        return;
      }

      void sigma.getCamera().animate(
        { x: data.x, y: data.y, ratio: 0.3 },
        { duration: GRAPH_THEME.motion.cameraMs, easing: "quadraticOut" },
      );
    }, [isFocusedView]);

    const fitCurrentView = useCallback(() => {
      const sigma = sigmaRef.current;
      if (!sigma) {
        return;
      }

      if (selectedNodeId) {
        focusNodeInView(selectedNodeId);
        return;
      }

      sigma.getCamera().animatedReset({ duration: GRAPH_THEME.motion.cameraMs });
    }, [focusNodeInView, selectedNodeId]);

    const dispatchAction = useCallback((action: GraphBehaviorActionRequest) => {
      const context = behaviorContextRef.current;
      if (!context) {
        return;
      }

      dispatchBehaviorAction(behaviors, context, action);
    }, [behaviors]);

    const getBehaviorContext = useCallback((sigma?: Sigma | null): GraphBehaviorContext | null => {
      const runtimeSigma = sigma ?? sigmaRef.current;
      if (!runtimeSigma) {
        return null;
      }

      const context: GraphBehaviorContext = {
        sigma: runtimeSigma,
        graph,
        displayGraph,
        getInteractionState: () => interactionStateRef.current,
        setHoveredNodeId,
        onNodeSelectionChange: onNodeClick,
        focusNodeInView,
        fitCurrentView,
        dispatchAction,
      };
      behaviorContextRef.current = context;
      return context;
    }, [displayGraph, dispatchAction, fitCurrentView, focusNodeInView, onNodeClick]);

    const dispatchToBehaviors = useCallback((
      hook: "onNodeEnter" | "onNodeLeave" | "onNodeClick" | "onStageClick" | "onCameraChange",
      ...args: unknown[]
    ) => {
      const context = getBehaviorContext();
      if (!context) {
        return;
      }

      for (const behavior of behaviors) {
        const handler = behavior[hook];
        if (typeof handler === "function") {
          (handler as (...handlerArgs: unknown[]) => void)(context, ...args);
        }
      }
    }, [behaviors, getBehaviorContext]);

    useImperativeHandle(ref, () => ({
      getSigma: () => sigmaRef.current,
      fitView: () => dispatchAction({ type: "fitView" }),
      focusNode: (nodeId: string) => dispatchAction({ type: "focusNode", nodeId }),
    }), [dispatchAction]);

    useEffect(() => {
      if (!containerRef.current) return;

      const sigma = new Sigma(displayGraph, containerRef.current, SIGMA_SETTINGS);
      sigmaRef.current = sigma;
      onPluginRuntimeChange?.({
        sigma,
        graph,
        displayGraph,
      });
      const camera = sigma.getCamera();
      const context = getBehaviorContext(sigma);

      if (context) {
        for (const behavior of behaviors) {
          behavior.attach(context);
        }
      }

      const syncTier = () => {
        const cameraState: GraphCameraState = {
          x: camera.getState().x,
          y: camera.getState().y,
          ratio: camera.getState().ratio,
        };
        const nextTier = getZoomTier(cameraState.ratio);
        setZoomTier((current) => (current === nextTier ? current : nextTier));
        dispatchToBehaviors("onCameraChange", cameraState);
      };

      const resizeObserver = new ResizeObserver(() => {
        if (containerRef.current && containerRef.current.offsetWidth > 0) {
          sigma.refresh();
        }
      });
      resizeObserver.observe(containerRef.current);

      camera.on("updated", syncTier);
      sigma.on("clickNode", ({ node }) => dispatchToBehaviors("onNodeClick", node));
      sigma.on("clickStage", () => dispatchToBehaviors("onStageClick"));
      sigma.on("enterNode", ({ node }) => dispatchToBehaviors("onNodeEnter", node));
      sigma.on("leaveNode", ({ node }) => dispatchToBehaviors("onNodeLeave", node));

      requestAnimationFrame(() => {
        syncTier();
        dispatchAction({ type: "fitView" });
      });

      return () => {
        if (context) {
          for (const behavior of behaviors) {
            behavior.detach(context);
          }
        }
        camera.off("updated", syncTier);
        resizeObserver.disconnect();
        sigma.kill();
        behaviorContextRef.current = null;
        sigmaRef.current = null;
        onPluginRuntimeChange?.(null);
      };
    }, [behaviors, dispatchAction, dispatchToBehaviors, displayGraph, getBehaviorContext, onPluginRuntimeChange]);

    useEffect(() => {
      const context = getBehaviorContext();
      if (!context) {
        return;
      }

      for (const behavior of behaviors) {
        behavior.onStateChange?.(context, interactionState);
      }

      for (const behavior of behaviors) {
        behavior.apply?.(context, interactionState);
      }
      onInteractionStateChange?.(interactionState);
    }, [behaviors, getBehaviorContext, interactionState, onInteractionStateChange]);

    useEffect(() => {
      if (!onDiagnosticsChange) {
        return;
      }

      const sigma = sigmaRef.current;
      const container = containerRef.current;
      const availability = buildEffectAvailability(
        interactionState,
        effectsState,
        sigma,
        container?.clientWidth ?? 0,
        container?.clientHeight ?? 0,
      );
      onDiagnosticsChange(availability);
    }, [effectsState, interactionState, onDiagnosticsChange]);

    useEffect(() => {
      const sigma = sigmaRef.current;
      if (!sigma || displayGraph !== graph) {
        return;
      }
      applySceneState(sigma, interactionState);
    }, [displayGraph, interactionState]);

    useEffect(() => {
      const sigma = sigmaRef.current;
      const overlay = overlayRef.current;
      const container = containerRef.current;
      if (!sigma || !overlay || !container) {
        return;
      }

      let frame = 0;

      const draw = () => {
        const rect = container.getBoundingClientRect();
        const pixelRatio = window.devicePixelRatio || 1;
        if (overlay.width !== Math.floor(rect.width * pixelRatio) || overlay.height !== Math.floor(rect.height * pixelRatio)) {
          overlay.width = Math.floor(rect.width * pixelRatio);
          overlay.height = Math.floor(rect.height * pixelRatio);
          overlay.style.width = `${rect.width}px`;
          overlay.style.height = `${rect.height}px`;
        }

        const context = overlay.getContext("2d");
        if (!context) {
          frame = window.requestAnimationFrame(draw);
          return;
        }

        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        context.clearRect(0, 0, rect.width, rect.height);

        const primaryNodeId = interactionState.hoveredNodeId || interactionState.selectedNodeId;
        const focusIds = primaryNodeId && graph.hasNode(primaryNodeId) ? buildFocusSet(primaryNodeId) : new Set<string>();
        const pathNodeIds = new Set(interactionState.activePath);
        const pathSegments = collectPathSegments(sigma, interactionState.activePath, interactionState.zoomTier, rect.width, rect.height);
        const effectAvailability = buildEffectAvailability(
          interactionState,
          effectsState,
          sigma,
          rect.width,
          rect.height,
        );
        const nodesToDecorate = new Set<string>([
          ...focusIds,
          ...pathNodeIds,
          ...(primaryNodeId ? [primaryNodeId] : []),
        ]);
        const now = performance.now() / 1000;

        nodesToDecorate.forEach((nodeId) => {
          const displayData = sigma.getNodeDisplayData(nodeId);
          if (!displayData) return;
          const attrs = graph.getNodeAttributes(nodeId) as NodeAttributes;
          const state = resolveNodeVisualState(nodeId, interactionState.hoveredNodeId, interactionState.selectedNodeId, focusIds, pathNodeIds);
          const style = resolveNodeElementStyle(GRAPH_THEME, interactionState.zoomTier, state, attrs, attrs.label);
          const point = sigma.graphToViewport({ x: displayData.x, y: displayData.y });
          if (style.showHalo) {
            const radius = Math.max(
              displayData.size * GRAPH_THEME.overlays.glowRadiusMultiplier * (style.nodeVariant === "selected" ? 1.08 : 1),
              GRAPH_THEME.overlays.minGlowRadius,
            );
            drawGlowHalo(
              context,
              point.x,
              point.y,
              radius,
              withAlpha(
                style.haloColor,
                nodeId === primaryNodeId ? GRAPH_THEME.overlays.hoverGlowAlpha : GRAPH_THEME.overlays.pathGlowAlpha,
              ),
            );
          }

          if (style.showRing) {
            drawNodeRing(
              context,
              point.x,
              point.y,
              displayData.size,
              style.ringColor || GRAPH_THEME.nodes.selectedRing.color,
              GRAPH_THEME.nodes.selectedRing.width,
              GRAPH_THEME.nodes.selectedRing.glowAlpha,
            );
          }

          if (style.showBadge && style.badgeKind) {
            drawNodeBadge(context, point.x, point.y, displayData.size, style.badgeKind, style.badgeCount);
          }
        });

        if (primaryNodeId && effectAvailability.lens.available) {
          drawNeighborhoodLensOverlay(context, sigma, primaryNodeId, focusIds);
        }

        if (GRAPH_THEME.zoomTiers[interactionState.zoomTier].showCurves && primaryNodeId) {
          const drawnPairs = new Set<string>();
          focusIds.forEach((sourceId) => {
            focusIds.forEach((targetId) => {
              if (sourceId >= targetId) {
                return;
              }
              if (!graph.hasDirectedEdge(sourceId, targetId) || !graph.hasDirectedEdge(targetId, sourceId)) {
                return;
              }

              const pairKey = [sourceId, targetId].sort().join("::");
              if (drawnPairs.has(pairKey)) {
                return;
              }
              drawnPairs.add(pairKey);

              const sourceData = sigma.getNodeDisplayData(sourceId);
              const targetData = sigma.getNodeDisplayData(targetId);
              if (!sourceData || !targetData) {
                return;
              }

              const attrs = graph.getDirectedEdgeAttributes(sourceId, targetId) as EdgeAttributes;
              const state: GraphEdgeVisualState =
                sourceId === primaryNodeId || targetId === primaryNodeId
                  ? interactionState.hoveredNodeId ? "hovered" : "selected"
                  : "neighbor";
              const style = resolveEdgeElementStyle(GRAPH_THEME, interactionState.zoomTier, state, attrs);
              if (!style.drawCurvedOverlay || !style.color || !style.size) {
                return;
              }

              drawCurvedEdge(
                context,
                sigma.graphToViewport({ x: sourceData.x, y: sourceData.y }),
                sigma.graphToViewport({ x: targetData.x, y: targetData.y }),
                style.color,
                Math.max(style.size, GRAPH_THEME.overlays.curveLineWidth),
                style.curveStrength,
                GRAPH_THEME.edges.variants.bidirectionalCurve.glowAlpha,
              );
            });
          });
        }

        if (pathSegments.length > 0) {
          pathSegments.forEach((segment) => {
            drawCurvedEdge(
              context,
              segment.source,
              segment.target,
              segment.color,
              Math.max(segment.size, GRAPH_THEME.overlays.curveLineWidth + 0.4),
              segment.curveStrength,
              GRAPH_THEME.edges.variants.pathSignal.glowAlpha,
            );
          });
        }

        if (effectAvailability.pathFlow.available) {
          drawPathFlowAccentOverlay(context, pathSegments, now);
        }

        if (effectAvailability.pathPulse.available) {
          drawPathPulseOverlay(context, pathSegments, now);
        }

        frame = window.requestAnimationFrame(draw);
      };

      draw();
      return () => {
        window.cancelAnimationFrame(frame);
      };
    }, [effectsState, interactionState]);

    useEffect(() => {
      if (selectedNodeId || isFocusedView) {
        fa2Ref.current?.stop();
        return;
      }

      if (isLayoutRunning) {
        if (!fa2Ref.current) {
          fa2Ref.current = new FA2Layout(graph, FA2_SETTINGS);
        }
        fa2Ref.current.start();
      } else {
        fa2Ref.current?.stop();
      }

      return () => {
        fa2Ref.current?.stop();
      };
    }, [isFocusedView, isLayoutRunning, selectedNodeId]);

    useEffect(() => {
      return () => {
        fa2Ref.current?.kill();
        fa2Ref.current = null;
      };
    }, []);

    const handleFitView = useCallback(() => {
      fitCurrentView();
    }, [fitCurrentView]);

    return (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        <div
          ref={containerRef}
          className={className}
          style={{ width: "100%", height: "100%", background: "transparent" }}
        />
        <canvas
          ref={overlayRef}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            zIndex: 4,
          }}
        />
        {pluginOverlays.length ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              zIndex: 6,
            }}
          >
            {pluginOverlays.map((overlay, index) => (
              <div key={`graph-plugin-overlay-${index}`} style={{ position: "absolute", inset: 0 }}>
                {overlay}
              </div>
            ))}
          </div>
        ) : null}
        {showFitViewButton ? (
          <button
            id="graph-fit-view-btn"
            onClick={handleFitView}
            style={{
              position: "absolute",
              bottom: 24,
              left: 24,
              padding: "8px 16px",
              background: "linear-gradient(135deg, rgba(27, 79, 170, 0.9), rgba(53, 123, 255, 0.84))",
              color: "#fff",
              border: `1px solid ${GRAPH_THEME.palette.background.shellBorder}`,
              borderRadius: 10,
              cursor: "pointer",
              fontWeight: 700,
              zIndex: 10,
              backdropFilter: "blur(10px)",
              boxShadow: `0 10px 28px ${GRAPH_THEME.palette.background.shellGlow}`,
              fontSize: 12,
              letterSpacing: "0.01em",
            }}
          >
            Fit View
          </button>
        ) : null}
      </div>
    );
  }
);
