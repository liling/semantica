import type { GraphBehavior } from "./types";

export const focusCameraBehavior: GraphBehavior = {
  id: "focus-camera",
  attach: () => {},
  detach: () => {},
  performAction: (context, action) => {
    if (action.type !== "focusNode") {
      return false;
    }

    context.focusNodeInView(action.nodeId);
    return true;
  },
};
