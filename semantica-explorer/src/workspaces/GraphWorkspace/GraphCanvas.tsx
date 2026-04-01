/**
 * src/workspaces/GraphWorkspace/GraphCanvas.tsx
 */
import { useEffect, useRef, useCallback } from "react";
import Sigma from "sigma";
import FA2Layout from "graphology-layout-forceatlas2/worker";
import { graph } from "../../store/graphStore";

export interface GraphCanvasProps {
  onNodeClick: (nodeId: string) => void;
  isLayoutRunning: boolean;
  className?: string;
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
  labelRenderedSizeThreshold: 6,
  defaultNodeType: "circle",
  defaultEdgeType: "arrow",
  hideEdgesOnMove: true,
  webGLTarget: "webgl2" as const,
};

export function GraphCanvas({ onNodeClick, isLayoutRunning, className }: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const fa2Ref = useRef<FA2Layout | null>(null);

  useEffect(() => {
    if (!containerRef.current || sigmaRef.current) return;

    const sigma = new Sigma(graph, containerRef.current, SIGMA_SETTINGS);
    sigmaRef.current = sigma;

    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current && containerRef.current.offsetWidth > 0) {
        sigma.refresh();
      }
    });
    resizeObserver.observe(containerRef.current);
  

    sigma.on("clickNode", ({ node }) => {
      onNodeClick(node);
      graph.setNodeAttribute(node, "highlighted", true);
      graph.forEachNode((n) => {
        if (n !== node) graph.setNodeAttribute(n, "highlighted", false);
      });
    });

    sigma.on("clickStage", () => {
      onNodeClick("");
      graph.forEachNode((n) => graph.setNodeAttribute(n, "highlighted", false));
    });

    return () => {
      resizeObserver.disconnect();
      sigma.kill();
      sigmaRef.current = null;
    };
  }, [onNodeClick]);

  useEffect(() => {
    if (isLayoutRunning) {
      if (!fa2Ref.current) {
        fa2Ref.current = new FA2Layout(graph, FA2_SETTINGS);
      }
      fa2Ref.current.start();
    } else {
      fa2Ref.current?.stop();
    }

    return () => {
      fa2Ref.current?.kill();
      fa2Ref.current = null;
    };
  }, [isLayoutRunning]);

  const handleFitView = useCallback(() => {
    sigmaRef.current?.getCamera().animatedReset({ duration: 500 });
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} className={className} style={{ width: "100%", height: "100%", background: "#0d1117" }} />
      <button
        onClick={handleFitView}
        style={{
          position: "absolute", bottom: 16, right: 16, padding: "8px 16px",
          background: "#1f6feb", color: "#fff", border: "none", borderRadius: 6,
          cursor: "pointer", fontWeight: 600, zIndex: 10,
        }}
      >
        Fit View
      </button>
    </div>
  );
}