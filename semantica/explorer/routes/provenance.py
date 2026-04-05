from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any
from semantica.explorer.session import get_session

router = APIRouter(prefix="/provenance", tags=["Power User Tools"])

class ProvenanceRequest(BaseModel):
    session_id: str

class ProvenanceNode(BaseModel):
    id: str
    label: str
    prov_type: str 
    parent_id: str

class ProvenanceEdge(BaseModel):
    id: str
    source: str
    target: str
    label: str

class ProvenanceResponse(BaseModel):
    nodes: List[ProvenanceNode]
    edges: List[ProvenanceEdge]

@router.post("", response_model=ProvenanceResponse)
def get_provenance_lineage(req: ProvenanceRequest):
    session = get_session(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    prov_nodes = []
    prov_edges = []
    
  
    for node_id, attrs in session.graph.nodes(data=True):
        node_type = attrs.get("nodeType", "").lower()
        
    
        if node_type in ["person", "organization", "system", "agent"]:
            prov_type = "Agent"
            parent_id = "group_agent"
        elif node_type in ["action", "event", "process", "activity", "decision"]:
            prov_type = "Activity"
            parent_id = "group_activity"
        else:
            prov_type = "Entity"
            parent_id = "group_entity"
            
        prov_nodes.append(ProvenanceNode(
            id=str(node_id),
            label=str(attrs.get("label", node_id)),
            prov_type=prov_type,
            parent_id=parent_id
        ))
        
    for u, v, attrs in session.graph.edges(data=True):
        prov_edges.append(ProvenanceEdge(
            id=f"{u}-{v}",
            source=str(u),
            target=str(v),
            label=str(attrs.get("relationship", ""))
        ))
        
    return ProvenanceResponse(
        nodes=prov_nodes,
        edges=prov_edges
    )
