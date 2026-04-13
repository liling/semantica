import type { GraphBehavior } from "./types";

export function createSearchFocusBehavior(): GraphBehavior {
  let lastFocusedNodeId = "";

  return {
    id: "search-focus",
    attach: () => {},
    detach: () => {
      lastFocusedNodeId = "";
    },
    onStateChange: (context, interactionState) => {
      const nextFocusedNodeId = interactionState.focusedNodeId;
      if (!nextFocusedNodeId || nextFocusedNodeId === lastFocusedNodeId) {
        lastFocusedNodeId = nextFocusedNodeId;
        return;
      }

      lastFocusedNodeId = nextFocusedNodeId;
      context.dispatchAction({ type: "focusNode", nodeId: nextFocusedNodeId });
    },
  };
}
