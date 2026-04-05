/**
 * src/workspaces/LineageWorkspace/LineageDiagram.tsx
 */
import { useEffect, useState } from "react";
import { ReactFlow, Background, Controls } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const THEME_CSS = `
  .react-flow { background: #0d1117; }
  .react-flow__node-group {
    background: rgba(88,166,255,0.05);
    border: 1px dashed rgba(88,166,255,0.2);
    border-radius: 8px;
  }
  .react-flow__node-default {
    background: #161b22;
    color: #c9d1d9;
    border: 1px solid rgba(88,166,255,0.3);
    border-radius: 6px;
    padding: 10px;
    font-size: 12px;
  }
`;

export function LineageDiagram() {
  const [nodes, setNodes] = useState<any[]>([]);
  const [edges, setEdges] = useState<any[]>([]);

  useEffect(() => {

    const xLanes = [
      { id: "group_agent", type: "group", position: { x: 50, y: 50 }, style: { width: 800, height: 120 } },
      { id: "group_activity", type: "group", position: { x: 50, y: 200 }, style: { width: 800, height: 120 } },
      { id: "group_entity", type: "group", position: { x: 50, y: 350 }, style: { width: 800, height: 120 } }
    ];

    const fetchLineage = async () => {
      try {
        const res = await fetch("http://localhost:8000/api/provenance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: "default" })
        });
        const data = await res.json();


        const counters: Record<string, number> = { "group_agent": 0, "group_activity": 0, "group_entity": 0 };

        const mappedNodes = data.nodes.map((n: any) => {
          const c = counters[n.parent_id] || 0;
          counters[n.parent_id] = c + 1;
          return {
            id: n.id,
            data: { label: n.label + "\\n(" + n.prov_type + ")" },
            position: { x: 50 + c * 180, y: 30 },
            parentId: n.parent_id,
            extent: "parent",
            type: "default"
          };
        });

        const mappedEdges = data.edges.map((e: any) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label,
          animated: true,
          style: { stroke: "#58a6ff" }
        }));

        setNodes([...xLanes, ...mappedNodes]);
        setEdges(mappedEdges);
      } catch (err) {
        console.error(err);
      }
    };
    fetchLineage();
  }, []);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <style>{THEME_CSS}</style>
      <div style={{ position: "absolute", top: 16, left: 16, zIndex: 10, background: "rgba(13,17,23,0.8)", padding: "4px 8px", borderRadius: 4, color: "#fff", fontWeight: 600, border: "1px solid rgba(255,255,255,0.1)", pointerEvents: "none" }}>
        PROV-O Lineage
      </div>
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <Background color="#30363d" gap={20} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
