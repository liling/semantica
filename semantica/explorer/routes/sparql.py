from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import rdflib
import re
from loguru import logger
from semantica.explorer.session import get_session

router = APIRouter(prefix="/sparql", tags=["Power User Tools"])

class SparqlRequest(BaseModel):
    query: str
    session_id: str

class SparqlResponse(BaseModel):
    columns: List[str]
    rows: List[Dict[str, Any]]
    total: int
    error: Optional[str] = None
    error_line: Optional[int] = None
    error_column: Optional[int] = None

@router.post("", response_model=SparqlResponse)
def execute_sparql(req: SparqlRequest):
    session = get_session(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
   
    g = rdflib.Graph()
    NS = rdflib.Namespace("http://semantica.local/entity/")
    PROP = rdflib.Namespace("http://semantica.local/prop/")
    
    for node_id, attrs in session.graph.nodes(data=True):
        subject = NS[str(node_id)]
        g.add((subject, rdflib.RDF.type, NS[attrs.get('nodeType', 'Entity')]))
        
        properties = attrs.get('properties', {})
        for k, v in properties.items():
            g.add((subject, PROP[k], rdflib.Literal(v)))
            
    for u, v, attrs in session.graph.edges(data=True):
        subject = NS[str(u)]
        object_ = NS[str(v)]
        g.add((subject, PROP[attrs.get('relationship', 'relatedTo')], object_))

    try:
        qres = g.query(req.query)
        columns = [str(var) for var in qres.vars] if qres.vars else []
        rows = []
        for row in qres:
            row_dict = {}
            for idx, col in enumerate(columns):
                val = row[idx]
                row_dict[col] = str(val) if val else None
            rows.append(row_dict)
            
        return SparqlResponse(
            columns=columns,
            rows=rows,
            total=len(rows)
        )
    except Exception as e:
        error_str = str(e)
        logger.error(f"SPARQL execution error: {error_str}")
        
        error_line = None
        error_column = None
        
      
        line_match = re.search(r'line[\s:]+(\d+)', error_str, re.IGNORECASE)
        col_match = re.search(r'col(?:umn)?[\s:]+(\d+)', error_str, re.IGNORECASE)
        
        if line_match:
            error_line = int(line_match.group(1))
        if col_match:
            error_column = int(col_match.group(1))
            
        return SparqlResponse(
            columns=[],
            rows=[],
            total=0,
            error=error_str,
            error_line=error_line,
            error_column=error_column
        )
