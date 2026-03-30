"""
Vocabulary routes - SKOS ingestion, scheme listing, and hierarchy trees.
"""

import asyncio
from collections import defaultdict
from typing import List

from fastapi import APIRouter, Depends, File, Query, UploadFile

from ..dependencies import get_session
from ..schemas import ConceptNode, VocabularyScheme
from ..session import GraphSession
from ..utils.rdf_parser import parse_skos_file

router = APIRouter(prefix="/api/vocabulary", tags=["Vocabulary"])


@router.get("/schemes", response_model=List[VocabularyScheme])
async def list_schemes(
    session: GraphSession = Depends(get_session),
):
    """List all available SKOS Concept Schemes (Vocabularies)."""
    nodes, _ = await asyncio.to_thread(
        session.get_nodes, node_type="skos:ConceptScheme", skip=0, limit=999_999
    )
    
    schemes = []
    for n in nodes:
        meta = n.get("metadata", n.get("properties", {}))
        schemes.append(
            VocabularyScheme(
                uri=n.get("id", ""),
                label=meta.get("content", n.get("content", n.get("id", ""))),
                description=meta.get("description"),
            )
        )
    return schemes


@router.post("/import")
async def import_vocabulary(
    file: UploadFile = File(...),
    session: GraphSession = Depends(get_session),
):
    """
    Import a SKOS vocabulary from a .ttl or .rdf file.
    """
    content = await file.read()
    filename = file.filename or "vocabulary.ttl"
    

    parse_format = "xml" if filename.endswith((".rdf", ".owl")) else "turtle"
    
    try:
        nodes, edges = await asyncio.to_thread(parse_skos_file, content, parse_format)
    except ValueError as exc:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail=str(exc))

    added_nodes = await asyncio.to_thread(session.add_nodes, nodes)
    added_edges = await asyncio.to_thread(session.add_edges, edges)

    return {
        "status": "success",
        "filename": filename,
        "nodes_added": added_nodes,
        "edges_added": added_edges,
    }


@router.get("/hierarchy", response_model=List[ConceptNode])
async def get_hierarchy(
    scheme: str = Query(..., description="The URI of the ConceptScheme to load"),
    session: GraphSession = Depends(get_session),
):
    """
    Fetch the nested broader/narrower tree for a specific vocabulary scheme.
    Executes in O(V+E) time by building the adjacency list in memory.
    """

    nodes, _ = await asyncio.to_thread(
        session.get_nodes, node_type="skos:Concept", skip=0, limit=999_999
    )
    edges, _ = await asyncio.to_thread(session.get_edges, skip=0, limit=999_999)

  
    scheme_node_ids = set()
    for e in edges:
        src, tgt, etype = e.get("source"), e.get("target"), e.get("type")
        if tgt == scheme and etype in ("skos:inScheme", "skos:topConceptOf"):
            scheme_node_ids.add(src)
        elif src == scheme and etype == "skos:hasTopConcept":
            scheme_node_ids.add(tgt)

    node_map = {}
    for n in nodes:
        nid = n.get("id")
        if nid in scheme_node_ids:
            meta = n.get("metadata", n.get("properties", {}))
            node_map[nid] = ConceptNode(
                uri=nid,
                pref_label=meta.get("content", n.get("content", nid)),
                alt_labels=meta.get("alt_labels", []),
                children=[]
            )


    parent_to_children = defaultdict(list)
    has_parent = set()

    for e in edges:
        src, tgt, etype = e.get("source"), e.get("target"), e.get("type")
        if src in node_map and tgt in node_map:
            if etype == "skos:broader":
                # Source is narrower (child), Target is broader (parent)
                parent_to_children[tgt].append(src)
                has_parent.add(src)
            elif etype == "skos:narrower":
                # Source is broader (parent), Target is narrower (child)
                parent_to_children[src].append(tgt)
                has_parent.add(tgt)

    # Assemble nested tree — cycle-safe via visited set.
    def _attach_children(nid: str, visited: set) -> ConceptNode:
        node_obj = node_map[nid]
        child_ids = [c for c in parent_to_children.get(nid, []) if c not in visited]
        if child_ids:
            node_obj.children = [
                _attach_children(cid, visited | {nid}) for cid in child_ids
            ]
        else:
            node_obj.children = None  # leaf node signal for the UI
        return node_obj

    roots = [
        _attach_children(nid, {nid})
        for nid in node_map
        if nid not in has_parent
    ]
    return roots