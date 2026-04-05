"""
Temporal routes — snapshot, diff, patterns.

Hardened for production with:
- Multi-format ISO 8601 date parsing (YYYY, YYYY-MM-DD, full ISO strings)
- Optimized /snapshot that returns only node IDs (not full objects)
  to minimize JSON payload during high-speed scrubbing
- Graceful fallback for malformed dates (node becomes "Always Active")
"""

import asyncio
import logging
import re
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from ..dependencies import get_session
from ..schemas import (
    TemporalDiffResponse,
    TemporalPatternResponse,
)
from ..session import GraphSession

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/temporal", tags=["Temporal"])



class TemporalSnapshotFastResponse(BaseModel):
    """Lightweight snapshot: returns only active node IDs for fast scrubbing."""
    timestamp: str
    active_node_ids: List[str]
    active_node_count: int



def _parse_flexible_dt(value: str) -> Optional[datetime]:
    """
    Parse multiple ISO 8601 formats into a tz-naive UTC datetime.

    Supported formats (in priority order):
        - Full ISO with timezone: "1990-01-15T00:00:00+00:00" / "...Z"
        - Full ISO without tz:    "1990-01-15T00:00:00"
        - Date only:              "1990-01-15"
        - Year only:              "1990"

    Returns None if parsing fails (caller should treat node as Always-Active).
    """
    if not value:
        return None

    s = str(value).strip()

    if re.fullmatch(r"\d{4}", s):
        s = f"{s}-01-01"


    s = s.replace("Z", "+00:00")

    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt
    except (ValueError, AttributeError) as exc:
        logger.warning(
            "Malformed temporal value %r — treating node as Always-Active. (%s)", value, exc
        )
        return None


def _parse_query_dt(value: str) -> datetime:
    """Parse the at= query parameter. Falls back to utcnow() on failure."""
    dt = _parse_flexible_dt(value)
    if dt is None:
        logger.warning("Could not parse query timestamp %r — defaulting to utcnow()", value)
        return datetime.utcnow()
    return dt


def _node_is_active(node: dict, at_time: datetime) -> bool:
    """
    Check temporal activity with multi-format date support.

    Logic: valid_from <= at_time AND (valid_until IS NULL OR valid_until >= at_time)
    A node with no temporal bounds at all is always active.
    A node with a malformed date on either bound is always active.
    """
    meta = node.get("metadata", {})

    raw_from = node.get("valid_from") or meta.get("valid_from")
    raw_until = node.get("valid_until") or meta.get("valid_until")


    if raw_from is None and raw_until is None:
        return True

    valid_from = _parse_flexible_dt(raw_from) if raw_from else None
    valid_until = _parse_flexible_dt(raw_until) if raw_until else None

    if valid_from is not None and at_time < valid_from:
        return False
    if valid_until is not None and at_time > valid_until:
        return False

    return True

# Routes

@router.get("/snapshot", response_model=TemporalSnapshotFastResponse)
async def temporal_snapshot(
    at: Optional[str] = Query(
        None, description="ISO-8601 datetime or year (e.g. '1990' or '1990-06-15T00:00:00Z'); defaults to now."
    ),
    session: GraphSession = Depends(get_session),
):
    """
    Return the set of node IDs that are active at the given timestamp.

    This endpoint is optimised for high-frequency scrubbing: instead of sending
    full node objects it sends only a flat list of active IDs.  The frontend
    reconciles visibility directly on the sigma.js WebGL graph without any
    React state updates.
    """
    at_time = _parse_query_dt(at) if at else datetime.utcnow()

    # Pull lightweight active list from the session
    active = await asyncio.to_thread(session.get_active_nodes, at_time=at_time)

    active_ids = [n["id"] for n in active if n.get("id")]

    return TemporalSnapshotFastResponse(
        timestamp=at_time.isoformat(),
        active_node_ids=active_ids,
        active_node_count=len(active_ids),
    )


@router.get("/diff", response_model=TemporalDiffResponse)
async def temporal_diff(
    from_time: str = Query(..., description="Start ISO-8601 datetime"),
    to_time: str = Query(..., description="End ISO-8601 datetime"),
    session: GraphSession = Depends(get_session),
):
    """
    Diff the graph between two points in time.

    Returns node IDs that were added (active at ``to_time`` but not
    ``from_time``) and removed (active at ``from_time`` but not
    ``to_time``).
    """
    t1 = _parse_query_dt(from_time)
    t2 = _parse_query_dt(to_time)

    active_t1, active_t2 = await asyncio.gather(
        asyncio.to_thread(session.get_active_nodes, at_time=t1),
        asyncio.to_thread(session.get_active_nodes, at_time=t2),
    )

    ids_t1 = {n.get("id") for n in active_t1}
    ids_t2 = {n.get("id") for n in active_t2}

    return TemporalDiffResponse(
        from_time=t1.isoformat(),
        to_time=t2.isoformat(),
        added_nodes=sorted(ids_t2 - ids_t1),
        removed_nodes=sorted(ids_t1 - ids_t2),
    )


@router.get("/patterns", response_model=TemporalPatternResponse)
async def temporal_patterns(
    session: GraphSession = Depends(get_session),
):
    """
    Detect temporal patterns (trends, cycles, anomalies).

    Falls back to a stub when ``TemporalPatternDetector`` is not available.
    """
    try:
        from ...kg import TemporalPatternDetector
        detector = TemporalPatternDetector()

        nodes, _ = await asyncio.to_thread(session.get_nodes, skip=0, limit=999_999)
        edges, _ = await asyncio.to_thread(session.get_edges, skip=0, limit=999_999)
        graph_dict = {
            "entities": [
                {"id": n.get("id"), "type": n.get("type"), "metadata": n.get("metadata", {})}
                for n in nodes
            ],
            "relationships": [
                {"source": e.get("source"), "target": e.get("target"),
                 "type": e.get("type"), "metadata": e.get("metadata", {})}
                for e in edges
            ],
        }

        patterns = await asyncio.to_thread(detector.detect_patterns, graph_dict)
        if isinstance(patterns, dict):
            patterns = patterns.get("patterns", [])
        return TemporalPatternResponse(patterns=patterns if isinstance(patterns, list) else [])
    except ImportError:
        return TemporalPatternResponse(patterns=[])
    except Exception as exc:
        logger.warning("temporal_patterns failed: %s", exc, exc_info=True)
        return TemporalPatternResponse(patterns=[])
