"""
Export & import routes.
"""

import csv
import io
import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from fastapi.responses import Response

logger = logging.getLogger(__name__)

from ..dependencies import get_session
from ..schemas import ExportRequest, ImportResponse
from ..session import GraphSession

router = APIRouter(tags=["Export / Import"])


@router.post("/api/import", response_model=ImportResponse)
async def import_file(
    file: UploadFile = File(...),
    session: GraphSession = Depends(get_session)
):
    """
    Import entities and edges from an uploaded JSON or CSV file.
    """
    content = await file.read()
    filename = file.filename or ""

    if filename.endswith(".json"):
        try:
            data = json.loads(content)
            
            if isinstance(data, list):
                if len(data) > 0 and ("source" in data[0] or "source_id" in data[0]):
                    raw_edges = data
                    raw_nodes = []
                else:
                    raw_nodes = data
                    raw_edges = []
            elif isinstance(data, dict):
                raw_nodes = data.get("nodes", data.get("entities", []))
                raw_edges = data.get("edges", data.get("relationships", []))
            else:
                raw_nodes = []
                raw_edges = []
            
            nodes = []
            for n in raw_nodes:
                if "properties" in n:
                    nodes.append(n)
                else:
                    nodes.append({
                        "id": n.get("id"),
                        "type": n.get("type", "entity"),
                        "properties": {
                            "content": n.get("text", n.get("content", n.get("id", ""))),
                            **(n.get("metadata", {}))
                        }
                    })
                    
            edges = []
            for r in raw_edges:
                src = r.get("source_id", r.get("source"))
                tgt = r.get("target_id", r.get("target"))
                if not src or not tgt:
                    continue
                edges.append({
                    "source_id": src,
                    "target_id": tgt,
                    "type": r.get("type", "related_to"),
                    "weight": r.get("weight", 1.0),
                    "properties": r.get("metadata", r.get("properties", {}))
                })
                
            nodes_added = session.add_nodes(nodes)
            edges_added = session.add_edges(edges)
            
            return ImportResponse(nodes_imported=nodes_added, edges_imported=edges_added)

        except json.JSONDecodeError as e:
            raise HTTPException(status_code=422, detail=f"Invalid JSON file: {str(e)}")
        except Exception as e:
            logger.exception("Import JSON failed")
            raise HTTPException(status_code=500, detail=str(e))
            
    elif filename.endswith(".csv"):
        try:
            # Parse CSV content
            decoded_content = content.decode("utf-8-sig")
            reader = csv.DictReader(io.StringIO(decoded_content))
            
            nodes = []
            edges = []
            
            for row in reader:
                # Basic mapping attempts based on standard column names
                # Try to find source and target for edges
                src = row.get("source") or row.get("source_id")
                tgt = row.get("target") or row.get("target_id")
                
                # Try to find node identity
                node_id = row.get("id") or row.get("node_id")
                
                # If we have both source and target, we assume it's an edge
                if src and tgt:
                    edges.append({
                        "source_id": src,
                        "target_id": tgt,
                        "type": row.get("type", row.get("relationship", "related_to")),
                        "weight": float(row.get("weight", 1.0)),
                        "properties": {k: v for k, v in row.items() if k not in ("source", "source_id", "target", "target_id", "type", "relationship", "weight")}
                    })
                # If we have a node id, we assume it's a node
                elif node_id:
                    nodes.append({
                        "id": node_id,
                        "type": row.get("type", "entity"),
                        "properties": {k: v for k, v in row.items() if k not in ("id", "node_id", "type")}
                    })
                    
            nodes_added = session.add_nodes(nodes)
            edges_added = session.add_edges(edges)
            
            return ImportResponse(nodes_imported=nodes_added, edges_imported=edges_added)
            
        except UnicodeDecodeError:
            raise HTTPException(status_code=422, detail="CSV file must be UTF-8 encoded")
        except Exception as e:
            logger.exception("Import CSV failed")
            raise HTTPException(status_code=500, detail=str(e))
            
    else:
        raise HTTPException(status_code=422, detail=f"Unsupported file type. Please upload a .json or .csv file.")


@router.post("/api/export")
async def export_graph(
    body: ExportRequest,
    session: GraphSession = Depends(get_session),
):
    """Export the current graph in the requested format."""
    fmt = body.format.lower()
    
    kg = session.build_graph_dict(body.node_ids)
    
    if fmt == "json":
        content = json.dumps(kg, indent=2, default=str)
        content_type = "application/json"
        ext = ".json"
        
    elif fmt == "csv":
        # Create an in-memory CSV map
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Write Nodes
        writer.writerow(["--- NODES ---"])
        writer.writerow(["id", "type", "content"])
        # Use nodes mapping properly from build_graph_dict which is ContextGraph native object map
        # Or standard {"entities":[], "relationships":[]} format based on how session.build_graph_dict is returning things
        # session.build_graph_dict normally returns dict of the graph store structure. Let's gracefully read it.
        nodes = kg.get("nodes", kg.get("entities", []))
        for n in nodes:
            props = n.get("properties", n.get("metadata", {}))
            content_val = n.get("content", n.get("text", props.get("content", "")))
            writer.writerow([n.get("id"), n.get("type", "entity"), content_val])
            
        # Write Edges
        writer.writerow([])
        writer.writerow(["--- EDGES ---"])
        writer.writerow(["source", "target", "type", "weight"])
        edges = kg.get("edges", kg.get("relationships", []))
        for e in edges:
            src = e.get("source_id", e.get("source"))
            tgt = e.get("target_id", e.get("target"))
            writer.writerow([src, tgt, e.get("type", "related_to"), e.get("weight", 1.0)])
            
        content = output.getvalue()
        content_type = "text/csv"
        ext = ".csv"
        
    else:
        raise HTTPException(status_code=422, detail=f"Unsupported export format '{fmt}'")

    filename = f"semantica_export{ext}"
    return Response(
        content=content,
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
