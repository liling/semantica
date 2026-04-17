import type { GraphBehavior } from "./types";

export const clickSelectionBehavior: GraphBehavior = {
  id: "click-selection",
  attach: () => {},
  detach: () => {},
  onNodeClick: (context, nodeId) => {
    context.setHoveredNodeId(nodeId);
    context.onEdgeSelectionChange("");
    context.onNodeSelectionChange(nodeId);
  },
  onEdgeClick: (context, edgeId) => {
    context.setHoveredNodeId(null);
    context.onEdgeSelectionChange(edgeId);
  },
  onStageClick: (context) => {
    context.setHoveredNodeId(null);
    context.onEdgeSelectionChange("");
    context.onNodeSelectionChange("");
  },
};
