import Graph from "graphology";

import { graph, type EdgeAttributes, type NodeAttributes } from "../../store/graphStore";
import {
  clamp,
  blendHex,
  GRAPH_THEME,
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
import type { GraphInteractionState, GraphViewMode } from "./types";

const MAX_FOCUS_NEIGHBORS = GRAPH_THEME.focus.maxNeighbors;
const FOCUS_RING_CAPACITY = GRAPH_THEME.focus.ringCapacity;
const FOCUS_RING_GAP = GRAPH_THEME.focus.ringGap;
const FOCUS_PRIMARY_LABELS = GRAPH_THEME.focus.primaryLabels;

function getOverviewPresenceBoost(cameraRatio: number) {
  return clamp(0, Math.log2(Math.max(cameraRatio, 1)) / 1.85, 1);
}

export type GraphSigmaEdgeType = "line" | "arrow" | "curve" | "curvedArrow";

export type ResolvedNodeStyle = {
  color: string;
  shellColor: string;
  coreScale: number;
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
  ringSize: number;
  showHalo: boolean;
  haloColor: string;
};

export type ResolvedEdgeStyle = {
  hidden: boolean;
  type?: GraphSigmaEdgeType;
  color?: string;
  size?: number;
  zIndex: number;
  edgeVariant: GraphEdgeVariant;
  arrowVisibilityPolicy: GraphArrowVisibilityPolicy;
  curveStrength: number;
  curvature: number;
};

function forEachDirectedEdgeBetween(
  graphRef: typeof graph | Graph<NodeAttributes, EdgeAttributes>,
  source: string,
  target: string,
  callback: (edgeId: string, attrs: EdgeAttributes) => void,
) {
  graphRef.forEachDirectedEdge(source, target, (edgeId, attrs) => {
    callback(String(edgeId), attrs as EdgeAttributes);
  });
}

function collectDirectedEdgeIdsBetween(
  graphRef: typeof graph | Graph<NodeAttributes, EdgeAttributes>,
  source: string,
  target: string,
): string[] {
  const edgeIds: string[] = [];
  forEachDirectedEdgeBetween(graphRef, source, target, (edgeId) => {
    edgeIds.push(edgeId);
  });
  return edgeIds;
}

export function buildPathEdgeSet(
  graphRef: typeof graph | Graph<NodeAttributes, EdgeAttributes>,
  path: string[],
  pathEdgeIds: string[] = [],
): Set<string> {
  if (pathEdgeIds.length > 0) {
    return new Set<string>(pathEdgeIds.filter((edgeId) => graphRef.hasEdge(edgeId)));
  }

  const edgeIds = new Set<string>();
  for (let index = 0; index < path.length - 1; index += 1) {
    collectDirectedEdgeIdsBetween(graphRef, path[index], path[index + 1]).forEach((edgeId) => edgeIds.add(edgeId));
  }
  return edgeIds;
}

export function buildEdgeEndpointSet(
  graphRef: typeof graph | Graph<NodeAttributes, EdgeAttributes>,
  ...edgeIds: Array<string | null | undefined>
): Set<string> {
  const nodeIds = new Set<string>();

  edgeIds.forEach((edgeId) => {
    if (!edgeId || !graphRef.hasEdge(edgeId)) {
      return;
    }

    const [source, target] = graphRef.extremities(edgeId);
    nodeIds.add(source);
    nodeIds.add(target);
  });

  return nodeIds;
}

function collectFocusEdgeIds(
  graphRef: typeof graph | Graph<NodeAttributes, EdgeAttributes>,
  nodeIds: Set<string>,
): Set<string> {
  const edgeIds = new Set<string>();
  const ids = Array.from(nodeIds);

  for (let sourceIndex = 0; sourceIndex < ids.length; sourceIndex += 1) {
    const source = ids[sourceIndex];

    for (let targetIndex = 0; targetIndex < ids.length; targetIndex += 1) {
      const target = ids[targetIndex];
      if (source === target) {
        continue;
      }

      collectDirectedEdgeIdsBetween(graphRef, source, target).forEach((edgeId) => edgeIds.add(edgeId));
    }
  }

  return edgeIds;
}

function collectImpactedNodeIds(
  graphRef: typeof graph | Graph<NodeAttributes, EdgeAttributes>,
  interactionState: GraphInteractionState | null,
): Set<string> {
  if (!interactionState) {
    return new Set<string>();
  }

  const impacted = new Set<string>(interactionState.activePath);
  const primaryNodeId = interactionState.hoveredNodeId || interactionState.selectedNodeId;
  if (primaryNodeId && graphRef.hasNode(primaryNodeId)) {
    buildFocusSet(primaryNodeId).forEach((nodeId) => impacted.add(nodeId));
  }

  buildEdgeEndpointSet(graphRef, interactionState.selectedEdgeId)
    .forEach((nodeId) => impacted.add(nodeId));

  return impacted;
}

function collectImpactedEdgeKeys(
  graphRef: typeof graph | Graph<NodeAttributes, EdgeAttributes>,
  interactionState: GraphInteractionState | null,
): Set<string> {
  if (!interactionState) {
    return new Set<string>();
  }

  const impacted = new Set<string>(buildPathEdgeSet(graphRef, interactionState.activePath, interactionState.activePathEdgeIds));
  const primaryNodeId = interactionState.hoveredNodeId || interactionState.selectedNodeId;
  if (primaryNodeId && graphRef.hasNode(primaryNodeId)) {
    collectFocusEdgeIds(graphRef, buildFocusSet(primaryNodeId)).forEach((edgeId) => impacted.add(edgeId));
  }

  if (interactionState.selectedEdgeId) {
    impacted.add(interactionState.selectedEdgeId);
  }

  return impacted;
}

function resolveDisplayEdgeIds(
  graphRef: typeof graph | Graph<NodeAttributes, EdgeAttributes>,
  stableEdgeIds: Set<string>,
): string[] {
  return Array.from(stableEdgeIds).filter((edgeId) => graphRef.hasEdge(edgeId));
}

export function collectInteractionRefreshTargets(
  graphRef: typeof graph | Graph<NodeAttributes, EdgeAttributes>,
  previousState: GraphInteractionState | null,
  nextState: GraphInteractionState,
): { nodes: string[]; edges: string[] } {
  const nodeIds = new Set<string>();
  const edgeKeys = new Set<string>();

  collectImpactedNodeIds(graphRef, previousState).forEach((nodeId) => nodeIds.add(nodeId));
  collectImpactedNodeIds(graphRef, nextState).forEach((nodeId) => nodeIds.add(nodeId));
  collectImpactedEdgeKeys(graphRef, previousState).forEach((edgeId) => edgeKeys.add(edgeId));
  collectImpactedEdgeKeys(graphRef, nextState).forEach((edgeId) => edgeKeys.add(edgeId));

  return {
    nodes: Array.from(nodeIds).filter((nodeId) => graphRef.hasNode(nodeId)),
    edges: resolveDisplayEdgeIds(graphRef, edgeKeys),
  };
}

export function getEdgeWeightBetween(source: string, target: string): number {
  let weight = 0;

  forEachDirectedEdgeBetween(graph, source, target, (_edgeId, attrs) => {
    weight = Math.max(weight, Number(attrs?.weight ?? 0));
  });

  forEachDirectedEdgeBetween(graph, target, source, (_edgeId, attrs) => {
    weight = Math.max(weight, Number(attrs?.weight ?? 0));
  });

  return weight;
}

export function rankNeighbors(nodeId: string): string[] {
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

export function buildFocusSet(nodeId: string): Set<string> {
  const ranked = rankNeighbors(nodeId).slice(0, MAX_FOCUS_NEIGHBORS);
  return new Set<string>([nodeId, ...ranked]);
}

export function isEdgeInteractable(
  graphRef: typeof graph | Graph<NodeAttributes, EdgeAttributes>,
  interactionState: GraphInteractionState,
  edgeId: string,
  source: string,
  target: string,
  attrs: EdgeAttributes,
): boolean {
  const pathEdgeIds = buildPathEdgeSet(graphRef, interactionState.activePath, interactionState.activePathEdgeIds);
  if (pathEdgeIds.has(edgeId) || interactionState.selectedEdgeId === edgeId) {
    return true;
  }

  const primaryNodeId = interactionState.selectedNodeId;
  if (primaryNodeId && graphRef.hasNode(primaryNodeId)) {
    if (source === primaryNodeId || target === primaryNodeId) {
      return true;
    }

    const focusIds = buildFocusSet(primaryNodeId);
    return focusIds.has(source) && focusIds.has(target);
  }

  if (interactionState.zoomTier !== "inspection") {
    return false;
  }

  return Number(attrs.visualPriority ?? 0) >= GRAPH_THEME.zoomTiers[interactionState.zoomTier].edgePriorityThreshold;
}

function resolveNodeColor(
  theme: GraphTheme,
  zoomTier: GraphZoomTier,
  state: GraphNodeVisualState,
  attrs: NodeAttributes,
  cameraRatio: number,
  fallbackColor?: string,
) {
  const semanticColor = String(attrs.baseColor || fallbackColor || theme.palette.semantic[0]);
  const overviewTint = state === "neighbor"
    ? theme.palette.overview.nodeTintMix + 0.09
    : theme.palette.overview.nodeTintMix;
  const overviewCore = blendHex(
    theme.palette.overview.nodeCore,
    semanticColor,
    Math.min(0.74, theme.palette.overview.nodeCoreMix + overviewTint),
  );

  switch (theme.nodes.states[state].color) {
    case "selected":
      return theme.palette.accent.selected;
    case "hovered":
      return theme.palette.accent.hovered;
    case "path":
      return theme.palette.accent.path;
    case "muted":
      return zoomTier === "overview"
        ? withAlpha(theme.palette.overview.nodeMuted, 0.42)
        : String(attrs.mutedColor || withAlpha(semanticColor, theme.nodes.mutedAlpha));
    case "base":
    default:
      if (zoomTier === "overview") {
        const presenceBoost = getOverviewPresenceBoost(cameraRatio);
        const boostedCore = blendHex(overviewCore, semanticColor, 0.3 + 0.26 * presenceBoost);
        return withAlpha(boostedCore, Math.min(0.98, theme.palette.overview.nodeCoreAlpha + presenceBoost * 0.18));
      }
      return semanticColor;
  }
}

function resolveNodeShellColor(
  theme: GraphTheme,
  zoomTier: GraphZoomTier,
  state: GraphNodeVisualState,
  attrs: NodeAttributes,
  cameraRatio: number,
  fallbackColor?: string,
) {
  const semanticColor = String(attrs.baseColor || fallbackColor || theme.palette.semantic[0]);
  const presenceBoost = getOverviewPresenceBoost(cameraRatio);
  const overviewShell = blendHex(
    theme.palette.overview.nodeBase,
    semanticColor,
    (state === "neighbor" ? 0.02 : 0.012) + presenceBoost * 0.024,
  );

  if (zoomTier !== "overview") {
    return withAlpha(blendHex(theme.palette.overview.nodeBase, semanticColor, 0.26), 0.95);
  }

  if (state === "selected") {
    return withAlpha(blendHex(theme.palette.overview.nodeBase, theme.palette.accent.selected, 0.05), 0.98);
  }

  if (state === "hovered") {
    return withAlpha(blendHex(theme.palette.overview.nodeBase, theme.palette.accent.hovered, 0.06), 0.98);
  }

  if (state === "path") {
    return withAlpha(blendHex(theme.palette.overview.nodeBase, theme.palette.accent.path, 0.06), 0.97);
  }

  if (state === "muted" || state === "inactive") {
    return withAlpha(theme.palette.overview.nodeMuted, 0.22);
  }

  return withAlpha(overviewShell, theme.palette.overview.nodeShellAlpha);
}

function resolveNodeCoreScale(
  zoomTier: GraphZoomTier,
  state: GraphNodeVisualState,
  cameraRatio: number,
) {
  const presenceBoost = getOverviewPresenceBoost(cameraRatio);
  if (zoomTier === "overview") {
    switch (state) {
      case "selected":
        return 0.34 + presenceBoost * 0.08;
      case "hovered":
        return 0.32 + presenceBoost * 0.08;
      case "path":
        return 0.28 + presenceBoost * 0.07;
      case "neighbor":
        return 0.2 + presenceBoost * 0.06;
      case "muted":
      case "inactive":
        return 0.08 + presenceBoost * 0.03;
      case "default":
      default:
        return 0.16 + presenceBoost * 0.08;
    }
  }

  switch (state) {
    case "selected":
      return 0.52;
    case "hovered":
      return 0.48;
    case "path":
      return 0.44;
    case "neighbor":
      return 0.3;
    case "muted":
    case "inactive":
      return 0.1;
    case "default":
    default:
      return zoomTier === "structure" ? 0.22 : 0.28;
  }
}

function resolveEdgeColor(
  theme: GraphTheme,
  zoomTier: GraphZoomTier,
  state: GraphEdgeVisualState,
  attrs: EdgeAttributes,
  fallbackColor?: string,
) {
  const defaultInspectionColor = zoomTier === "overview"
    ? theme.palette.overview.edgeInspection
    : theme.palette.muted.edgeInspection;
  const baseColor = String(attrs.baseColor || fallbackColor || defaultInspectionColor);

  switch (theme.edges.states[state].color) {
    case "hover":
      return theme.palette.accent.hovered;
    case "path":
      return theme.palette.accent.path;
    case "backbone":
      return zoomTier === "overview"
        ? theme.palette.overview.edgeBackbone
        : theme.palette.muted.edgeFocus;
    case "focus":
      return theme.palette.muted.edgeFocus;
    case "overview":
      return theme.palette.muted.edgeOverview;
    case "structure":
      return zoomTier === "overview"
        ? theme.palette.overview.edgeStructure
        : theme.palette.muted.edgeStructure;
    case "inspection":
      return zoomTier === "overview"
        ? theme.palette.overview.edgeInspection
        : theme.palette.muted.edgeInspection;
    case "muted":
      return zoomTier === "overview"
        ? theme.palette.overview.edgeStructure
        : String(attrs.mutedColor || theme.palette.muted.edgeOverview);
    default:
      return baseColor;
  }
}

function resolveNodeRingColor(
  theme: GraphTheme,
  state: GraphNodeVisualState,
  attrs: NodeAttributes,
) {
  if (state === "selected") {
    return attrs.ringColor || theme.nodes.selectedRing.color;
  }
  if (state === "hovered") {
    return theme.palette.accent.hovered;
  }
  if (state === "path") {
    return theme.palette.accent.path;
  }

  return undefined;
}

function resolveNodeRingSize(
  theme: GraphTheme,
  state: GraphNodeVisualState,
  zoomTier: GraphZoomTier,
) {
  if (state === "selected" && zoomTierAtLeast(zoomTier, theme.nodes.selectedRing.visibleFrom)) {
    return theme.nodes.selectedRing.nativeSize;
  }
  if (state === "hovered") {
    return Math.max(1.45, theme.nodes.selectedRing.nativeSize - 0.35);
  }
  if (state === "path") {
    return Math.max(1.2, theme.nodes.selectedRing.nativeSize - 0.55);
  }

  return 0;
}

export function resolveNodeVisualState(
  nodeId: string,
  zoomTier: GraphZoomTier,
  hoveredNodeId: string | null,
  selectedNodeId: string,
  selectedEdgeId: string,
  focusIds: Set<string>,
  edgeEndpointIds: Set<string>,
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
  if (edgeEndpointIds.has(nodeId)) {
    return "neighbor";
  }
  if (hoveredNodeId || selectedNodeId || selectedEdgeId || pathNodeIds.size > 0) {
    if (zoomTier === "overview") {
      return "default";
    }
    return "muted";
  }
  return "default";
}

export function resolveEdgeVisualState(
  edgeId: string,
  source: string,
  target: string,
  zoomTier: GraphZoomTier,
  hoveredNodeId: string | null,
  selectedNodeId: string,
  selectedEdgeId: string,
  focusIds: Set<string>,
  pathEdgeIds: Set<string>,
  overviewBackboneEdgeIds: Set<string>,
): GraphEdgeVisualState {
  const primaryNodeId = hoveredNodeId || selectedNodeId;

  if (pathEdgeIds.has(edgeId)) {
    return "path";
  }

  if (selectedEdgeId && edgeId === selectedEdgeId) {
    return "selected";
  }

  if (primaryNodeId && (source === primaryNodeId || target === primaryNodeId)) {
    return hoveredNodeId ? "hovered" : "selected";
  }

  if (zoomTier !== "overview" && focusIds.has(source) && focusIds.has(target)) {
    return "neighbor";
  }

  if (zoomTier === "overview" && overviewBackboneEdgeIds.has(edgeId)) {
    return "backbone";
  }

  if (hoveredNodeId || selectedNodeId || selectedEdgeId || pathEdgeIds.size > 0) {
    return "muted";
  }

  if (zoomTier === "overview") {
    return "inactive";
  }

  return "default";
}

export function resolveNodeVariant(state: GraphNodeVisualState, attrs: NodeAttributes): GraphNodeShapeVariant {
  if (state === "selected") {
    return "selected";
  }

  return attrs.nodeShapeVariant || attrs.nodeVariant || "default";
}

export function resolveEdgeVariant(state: GraphEdgeVisualState, attrs: EdgeAttributes): GraphEdgeVariant {
  if (state === "path") {
    return "pathSignal";
  }

  if ((attrs.parallelCount ?? 1) > 1) {
    return "parallelCurve";
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

export function shouldForceNodeLabel(
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
  zoomTier: GraphZoomTier,
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
    return withAlpha(
      attrs.strokeColor || attrs.borderColor || theme.palette.overview.nodeBorder || theme.palette.background.nodeBorder,
      zoomTier === "overview" ? 0.26 : 0.7,
    );
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

  if (zoomTier === "overview") {
    return withAlpha(
      blendHex(theme.palette.overview.nodeBorder, baseColor, state === "neighbor" ? 0.08 : 0.03),
      state === "neighbor" ? 0.24 : 0.06,
    );
  }

  return attrs.strokeColor || attrs.borderColor || theme.palette.background.nodeBorder || baseColor;
}

export function resolveNodeElementStyle(
  theme: GraphTheme,
  zoomTier: GraphZoomTier,
  state: GraphNodeVisualState,
  attrs: NodeAttributes,
  label: string,
  cameraRatio = 1,
): ResolvedNodeStyle {
  const tierConfig = theme.zoomTiers[zoomTier];
  const stateConfig = theme.nodes.states[state];
  const nodeVariant = resolveNodeVariant(state, attrs);
  const variantConfig = theme.nodes.variants[nodeVariant];
  const baseSize = Number(attrs.baseSize || attrs.size || 4);
  const labelPriority = Number(attrs.labelPriority ?? 0);
  const color = resolveNodeColor(theme, zoomTier, state, attrs, cameraRatio, attrs.color);
  const shellColor = resolveNodeShellColor(theme, zoomTier, state, attrs, cameraRatio, attrs.color);
  const sizeMultiplier = (state === "default" ? tierConfig.nodeScale : stateConfig.sizeMultiplier) * variantConfig.sizeMultiplier;
  const overviewPresence = zoomTier === "overview" ? 1 + getOverviewPresenceBoost(cameraRatio) * 1.2 : 1;
  const forceLabel = shouldForceNodeLabel(theme, zoomTier, state, attrs, labelPriority);
  const badgeKind = attrs.badgeKind || variantConfig.badgeKind;
  const forceVisibleState = theme.labels.forceVisibleStates.includes(state);
  const showBadge = Boolean(
    badgeKind
    && (forceVisibleState || (tierConfig.showBadges && zoomTierAtLeast(zoomTier, variantConfig.badgeVisibleFrom)))
    && state !== "muted"
    && state !== "inactive",
  );
  const ringSize = resolveNodeRingSize(theme, state, zoomTier);
  const ringColor = resolveNodeRingColor(theme, state, attrs);
  const showRing = ringSize > 0;
  const showHalo = state === "hovered" || state === "selected" || state === "path";
  const strokeBase = state === "muted" || state === "inactive"
    ? theme.nodes.strokeHierarchy[zoomTier].muted
    : forceVisibleState
      ? theme.nodes.strokeHierarchy[zoomTier].emphasis
      : theme.nodes.strokeHierarchy[zoomTier].base;

  return {
    color,
    shellColor,
    coreScale: resolveNodeCoreScale(zoomTier, state, cameraRatio),
    size: Math.max(baseSize * sizeMultiplier * overviewPresence, stateConfig.minSize),
    forceLabel,
    label: forceLabel ? label : "",
    zIndex: forceLabel && stateConfig.zIndex === 0 ? 1 : stateConfig.zIndex,
    hidden: false,
    borderColor: resolveNodeBorderColor(theme, zoomTier, state, nodeVariant, attrs, color),
    borderSize: Math.max(
      0.4,
      Number(attrs.borderSize ?? 0.85) + strokeBase + stateConfig.borderBoost + variantConfig.borderBoost - 0.8,
    ),
    nodeVariant,
    badgeKind,
    badgeCount: attrs.badgeCount,
    showBadge,
    showRing,
    ringColor,
    ringSize,
    showHalo,
    haloColor: attrs.haloColor || attrs.glowColor || withAlpha(color, theme.overlays.hoverGlowAlpha + variantConfig.haloBoost),
  };
}

function resolveStraightEdgeType(
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

function resolveEdgeCurvature(
  theme: GraphTheme,
  state: GraphEdgeVisualState,
  edgeVariant: GraphEdgeVariant,
  attrs: EdgeAttributes,
  sourceId: string | undefined,
  targetId: string | undefined,
) {
  const variantConfig = theme.edges.variants[edgeVariant];
  const baseCurvature = edgeVariant === "line" && state === "selected"
    ? Math.max(variantConfig.curveStrength, 0.14)
    : variantConfig.curveStrength;

  if (baseCurvature === 0) {
    return 0;
  }

  if (typeof attrs.parallelCount === "number" && attrs.parallelCount > 1 && typeof attrs.parallelIndex === "number") {
    const center = (attrs.parallelCount - 1) / 2;
    return (attrs.parallelIndex - center) * baseCurvature;
  }

  if ((edgeVariant === "bidirectionalCurve" || edgeVariant === "parallelCurve" || attrs.isBidirectional) && sourceId && targetId) {
    return sourceId.localeCompare(targetId) <= 0 ? baseCurvature : -baseCurvature;
  }

  return baseCurvature;
}

export function resolveEdgeElementStyle(
  theme: GraphTheme,
  zoomTier: GraphZoomTier,
  state: GraphEdgeVisualState,
  attrs: EdgeAttributes,
  sourceId?: string,
  targetId?: string,
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
      curvature: 0,
    };
  }

  const sizeMultiplier = (state === "default" ? tierConfig.edgeSizeScale : stateConfig.sizeMultiplier) * variantConfig.sizeMultiplier;
  const straightType = resolveStraightEdgeType(theme, zoomTier, state, edgeVariant, attrs);
  const useCurvedRenderer = tierConfig.showCurves
    && zoomTier !== "overview"
    && (
      edgeVariant === "pathSignal"
      || state === "selected"
      || ((state === "neighbor" || state === "hovered") && (edgeVariant === "bidirectionalCurve" || edgeVariant === "parallelCurve"))
    );
  const curvature = useCurvedRenderer
    ? resolveEdgeCurvature(theme, state, edgeVariant, attrs, sourceId, targetId)
    : 0;

  return {
    hidden: false,
    type: useCurvedRenderer
      ? (straightType === "arrow" ? "curvedArrow" : "curve")
      : straightType,
    color: resolveEdgeColor(theme, zoomTier, state, attrs, attrs.color),
    size: Math.max(baseSize * sizeMultiplier, stateConfig.minSize),
    zIndex: stateConfig.zIndex,
    edgeVariant,
    arrowVisibilityPolicy: variantConfig.arrowPolicy,
    curveStrength: variantConfig.curveStrength,
    curvature,
  };
}

export function createFocusedGraph(
  nodeId: string,
  activePath: string[],
  activePathEdgeIds: string[] = [],
): Graph<NodeAttributes, EdgeAttributes> {
  const focused = new Graph<NodeAttributes, EdgeAttributes>({
    type: "directed",
    multi: true,
    allowSelfLoops: false,
  });

  const rankedNeighbors = rankNeighbors(nodeId).slice(0, MAX_FOCUS_NEIGHBORS);
  const focusIds = new Set<string>([nodeId, ...rankedNeighbors]);
  const labelledNeighborIds = new Set(rankedNeighbors.slice(0, FOCUS_PRIMARY_LABELS));
  const pathNodeIds = new Set(activePath);
  const pathEdgeIds = buildPathEdgeSet(graph, activePath, activePathEdgeIds);

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
    baseColor: selectedState.color,
    baseSize: Math.max(selectedState.size, 22),
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
      baseColor: style.color,
      baseSize: Math.max(style.size, 8.5),
      label: style.label,
    });
  });

  for (const source of focusIds) {
    for (const target of focusIds) {
      if (source === target) {
        continue;
      }
      forEachDirectedEdgeBetween(graph, source, target, (edgeId, attrs) => {
        const state: GraphEdgeVisualState = pathEdgeIds.has(edgeId)
          ? "path"
          : source === nodeId || target === nodeId
            ? "selected"
            : "neighbor";
        const style = resolveEdgeElementStyle(GRAPH_THEME, "inspection", state, attrs, source, target);
        focused.mergeDirectedEdgeWithKey(edgeId, source, target, {
          ...attrs,
          type: style.type,
          size: style.size,
          color: style.color,
          baseSize: style.size,
          baseColor: style.color,
          curvature: style.curvature,
        });
      });
    }
  }

  return focused;
}

export function resolveDisplayGraph(
  selectedNodeId: string,
  activePath: string[],
  activePathEdgeIds: string[],
  viewMode: GraphViewMode,
) {
  const isFocusedView = viewMode === "focused" && Boolean(selectedNodeId) && graph.hasNode(selectedNodeId);
  return isFocusedView && selectedNodeId ? createFocusedGraph(selectedNodeId, activePath, activePathEdgeIds) : graph;
}

export function createInteractionState(
  hoveredNodeId: string | null,
  selectedNodeId: string,
  selectedEdgeId: string,
  activePath: string[],
  activePathEdgeIds: string[],
  viewMode: GraphViewMode,
  zoomTier: GraphZoomTier,
  isLayoutRunning: boolean,
): GraphInteractionState {
  return {
    hoveredNodeId,
    selectedNodeId,
    selectedEdgeId,
    focusedNodeId: selectedNodeId,
    activePath,
    activePathEdgeIds,
    viewMode,
    zoomTier,
    isLayoutRunning,
  };
}
