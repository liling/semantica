import type { GraphBehavior } from "./types";

export function createViewModeSwitchBehavior(): GraphBehavior {
  let lastViewMode: "focused" | "full" | null = null;

  return {
    id: "view-mode-switch",
    attach: () => {},
    detach: () => {
      lastViewMode = null;
    },
    onStateChange: (context, interactionState) => {
      if (interactionState.viewMode === lastViewMode) {
        return;
      }

      lastViewMode = interactionState.viewMode;

      if (interactionState.focusedNodeId) {
        context.dispatchAction({ type: "focusNode", nodeId: interactionState.focusedNodeId });
        return;
      }

      context.dispatchAction({ type: "fitView" });
    },
  };
}
