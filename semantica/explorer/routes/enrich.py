"""
Enrichment & reasoning routes — extraction, link prediction, dedup, reasoning.
"""

import asyncio

from fastapi import APIRouter, Depends

from ..dependencies import get_session
from ..schemas import (
    DedupRequest,
    DedupResponse,
    EnrichExtractRequest,
    EnrichExtractResponse,
    LinkPredictionRequest,
    LinkPredictionResponse,
    ReasoningRequest,
    ReasoningResponse,
    MergeRequest,
    MergeResponse,
)
from ..session import GraphSession

router = APIRouter(tags=["Enrichment"])


@router.post("/api/enrich/extract", response_model=EnrichExtractResponse)
async def extract_entities(
    body: EnrichExtractRequest,
    session: GraphSession = Depends(get_session),
):
    """Extract entities and relations from free text."""
    try:
        from ...semantic_extract.methods import extract_entities as _extract_entities
        from ...semantic_extract.methods import extract_relations as _extract_relations

        entities = await asyncio.to_thread(_extract_entities, body.text)
        relations = await asyncio.to_thread(_extract_relations, body.text)

        ent_list = entities if isinstance(entities, list) else getattr(entities, "entities", [])
        rel_list = relations if isinstance(relations, list) else getattr(relations, "relations", [])

        return EnrichExtractResponse(
            entities=[_safe_dict(e) for e in ent_list],
            relations=[_safe_dict(r) for r in rel_list],
        )
    except ImportError:
        raise ValueError(
            "semantic_extract module not available. "
            "Ensure spacy and transformers are installed."
        )
    except Exception as exc:
        raise ValueError(f"Extraction failed: {exc}")


@router.post("/api/enrich/links", response_model=LinkPredictionResponse)
async def predict_links(
    body: LinkPredictionRequest,
    session: GraphSession = Depends(get_session),
):
    """Predict likely new edges for a node."""
    predictor = session.link_predictor
    if predictor is None:
        raise ValueError("LinkPredictor not available — KG extras may not be installed.")

    node = await asyncio.to_thread(session.get_node, body.node_id)
    if node is None:
        raise KeyError(body.node_id)

    nodes, _ = await asyncio.to_thread(session.get_nodes, skip=0, limit=999_999)
    edges, _ = await asyncio.to_thread(session.get_edges, skip=0, limit=999_999)


    existing_neighbours = {
        e.get("target") for e in edges if e.get("source") == body.node_id
    } | {
        e.get("source") for e in edges if e.get("target") == body.node_id
    }

    def _score_all() -> list:
        results = []
        for n in nodes:
            candidate = n.get("id")
            if not candidate or candidate == body.node_id or candidate in existing_neighbours:
                continue
            try:
                score = predictor.score_link(session.graph, body.node_id, candidate)
                if score > 0:
                    results.append(
                        {"target": candidate, "score": score, "type": n.get("type", "entity")}
                    )
            except Exception:
                continue
        results.sort(key=lambda x: x["score"], reverse=True)
        return results

    scored = await asyncio.to_thread(_score_all)

    return LinkPredictionResponse(
        node_id=body.node_id,
        predictions=scored[: body.top_n],
    )


@router.post("/api/enrich/dedup", response_model=DedupResponse)
async def detect_duplicates(
    body: DedupRequest,
    session: GraphSession = Depends(get_session),
):
    """Run a deduplication scan over graph entities."""
    try:
        from ...deduplication import DuplicateDetector

        detector = DuplicateDetector()
        nodes, _ = await asyncio.to_thread(session.get_nodes, skip=0, limit=999_999)

        entities = [
            {
                "id": n.get("id"),
                "text": n.get("content", n.get("id", "")),
                "type": n.get("type", "entity"),
            }
            for n in nodes
        ]

        dups = await asyncio.to_thread(
            detector.detect_duplicates, entities, threshold=body.threshold
        )
        dup_list = dups if isinstance(dups, list) else getattr(dups, "duplicates", [])
        return DedupResponse(
            duplicates=[_safe_dict(d) for d in dup_list],
            total_flagged=len(dup_list),
        )
    except ImportError:
        raise ValueError("Deduplication module not available.")
    except Exception as exc:
        raise ValueError(f"Dedup scan failed: {exc}")


@router.post("/api/reason", response_model=ReasoningResponse)
async def run_reasoning(
    body: ReasoningRequest,
    session: GraphSession = Depends(get_session),
):
    """Run inference rules over facts."""
    try:
        from ...reasoning.reasoner import Reasoner

        reasoner = Reasoner()
        inferred = await asyncio.to_thread(
            reasoner.infer_facts, body.facts, body.rules
        )

        return ReasoningResponse(
            inferred_facts=inferred if isinstance(inferred, list) else [],
            rules_fired=len(inferred) if isinstance(inferred, list) else 0,
        )
    except ImportError:
        raise ValueError("Reasoning module not available.")
    except Exception as exc:
        raise ValueError(f"Reasoning failed: {exc}")


def _safe_dict(obj) -> dict:
    """Convert an object to a JSON-safe dict."""
    if isinstance(obj, dict):
        return obj
    if hasattr(obj, "__dict__"):
        return {k: v for k, v in obj.__dict__.items() if not k.startswith("_")}
    return {"value": str(obj)}

@router.post("/api/enrich/merge", response_model=MergeResponse)
async def merge_nodes(
    body: MergeRequest,
    session: GraphSession = Depends(get_session),
):
    """Merge duplicate nodes into a primary node."""
    primary_id = body.primary_id
    duplicate_ids = body.duplicate_ids
    
    if primary_id not in session.graph:
        raise ValueError(f"Primary node {primary_id} not found")

    edges_updated = 0
    removed_ids = []

    # Get primary node attributes
    primary_attrs = session.graph.nodes[primary_id]

    for dup_id in duplicate_ids:
        if dup_id not in session.graph or dup_id == primary_id:
            continue
            
        dup_attrs = session.graph.nodes[dup_id]
     
        primary_props = primary_attrs.setdefault("properties", {})
        dup_props = dup_attrs.get("properties", {})
        
        for k, v in dup_props.items():
            if k not in primary_props:
                primary_props[k] = v


        edges_to_add = []
        edges_to_remove = []
        for u, v, attrs in session.graph.edges(dup_id, data=True):
            edges_to_remove.append((u, v))
            new_u = primary_id if u == dup_id else u
            new_v = primary_id if v == dup_id else v
            if new_u != new_v and not session.graph.has_edge(new_u, new_v):
                edges_to_add.append((new_u, new_v, attrs))

        for u, v in edges_to_remove:
            session.graph.remove_edge(u, v)

        for u, v, attrs in edges_to_add:
            session.graph.add_edge(u, v, **attrs)
            edges_updated += 1
            
        session.graph.remove_node(dup_id)
        removed_ids.append(dup_id)

    return MergeResponse(
        merged_into=primary_id,
        removed_ids=removed_ids,
        edges_updated=edges_updated
    )
