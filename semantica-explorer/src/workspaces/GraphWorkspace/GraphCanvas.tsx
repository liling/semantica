import { useEffect, useMemo, useRef, useCallback, forwardRef, useImperativeHandle, useState, type ReactNode } from "react";
import type Graph from "graphology";
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
  type GraphBadgeKind,
  type GraphZoomTier,
  withAlpha,
  zoomTierAtLeast,
} from "./graphTheme";
import {
  buildFocusSet,
  buildEdgeEndpointSet,
  buildPathEdgeSet,
  collectInteractionRefreshTargets,
  createInteractionState,
  isEdgeInteractable,
  resolveDisplayGraph,
  resolveEdgeElementStyle,
  resolveEdgeVisualState,
  resolveNodeElementStyle,
  resolveNodeVisualState,
} from "./graphSceneState";
import { buildGraphAnalyticsSnapshot, computeGraphAnalyticsBase } from "./graphAnalytics";
import {
  collectVisibleNodeSamples,
  drawContourLayer,
  drawLensLayer,
  drawPathEffectsLayer,
  drawSemanticRegionsLayer,
  drawTemporalEmphasisLayer,
  type PathSegmentOverlay,
  type ViewportPoint,
} from "./graphSceneLayers";
import {
  SEMANTICA_EDGE_PROGRAM_CLASSES,
  SEMANTICA_NODE_PROGRAM_CLASSES,
  drawSemanticaNodeHover,
  drawSemanticaNodeLabel,
} from "./sigmaNativeRendering";
import type {
  GraphAnalyticsSnapshot,
  GraphCameraState,
  GraphDiagnosticsSnapshot,
  GraphEffectsState,
  GraphInteractionState,
  GraphLayoutStatus,
  GraphTemporalState,
  GraphViewMode,
} from "./types";
import type { GraphSceneRuntime } from "./scene";

export type { GraphViewMode } from "./types";

export interface GraphCanvasHandle {
  fitView: () => void;
  focusNode: (nodeId: string) => void;
  requestRender: () => void;
  getCameraState: () => GraphCameraState | null;
}

export interface GraphCanvasProps {
  onNodeClick: (nodeId: string) => void;
  onEdgeClick?: (edgeId: string) => void;
  selectedNodeId: string;
  selectedEdgeId: string;
  activePath?: string[];
  activePathEdgeIds?: string[];
  effectsState: GraphEffectsState;
  temporalState?: GraphTemporalState | null;
  isLayoutRunning: boolean;
  onLayoutRunningChange?: (running: boolean) => void;
  layoutSource?: string;
  onLayoutStatusChange?: (status: GraphLayoutStatus) => void;
  viewMode: GraphViewMode;
  className?: string;
  showFitViewButton?: boolean;
  pluginOverlays?: ReactNode[];
  onSceneRuntimeChange?: (runtime: GraphSceneRuntime | null) => void;
  onInteractionStateChange?: (interactionState: GraphInteractionState) => void;
  onCameraStateChange?: (cameraState: GraphCameraState) => void;
  onDiagnosticsChange?: (effectAvailability: GraphDiagnosticsSnapshot["effectAvailability"]) => void;
  onAnalyticsChange?: (analytics: GraphAnalyticsSnapshot | null) => void;
}

const FA2_SETTINGS = {
  iterations: 50,
  settings: {
    barnesHutOptimize: true,
    barnesHutTheta: 0.5,
    adjustSizes: false,
    gravity: 0.16,
    scalingRatio: 7.5,
    edgeWeightInfluence: 0.3,
    linLogMode: true,
    strongGravityMode: false,
    slowDown: 18,
  },
};

const SIGMA_SETTINGS = {
  allowInvalidContainer: true,
  labelRenderedSizeThreshold: 4,
  defaultNodeType: "circle",
  defaultEdgeType: "line",
  hideLabelsOnMove: true,
  hideEdgesOnMove: true,
  enableEdgeEvents: true,
  renderEdgeLabels: false,
  labelDensity: 0.86,
  labelGridCellSize: 100,
  zIndex: true,
  webGLTarget: "webgl2" as const,
  nodeProgramClasses: SEMANTICA_NODE_PROGRAM_CLASSES,
  edgeProgramClasses: SEMANTICA_EDGE_PROGRAM_CLASSES,
  defaultDrawNodeLabel: drawSemanticaNodeLabel,
  defaultDrawNodeHover: drawSemanticaNodeHover,
};

function isPointNearViewport(point: ViewportPoint, width: number, height: number, padding = 96) {
  return point.x >= -padding
    && point.y >= -padding
    && point.x <= width + padding
    && point.y <= height + padding;
}

function collectPathSegments(
  sigma: Sigma,
  path: string[],
  pathEdgeIds: string[],
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

    const attrs = pathEdgeIds[index] && graph.hasEdge(pathEdgeIds[index])
      ? (graph.getEdgeAttributes(pathEdgeIds[index]) as EdgeAttributes)
      : ({
          baseColor: GRAPH_THEME.palette.accent.path,
          baseSize: 1.2,
          edgeVariant: "pathSignal",
          arrowVisibilityPolicy: "always",
        } as EdgeAttributes);
    const pathStyle = resolveEdgeElementStyle(GRAPH_THEME, zoomTier, "path", attrs, sourceId, targetId);
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
    });
  }

  return segments;
}

function buildEffectAvailability(
  interactionState: GraphInteractionState,
  effectsState: GraphEffectsState,
  temporalState: GraphTemporalState | null | undefined,
  analytics: GraphAnalyticsSnapshot | null,
  sigma: Sigma | null,
  viewportWidth: number,
  viewportHeight: number,
): GraphDiagnosticsSnapshot["effectAvailability"] {
  const visiblePathSegments = sigma
    ? collectPathSegments(
        sigma,
        interactionState.activePath,
        interactionState.activePathEdgeIds,
        interactionState.zoomTier,
        viewportWidth,
        viewportHeight,
      ).length
    : 0;
  const hasActivePath = interactionState.activePath.length > 1;
  const pulseTierReady = zoomTierAtLeast(interactionState.zoomTier, GRAPH_THEME.effects.pathPulse.minZoomTier);
  const flowTierReady = zoomTierAtLeast(interactionState.zoomTier, GRAPH_THEME.effects.pathFlow.minZoomTier);
  const lensTierReady = zoomTierAtLeast(interactionState.zoomTier, GRAPH_THEME.effects.lens.minZoomTier);
  const temporalTierReady = zoomTierAtLeast(interactionState.zoomTier, GRAPH_THEME.effects.temporalEmphasis.minZoomTier);
  const regionsTierReady = zoomTierAtLeast(interactionState.zoomTier, GRAPH_THEME.effects.semanticRegions.minZoomTier);
  const contoursTierReady = zoomTierAtLeast(interactionState.zoomTier, GRAPH_THEME.effects.contours.minZoomTier);
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

  const temporalEmphasis = !effectsState.temporalEmphasisEnabled
    ? { enabled: false, available: false, reason: "Disabled by toggle" }
    : !temporalState?.currentTime
      ? { enabled: true, available: false, reason: "No temporal focus time" }
      : !temporalTierReady
        ? {
            enabled: true,
            available: false,
            reason: "Disabled by zoom tier",
            detail: `Requires ${GRAPH_THEME.effects.temporalEmphasis.minZoomTier}`,
          }
        : { enabled: true, available: true, reason: "Ready" };

  const semanticRegions = !effectsState.semanticRegionsEnabled
    ? { enabled: false, available: false, reason: "Disabled by toggle" }
    : !regionsTierReady
      ? {
          enabled: true,
          available: false,
          reason: "Disabled by zoom tier",
          detail: `Requires ${GRAPH_THEME.effects.semanticRegions.minZoomTier}`,
        }
      : !analytics?.semanticRegions.ready
        ? {
            enabled: true,
            available: false,
            reason: analytics?.semanticRegions.reason ?? "Waiting for semantic region summaries",
          }
        : { enabled: true, available: true, reason: analytics.semanticRegions.reason };

  const contours = !effectsState.contoursEnabled
    ? { enabled: false, available: false, reason: "Disabled by toggle" }
    : !contoursTierReady
      ? {
          enabled: true,
          available: false,
          reason: "Disabled by zoom tier",
          detail: `Requires ${GRAPH_THEME.effects.contours.minZoomTier}`,
        }
      : !analytics?.centrality.ready
        ? {
            enabled: true,
            available: false,
            reason: analytics?.centrality.reason ?? "Waiting for centrality ranking",
          }
        : { enabled: true, available: true, reason: analytics.centrality.reason };

  const pathfinding = !effectsState.pathfindingEnabled
    ? { enabled: false, available: false, reason: "Disabled by toggle" }
    : !analytics?.directedPath.ready
      ? {
          enabled: true,
          available: false,
          reason: analytics?.directedPath.reason ?? "Waiting for a traced path",
        }
      : {
          enabled: true,
          available: true,
          reason: analytics.directedPath.verifiedAgainstActivePath
            ? "Ready · local path matches traced path"
            : "Ready · local directed path differs from traced path",
        };

  const communities = !effectsState.communitiesEnabled
    ? { enabled: false, available: false, reason: "Disabled by toggle" }
    : !analytics?.communities.ready
      ? {
          enabled: true,
          available: false,
          reason: analytics?.communities.reason ?? "Waiting for community summaries",
        }
      : {
          enabled: true,
          available: true,
          reason: analytics.communities.modularity !== null
            ? `Ready · modularity ${analytics.communities.modularity.toFixed(3)}`
            : analytics.communities.reason,
        };

  const centrality = !effectsState.centralityEnabled
    ? { enabled: false, available: false, reason: "Disabled by toggle" }
    : !analytics?.centrality.ready
      ? {
          enabled: true,
          available: false,
          reason: analytics?.centrality.reason ?? "Waiting for centrality ranking",
        }
      : { enabled: true, available: true, reason: analytics.centrality.reason };

  const legend = effectsState.legendEnabled
    ? { enabled: true, available: true, reason: "Panel enabled" }
    : { enabled: false, available: false, reason: "Disabled by toggle" };

  const diagnostics = !GRAPH_THEME.effects.diagnostics.enabledInDev
    ? { enabled: false, available: false, reason: "Disabled in production" }
    : effectsState.diagnosticsEnabled
      ? { enabled: true, available: true, reason: "Ready" }
      : { enabled: false, available: false, reason: "Disabled by toggle" };

  return {
    pathPulse,
    pathFlow,
    lens,
    temporalEmphasis,
    semanticRegions,
    contours,
    pathfinding,
    communities,
    centrality,
    legend,
    diagnostics,
  };
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

function applySceneState(
  sigma: Sigma,
  displayGraph: typeof graph | Graph<NodeAttributes, EdgeAttributes>,
  interactionState: GraphInteractionState,
  analyticsSnapshot: GraphAnalyticsSnapshot | null,
  refreshTargets?: {
    nodes?: string[];
    edges?: string[];
  },
) {
  const { zoomTier, hoveredNodeId, selectedNodeId, selectedEdgeId, activePath } = interactionState;
  const primaryNodeId = hoveredNodeId || selectedNodeId;
  const focusIds = primaryNodeId && graph.hasNode(primaryNodeId) ? buildFocusSet(primaryNodeId) : new Set<string>();
  const edgeEndpointIds = buildEdgeEndpointSet(displayGraph, selectedEdgeId);
  const pathNodeIds = new Set(activePath);
  const pathEdgeIds = buildPathEdgeSet(displayGraph, activePath, interactionState.activePathEdgeIds);
  const overviewBackboneEdgeIds = new Set(analyticsSnapshot?.overviewBackbone.edgeIds ?? []);
  const cameraRatio = sigma.getCamera().getState().ratio;

  sigma.setSetting("nodeReducer", (node, data) => {
    const attrs = data as NodeAttributes;
    const state = resolveNodeVisualState(
      node,
      zoomTier,
      hoveredNodeId,
      selectedNodeId,
      selectedEdgeId,
      focusIds,
      edgeEndpointIds,
      pathNodeIds,
    );
    const style = resolveNodeElementStyle(GRAPH_THEME, zoomTier, state, attrs, data.label, cameraRatio);

      return {
        ...data,
        color: style.color,
        shellColor: style.shellColor,
        coreScale: style.coreScale,
        size: style.size,
        forceLabel: style.forceLabel,
        label: style.label,
        zIndex: style.zIndex,
        hidden: style.hidden,
        borderColor: style.borderColor,
        borderSize: style.borderSize,
        ringColor: style.showRing ? style.ringColor : style.borderColor,
        ringSize: style.ringSize,
      };
    });

  sigma.setSetting("edgeReducer", (edge, data) => {
    const attrs = data as EdgeAttributes;
    const [source, target] = displayGraph.extremities(edge);
    const stableEdgeId = String(edge);
    const state = resolveEdgeVisualState(
      stableEdgeId,
      source,
      target,
      zoomTier,
      hoveredNodeId,
      selectedNodeId,
      selectedEdgeId,
      focusIds,
      pathEdgeIds,
      overviewBackboneEdgeIds,
    );
    const style = resolveEdgeElementStyle(GRAPH_THEME, zoomTier, state, attrs, source, target);

    return {
      ...data,
      hidden: style.hidden,
      type: style.type,
      color: style.color,
      size: style.size,
      zIndex: style.zIndex,
      curvature: style.curvature,
    };
  });

  if ((refreshTargets?.nodes?.length ?? 0) > 0 || (refreshTargets?.edges?.length ?? 0) > 0) {
    sigma.scheduleRefresh({
      partialGraph: {
        nodes: refreshTargets?.nodes,
        edges: refreshTargets?.edges,
      },
    });
    return;
  }

  sigma.scheduleRefresh();
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
      onEdgeClick,
      selectedNodeId,
      selectedEdgeId,
      activePath = [],
      activePathEdgeIds = [],
      effectsState,
      temporalState,
      isLayoutRunning,
      viewMode,
      className,
      showFitViewButton = true,
      pluginOverlays = [],
      onSceneRuntimeChange,
      onInteractionStateChange,
      onCameraStateChange,
      onDiagnosticsChange,
      onAnalyticsChange,
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
    const [analyticsSnapshot, setAnalyticsSnapshot] = useState<GraphAnalyticsSnapshot | null>(null);

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
    const displayGraph = useMemo(
      () => resolveDisplayGraph(selectedNodeId, activePath, activePathEdgeIds, viewMode),
      [activePath, activePathEdgeIds, selectedNodeId, viewMode],
    );

    const interactionState = useMemo(
      () => createInteractionState(
        hoveredNodeId,
        selectedNodeId,
        selectedEdgeId,
        activePath,
        activePathEdgeIds,
        viewMode,
        zoomTier,
        isLayoutRunning,
      ),
      [activePath, activePathEdgeIds, hoveredNodeId, isLayoutRunning, selectedEdgeId, selectedNodeId, viewMode, zoomTier],
    );
    const interactionStateRef = useRef<GraphInteractionState>(interactionState);
    interactionStateRef.current = interactionState;
    const previousInteractionStateRef = useRef<GraphInteractionState | null>(null);
    const shouldComputeCommunities = effectsState.communitiesEnabled || effectsState.semanticRegionsEnabled;
    const shouldComputeCentrality = effectsState.centralityEnabled || effectsState.semanticRegionsEnabled || effectsState.contoursEnabled;
    const analyticsBase = useMemo(
      () => computeGraphAnalyticsBase(displayGraph, {
        computeCommunities: shouldComputeCommunities,
        computeCentrality: shouldComputeCentrality,
      }),
      [displayGraph, shouldComputeCentrality, shouldComputeCommunities],
    );

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
        onEdgeSelectionChange: onEdgeClick ?? (() => {}),
        focusNodeInView,
        fitCurrentView,
        dispatchAction,
      };
      behaviorContextRef.current = context;
      return context;
    }, [displayGraph, dispatchAction, fitCurrentView, focusNodeInView, onEdgeClick, onNodeClick]);

    const dispatchToBehaviors = useCallback((
      hook: "onNodeEnter" | "onNodeLeave" | "onNodeClick" | "onEdgeClick" | "onStageClick" | "onCameraChange",
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
      fitView: () => dispatchAction({ type: "fitView" }),
      focusNode: (nodeId: string) => dispatchAction({ type: "focusNode", nodeId }),
      requestRender: () => sigmaRef.current?.scheduleRefresh(),
      getCameraState: () => {
        const sigma = sigmaRef.current;
        if (!sigma) {
          return null;
        }
        const state = sigma.getCamera().getState();
        return { x: state.x, y: state.y, ratio: state.ratio };
      },
    }), [dispatchAction]);

    useEffect(() => {
      if (!containerRef.current) return;

      const sigma = new Sigma(displayGraph, containerRef.current, SIGMA_SETTINGS);
      sigmaRef.current = sigma;
      const camera = sigma.getCamera();
      const runtime: GraphSceneRuntime = {
        renderer: "sigma",
        scene: sigma,
        graph,
        displayGraph,
        requestRender: () => sigma.scheduleRefresh(),
        getCameraState: () => {
          const state = camera.getState();
          return { x: state.x, y: state.y, ratio: state.ratio };
        },
      };
      onSceneRuntimeChange?.(runtime);
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
        onCameraStateChange?.(cameraState);
        dispatchToBehaviors("onCameraChange", cameraState);
      };

      const resizeObserver = new ResizeObserver(() => {
        if (containerRef.current && containerRef.current.offsetWidth > 0) {
          sigma.scheduleRefresh();
        }
      });
      resizeObserver.observe(containerRef.current);

      camera.on("updated", syncTier);
      sigma.on("clickNode", ({ node }) => dispatchToBehaviors("onNodeClick", node));
      sigma.on("clickEdge", ({ edge }) => {
        const [source, target] = displayGraph.extremities(edge);
        const stableEdgeId = String(edge);
        const attrs = displayGraph.getEdgeAttributes(edge) as EdgeAttributes;

        if (isEdgeInteractable(displayGraph, interactionStateRef.current, stableEdgeId, source, target, attrs)) {
          dispatchToBehaviors("onEdgeClick", stableEdgeId);
        }
      });
      sigma.on("clickStage", () => dispatchToBehaviors("onStageClick"));
      sigma.on("enterNode", ({ node }) => dispatchToBehaviors("onNodeEnter", node));
      sigma.on("leaveNode", ({ node }) => dispatchToBehaviors("onNodeLeave", node));
      sigma.on("enterEdge", ({ edge }) => {
        const container = containerRef.current;
        if (!container) {
          return;
        }

        const [source, target] = displayGraph.extremities(edge);
        const stableEdgeId = String(edge);
        const attrs = displayGraph.getEdgeAttributes(edge) as EdgeAttributes;
        container.style.cursor = isEdgeInteractable(displayGraph, interactionStateRef.current, stableEdgeId, source, target, attrs)
          ? "pointer"
          : "";
      });
      sigma.on("leaveEdge", () => {
        if (containerRef.current) {
          containerRef.current.style.cursor = "";
        }
      });

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
        if (containerRef.current) {
          containerRef.current.style.cursor = "";
        }
        sigma.kill();
        behaviorContextRef.current = null;
        sigmaRef.current = null;
        onSceneRuntimeChange?.(null);
      };
    }, [behaviors, dispatchAction, dispatchToBehaviors, displayGraph, getBehaviorContext, onCameraStateChange, onSceneRuntimeChange]);

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
      const sigma = sigmaRef.current;
      const container = containerRef.current;
      if (!sigma || !container) {
        setAnalyticsSnapshot(null);
        onAnalyticsChange?.(null);
        return;
      }

      const visibleNodes = collectVisibleNodeSamples(
        sigma,
        displayGraph,
        container.clientWidth,
        container.clientHeight,
      ).map((sample) => sample.nodeId);

      const analytics = buildGraphAnalyticsSnapshot({
        graphRef: displayGraph,
        interactionState,
        base: analyticsBase,
        visibleNodeIds: visibleNodes,
      });
      setAnalyticsSnapshot(analytics);
      onAnalyticsChange?.(analytics);
    }, [analyticsBase, displayGraph, interactionState, onAnalyticsChange]);

    useEffect(() => {
      if (!onDiagnosticsChange) {
        return;
      }

      const sigma = sigmaRef.current;
      const container = containerRef.current;
      const availability = buildEffectAvailability(
        interactionState,
        effectsState,
        temporalState,
        analyticsSnapshot,
        sigma,
        container?.clientWidth ?? 0,
        container?.clientHeight ?? 0,
      );
      onDiagnosticsChange(availability);
    }, [analyticsSnapshot, effectsState, interactionState, onDiagnosticsChange, temporalState]);

    useEffect(() => {
      previousInteractionStateRef.current = null;
    }, [displayGraph]);

    useEffect(() => {
      const sigma = sigmaRef.current;
      if (!sigma) {
        return;
      }

      const previousInteractionState = previousInteractionStateRef.current;
      const refreshTargets = previousInteractionState
        ? collectInteractionRefreshTargets(displayGraph, previousInteractionState, interactionState)
        : undefined;

      applySceneState(sigma, displayGraph, interactionState, analyticsSnapshot, refreshTargets);
      previousInteractionStateRef.current = interactionState;
    }, [analyticsSnapshot, displayGraph, interactionState]);

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
        const edgeEndpointIds = buildEdgeEndpointSet(displayGraph, interactionState.selectedEdgeId);
        const pathNodeIds = new Set(interactionState.activePath);
        const pathSegments = collectPathSegments(
          sigma,
          interactionState.activePath,
          interactionState.activePathEdgeIds,
          interactionState.zoomTier,
          rect.width,
          rect.height,
        );
        const visibleNodeSamples = collectVisibleNodeSamples(sigma, displayGraph, rect.width, rect.height);
        const effectAvailability = buildEffectAvailability(
          interactionState,
          effectsState,
          temporalState,
          analyticsSnapshot,
          sigma,
          rect.width,
          rect.height,
        );
        const cameraRatio = sigma.getCamera().getState().ratio;
        const nodesToDecorate = new Set<string>([
          ...focusIds,
          ...edgeEndpointIds,
          ...pathNodeIds,
          ...(primaryNodeId ? [primaryNodeId] : []),
        ]);
        const now = performance.now() / 1000;

        drawContourLayer(context, analyticsSnapshot, visibleNodeSamples, interactionState, effectsState);
        drawSemanticRegionsLayer(context, analyticsSnapshot, visibleNodeSamples, interactionState, effectsState);
        drawTemporalEmphasisLayer(context, visibleNodeSamples, temporalState, interactionState, effectsState);

        nodesToDecorate.forEach((nodeId) => {
          const displayData = sigma.getNodeDisplayData(nodeId);
          if (!displayData) return;
          const attrs = graph.getNodeAttributes(nodeId) as NodeAttributes;
      const state = resolveNodeVisualState(
        nodeId,
        interactionState.zoomTier,
        interactionState.hoveredNodeId,
        interactionState.selectedNodeId,
        interactionState.selectedEdgeId,
            focusIds,
            edgeEndpointIds,
            pathNodeIds,
          );
          const style = resolveNodeElementStyle(
            GRAPH_THEME,
            interactionState.zoomTier,
            state,
            attrs,
            attrs.label,
            cameraRatio,
          );
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

          if (style.showBadge && style.badgeKind) {
            drawNodeBadge(context, point.x, point.y, displayData.size, style.badgeKind, style.badgeCount);
          }
        });

        if (primaryNodeId && effectAvailability.lens.available) {
          drawLensLayer(context, sigma, primaryNodeId, focusIds);
        }

        drawPathEffectsLayer(context, pathSegments, effectsState, effectAvailability, now);

        frame = window.requestAnimationFrame(draw);
      };

      draw();
      return () => {
        window.cancelAnimationFrame(frame);
      };
    }, [analyticsSnapshot, displayGraph, effectsState, interactionState, temporalState]);

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
