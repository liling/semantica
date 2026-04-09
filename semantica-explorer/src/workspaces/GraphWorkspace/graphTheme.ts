export type GraphZoomTier = "overview" | "structure" | "inspection";
export type GraphNodeVisualState = "default" | "hovered" | "selected" | "neighbor" | "path" | "inactive" | "muted";
export type GraphEdgeVisualState = "default" | "hovered" | "selected" | "neighbor" | "path" | "inactive" | "muted";
export type GraphNodeShapeVariant = "default" | "temporal" | "inferred" | "provenance" | "selected";
export type GraphEdgeVariant = "line" | "directional" | "bidirectionalCurve" | "parallelCurve" | "pathSignal";
export type GraphArrowVisibilityPolicy = "hidden" | "contextual" | "always";
export type GraphLabelVisibilityPolicy = "none" | "priority" | "local" | "always";
export type GraphBadgeKind = "inferred" | "temporal" | "provenance";

type GraphNodeColorMode = "base" | "selected" | "hovered" | "path" | "muted";
type GraphEdgeColorMode = "overview" | "structure" | "inspection" | "hover" | "path" | "focus" | "muted";

export interface GraphTheme {
  palette: {
    semantic: string[];
    accent: {
      selected: string;
      hovered: string;
      path: string;
      temporal: string;
      provenance: string;
      inferred: string;
    };
    muted: {
      fallback: string;
      nodeAlpha: number;
      edgeOverview: string;
      edgeStructure: string;
      edgeInspection: string;
      edgeFocus: string;
    };
    background: {
      canvas: string;
      shell: string;
      shellBorder: string;
      shellGlow: string;
      grid: string;
      vignette: string;
      nodeBorder: string;
    };
  };
  zoomTiers: Record<GraphZoomTier, {
    maxRatio: number;
    nodeScale: number;
    labelThreshold: number;
    labelBudget: number;
    edgePriorityThreshold: number;
    arrowPriorityThreshold: number;
    edgeSizeScale: number;
    showBadges: boolean;
    showCurves: boolean;
    showContextualArrows: boolean;
  }>;
  labels: {
    forceVisibleStates: readonly GraphNodeVisualState[];
    policies: Record<GraphLabelVisibilityPolicy, {
      minZoomTier: GraphZoomTier;
    }>;
  };
  nodes: {
    backgroundScale: number;
    mutedAlpha: number;
    strokeHierarchy: Record<GraphZoomTier, {
      base: number;
      emphasis: number;
      muted: number;
    }>;
    states: Record<GraphNodeVisualState, {
      color: GraphNodeColorMode;
      sizeMultiplier: number;
      minSize: number;
      forceLabel: boolean;
      zIndex: number;
      borderBoost: number;
    }>;
    variants: Record<GraphNodeShapeVariant, {
      sizeMultiplier: number;
      borderBoost: number;
      haloBoost: number;
      badgeKind?: GraphBadgeKind;
      badgeVisibleFrom: GraphZoomTier;
    }>;
    selectedRing: {
      color: string;
      width: number;
      glowAlpha: number;
      visibleFrom: GraphZoomTier;
    };
    badges: Record<GraphBadgeKind, {
      color: string;
      label: string;
    }>;
    badge: {
      radius: number;
      offset: number;
      fontSize: number;
      textColor: string;
      background: string;
      stroke: string;
      glowAlpha: number;
    };
  };
  edges: {
    states: Record<GraphEdgeVisualState, {
      color: GraphEdgeColorMode;
      sizeMultiplier: number;
      minSize: number;
      zIndex: number;
      forceArrow: boolean;
      hide: boolean;
    }>;
    variants: Record<GraphEdgeVariant, {
      baseType: "line" | "arrow";
      arrowPolicy: GraphArrowVisibilityPolicy;
      curveStrength: number;
      sizeMultiplier: number;
      glowAlpha: number;
    }>;
  };
  overlays: {
    hoverGlowAlpha: number;
    pathGlowAlpha: number;
    glowRadiusMultiplier: number;
    minGlowRadius: number;
    pulseRadius: number;
    curveLineWidth: number;
    curveGlowWidth: number;
    badgeGlowRadius: number;
  };
  focus: {
    maxNeighbors: number;
    ringCapacity: number;
    ringGap: number;
    primaryLabels: number;
  };
  motion: {
    cameraMs: number;
  };
  effects: {
    pathPulse: {
      minZoomTier: GraphZoomTier;
      maxSegments: number;
      speed: number;
      radius: number;
      glowAlpha: number;
    };
    pathFlow: {
      minZoomTier: GraphZoomTier;
      maxSegments: number;
      speed: number;
      spacing: number;
      opacity: number;
      radius: number;
    };
    lens: {
      minZoomTier: GraphZoomTier;
      radius: number;
      feather: number;
      glowAlpha: number;
      edgeAlpha: number;
      edgeLineWidth: number;
    };
    legend: {
      maxGroups: number;
    };
    diagnostics: {
      enabledInDev: boolean;
    };
  };
}

export const GRAPH_THEME: GraphTheme = {
  palette: {
    semantic: [
      "#63E6FF",
      "#30D4C7",
      "#72A8FF",
      "#8D7CFF",
      "#C07CFF",
      "#FF67D4",
      "#FFB24D",
      "#C5F55A",
    ],
    accent: {
      selected: "#FFC857",
      hovered: "#7FE0FF",
      path: "#FFB870",
      temporal: "#6DD6FF",
      provenance: "#A98CFF",
      inferred: "#FF9A61",
    },
    muted: {
      fallback: "rgba(130, 145, 165, 0.12)",
      nodeAlpha: 0.12,
      edgeOverview: "rgba(116, 166, 255, 0.05)",
      edgeStructure: "rgba(109, 164, 255, 0.11)",
      edgeInspection: "rgba(146, 194, 255, 0.18)",
      edgeFocus: "rgba(162, 184, 255, 0.34)",
    },
    background: {
      canvas: "#060B17",
      shell: "rgba(6, 13, 24, 0.76)",
      shellBorder: "rgba(112, 196, 255, 0.14)",
      shellGlow: "rgba(53, 123, 255, 0.16)",
      grid: "rgba(88, 166, 255, 0.038)",
      vignette: "rgba(1, 4, 10, 0.82)",
      nodeBorder: "#07111C",
    },
  },
  zoomTiers: {
    overview: {
      maxRatio: Number.POSITIVE_INFINITY,
      nodeScale: 0.9,
      labelThreshold: 0.985,
      labelBudget: 18,
      edgePriorityThreshold: 0.72,
      arrowPriorityThreshold: Number.POSITIVE_INFINITY,
      edgeSizeScale: 0.72,
      showBadges: false,
      showCurves: false,
      showContextualArrows: false,
    },
    structure: {
      maxRatio: 1.2,
      nodeScale: 0.98,
      labelThreshold: 0.88,
      labelBudget: 36,
      edgePriorityThreshold: 0.4,
      arrowPriorityThreshold: 0.75,
      edgeSizeScale: 0.92,
      showBadges: true,
      showCurves: true,
      showContextualArrows: true,
    },
    inspection: {
      maxRatio: 0.5,
      nodeScale: 1,
      labelThreshold: 0.7,
      labelBudget: 80,
      edgePriorityThreshold: 0,
      arrowPriorityThreshold: 0.58,
      edgeSizeScale: 1.04,
      showBadges: true,
      showCurves: true,
      showContextualArrows: true,
    },
  },
  labels: {
    forceVisibleStates: ["hovered", "selected", "neighbor", "path"],
    policies: {
      none: { minZoomTier: "inspection" },
      priority: { minZoomTier: "overview" },
      local: { minZoomTier: "structure" },
      always: { minZoomTier: "overview" },
    },
  },
  nodes: {
    backgroundScale: 0.52,
    mutedAlpha: 0.12,
    strokeHierarchy: {
      overview: { base: 0.8, emphasis: 1.2, muted: 0.45 },
      structure: { base: 1.05, emphasis: 1.45, muted: 0.55 },
      inspection: { base: 1.2, emphasis: 1.7, muted: 0.6 },
    },
    states: {
      default: { color: "base", sizeMultiplier: 1, minSize: 1.45, forceLabel: false, zIndex: 0, borderBoost: 0 },
      hovered: { color: "hovered", sizeMultiplier: 1.34, minSize: 16, forceLabel: true, zIndex: 4, borderBoost: 0.5 },
      selected: { color: "selected", sizeMultiplier: 1.18, minSize: 12, forceLabel: true, zIndex: 3, borderBoost: 0.42 },
      neighbor: { color: "base", sizeMultiplier: 1.08, minSize: 7.2, forceLabel: true, zIndex: 2, borderBoost: 0.18 },
      path: { color: "path", sizeMultiplier: 1.08, minSize: 7.2, forceLabel: true, zIndex: 2, borderBoost: 0.24 },
      inactive: { color: "muted", sizeMultiplier: 0.52, minSize: 0.8, forceLabel: false, zIndex: 0, borderBoost: -0.15 },
      muted: { color: "muted", sizeMultiplier: 0.52, minSize: 0.8, forceLabel: false, zIndex: 0, borderBoost: -0.15 },
    },
    variants: {
      default: { sizeMultiplier: 1, borderBoost: 0, haloBoost: 0, badgeVisibleFrom: "inspection" },
      temporal: { sizeMultiplier: 1.02, borderBoost: 0.12, haloBoost: 0.1, badgeKind: "temporal", badgeVisibleFrom: "structure" },
      inferred: { sizeMultiplier: 1.05, borderBoost: 0.16, haloBoost: 0.14, badgeKind: "inferred", badgeVisibleFrom: "structure" },
      provenance: { sizeMultiplier: 1.03, borderBoost: 0.14, haloBoost: 0.12, badgeKind: "provenance", badgeVisibleFrom: "structure" },
      selected: { sizeMultiplier: 1.06, borderBoost: 0.22, haloBoost: 0.16, badgeVisibleFrom: "overview" },
    },
    selectedRing: {
      color: "#FFC857",
      width: 2.4,
      glowAlpha: 0.38,
      visibleFrom: "inspection",
    },
    badges: {
      inferred: { color: "#FF9A61", label: "I" },
      temporal: { color: "#6DD6FF", label: "T" },
      provenance: { color: "#A98CFF", label: "P" },
    },
    badge: {
      radius: 7,
      offset: 3,
      fontSize: 8,
      textColor: "#08111d",
      background: "rgba(8, 17, 29, 0.9)",
      stroke: "rgba(255,255,255,0.2)",
      glowAlpha: 0.34,
    },
  },
  edges: {
    states: {
      default: { color: "inspection", sizeMultiplier: 1, minSize: 0.72, zIndex: 0, forceArrow: false, hide: false },
      hovered: { color: "hover", sizeMultiplier: 1.55, minSize: 1.8, zIndex: 3, forceArrow: true, hide: false },
      selected: { color: "hover", sizeMultiplier: 1.55, minSize: 1.8, zIndex: 3, forceArrow: true, hide: false },
      neighbor: { color: "focus", sizeMultiplier: 1.08, minSize: 0.95, zIndex: 1, forceArrow: false, hide: false },
      path: { color: "path", sizeMultiplier: 1.7, minSize: 2.2, zIndex: 4, forceArrow: true, hide: false },
      inactive: { color: "muted", sizeMultiplier: 1, minSize: 0.45, zIndex: 0, forceArrow: false, hide: true },
      muted: { color: "muted", sizeMultiplier: 1, minSize: 0.45, zIndex: 0, forceArrow: false, hide: true },
    },
    variants: {
      line: { baseType: "line", arrowPolicy: "hidden", curveStrength: 0, sizeMultiplier: 1, glowAlpha: 0 },
      directional: { baseType: "line", arrowPolicy: "contextual", curveStrength: 0, sizeMultiplier: 1.04, glowAlpha: 0.08 },
      bidirectionalCurve: { baseType: "line", arrowPolicy: "contextual", curveStrength: 0.18, sizeMultiplier: 1.08, glowAlpha: 0.1 },
      parallelCurve: { baseType: "line", arrowPolicy: "contextual", curveStrength: 0.24, sizeMultiplier: 1.1, glowAlpha: 0.12 },
      pathSignal: { baseType: "arrow", arrowPolicy: "always", curveStrength: 0.16, sizeMultiplier: 1.18, glowAlpha: 0.2 },
    },
  },
  overlays: {
    hoverGlowAlpha: 0.26,
    pathGlowAlpha: 0.2,
    glowRadiusMultiplier: 4.8,
    minGlowRadius: 16,
    pulseRadius: 11,
    curveLineWidth: 1.7,
    curveGlowWidth: 6,
    badgeGlowRadius: 14,
  },
  focus: {
    maxNeighbors: 16,
    ringCapacity: 6,
    ringGap: 250,
    primaryLabels: 6,
  },
  motion: {
    cameraMs: 380,
  },
  effects: {
    pathPulse: {
      minZoomTier: "structure",
      maxSegments: 18,
      speed: 0.22,
      radius: 11,
      glowAlpha: 0.92,
    },
    pathFlow: {
      minZoomTier: "structure",
      maxSegments: 14,
      speed: 0.36,
      spacing: 0.26,
      opacity: 0.92,
      radius: 3.8,
    },
    lens: {
      minZoomTier: "structure",
      radius: 136,
      feather: 78,
      glowAlpha: 0.18,
      edgeAlpha: 0.42,
      edgeLineWidth: 1.8,
    },
    legend: {
      maxGroups: 8,
    },
    diagnostics: {
      enabledInDev: import.meta.env.DEV,
    },
  },
};

const ZOOM_TIER_ORDER: GraphZoomTier[] = ["overview", "structure", "inspection"];

export function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function clamp(min: number, value: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function withAlpha(color: string | undefined, alpha: number): string {
  if (!color) {
    return `rgba(130, 145, 165, ${alpha})`;
  }

  if (color.startsWith("#")) {
    const hex = color.slice(1);
    const normalized = hex.length === 3
      ? hex.split("").map((char) => `${char}${char}`).join("")
      : hex;

    if (normalized.length === 6) {
      const red = Number.parseInt(normalized.slice(0, 2), 16);
      const green = Number.parseInt(normalized.slice(2, 4), 16);
      const blue = Number.parseInt(normalized.slice(4, 6), 16);
      return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
    }
  }

  if (color.startsWith("rgba(")) {
    return color.replace(/rgba\(([^)]+),\s*[\d.]+\)/, `rgba($1, ${alpha})`);
  }

  if (color.startsWith("rgb(")) {
    return color.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
  }

  return `rgba(130, 145, 165, ${alpha})`;
}

export function darkenHex(hexColor: string, amount: number): string {
  if (!hexColor.startsWith("#")) {
    return hexColor;
  }

  const hex = hexColor.slice(1);
  const normalized = hex.length === 3
    ? hex.split("").map((char) => `${char}${char}`).join("")
    : hex;

  if (normalized.length !== 6) {
    return hexColor;
  }

  const clampChannel = (value: number) => clamp(0, value, 255);
  const red = clampChannel(Number.parseInt(normalized.slice(0, 2), 16) - amount);
  const green = clampChannel(Number.parseInt(normalized.slice(2, 4), 16) - amount);
  const blue = clampChannel(Number.parseInt(normalized.slice(4, 6), 16) - amount);

  return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export function getZoomTier(ratio: number): GraphZoomTier {
  if (ratio <= GRAPH_THEME.zoomTiers.inspection.maxRatio) {
    return "inspection";
  }
  if (ratio <= GRAPH_THEME.zoomTiers.structure.maxRatio) {
    return "structure";
  }
  return "overview";
}

export function zoomTierAtLeast(current: GraphZoomTier, minimum: GraphZoomTier): boolean {
  return ZOOM_TIER_ORDER.indexOf(current) >= ZOOM_TIER_ORDER.indexOf(minimum);
}
