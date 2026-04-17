import type { GraphBehavior } from "./types";

export function createPathHighlightBehavior(): GraphBehavior {
  let lastPathSignature = "";

  return {
    id: "path-highlight",
    attach: () => {},
    detach: () => {
      lastPathSignature = "";
    },
    onStateChange: (context, interactionState) => {
      const nextPathSignature = interactionState.activePath.join("::");
      if (nextPathSignature === lastPathSignature) {
        return;
      }

      lastPathSignature = nextPathSignature;
      context.sigma.refresh();
    },
  };
}
