"""
Semantica Explorer : Graph Session

Holds a loaded ContextGraph together with lazily-initialized analytics
components.  One session is created at server startup and shared across
all API requests via FastAPI's dependency injection.
"""

import threading
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from ..context.context_graph import ContextGraph

_KG_AVAILABLE = False
try:
    from ..kg import (
        CentralityCalculator,
        CommunityDetector,
        ConnectivityAnalyzer,
        GraphValidator,
        LinkPredictor,
        NodeEmbedder,
        PathFinder,
        SimilarityCalculator,
    )
    _KG_AVAILABLE = True
except ImportError:
    pass


class GraphSession:
    """
    Holds a loaded graph and its associated analytics components.

    Thread safety: all mutations to the graph or the annotations store
    must go through methods on this class, which are protected by an
    ``RLock``.  Lazy analytics properties are also initialised under the
    same lock to prevent double-instantiation under concurrent requests.
    """

    def __init__(self, graph: ContextGraph) -> None:
        self.graph = graph
        self._lock = threading.RLock()

        self.annotations: Dict[str, Dict[str, Any]] = {}

        self._centrality: Any = None
        self._community: Any = None
        self._connectivity: Any = None
        self._path_finder: Any = None
        self._node_embedder: Any = None
        self._similarity: Any = None
        self._link_predictor: Any = None
        self._validator: Any = None

    @classmethod
    def from_file(cls, path: str) -> "GraphSession":
        """Load a ContextGraph from a JSON file and wrap it in a session."""
        graph = ContextGraph()
        graph.load_from_file(path)
        return cls(graph)

    # ------------------------------------------------------------------
    # Lazy analytics properties (thread-safe double-checked locking)
    # ------------------------------------------------------------------

    @property
    def centrality(self) -> Any:
        with self._lock:
            if self._centrality is None and _KG_AVAILABLE:
                self._centrality = CentralityCalculator()
            return self._centrality

    @property
    def community(self) -> Any:
        with self._lock:
            if self._community is None and _KG_AVAILABLE:
                self._community = CommunityDetector()
            return self._community

    @property
    def connectivity(self) -> Any:
        with self._lock:
            if self._connectivity is None and _KG_AVAILABLE:
                self._connectivity = ConnectivityAnalyzer()
            return self._connectivity

    @property
    def path_finder(self) -> Any:
        with self._lock:
            if self._path_finder is None and _KG_AVAILABLE:
                self._path_finder = PathFinder()
            return self._path_finder

    @property
    def node_embedder(self) -> Any:
        with self._lock:
            if self._node_embedder is None and _KG_AVAILABLE:
                self._node_embedder = NodeEmbedder()
            return self._node_embedder

    @property
    def similarity(self) -> Any:
        with self._lock:
            if self._similarity is None and _KG_AVAILABLE:
                self._similarity = SimilarityCalculator()
            return self._similarity

    @property
    def link_predictor(self) -> Any:
        with self._lock:
            if self._link_predictor is None and _KG_AVAILABLE:
                self._link_predictor = LinkPredictor()
            return self._link_predictor

    @property
    def validator(self) -> Any:
        with self._lock:
            if self._validator is None and _KG_AVAILABLE:
                self._validator = GraphValidator()
            return self._validator

    # ------------------------------------------------------------------
    # Graph read helpers
    # ------------------------------------------------------------------

    def get_node(self, node_id: str) -> Optional[Dict[str, Any]]:
        """Get a single node by ID, or ``None``."""
        with self._lock:
            return self.graph.find_node(node_id)

    def get_nodes(
        self,
        node_type: Optional[str] = None,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> tuple[list[dict[str, Any]], int]:
        """Return a paginated slice of nodes and the total count."""
        with self._lock:
            if search:
                # Must load all nodes to apply the in-memory keyword filter.
                all_nodes = self.graph.find_nodes(node_type=node_type)
                search_lower = search.lower()
                all_nodes = [
                    n for n in all_nodes
                    if search_lower in n.get("id", "").lower()
                    or search_lower in n.get("content", "").lower()
                    or search_lower in str(n.get("metadata", {})).lower()
                ]
                total = len(all_nodes)
                page = all_nodes[skip: skip + limit]
            else:
                # Delegate pagination to the graph layer to avoid loading
                # the full node list into memory unnecessarily.
                stats = self.graph.stats()
                total = (
                    stats.get("node_types", {}).get(node_type, 0)
                    if node_type
                    else stats.get("node_count", 0)
                )
                page = self.graph.find_nodes(node_type=node_type, skip=skip, limit=limit)
            return page, total

    def get_edges(
        self,
        edge_type: Optional[str] = None,
        source: Optional[str] = None,
        target: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> tuple[list[dict[str, Any]], int]:
        """Return a paginated slice of edges and the total count."""
        with self._lock:
            if source or target:
                # Must load all edges to apply source/target filters in memory.
                all_edges = self.graph.find_edges(edge_type=edge_type)
                if source:
                    all_edges = [e for e in all_edges if e.get("source") == source]
                if target:
                    all_edges = [e for e in all_edges if e.get("target") == target]
                total = len(all_edges)
                page = all_edges[skip: skip + limit]
            else:
                stats = self.graph.stats()
                total = (
                    stats.get("edge_types", {}).get(edge_type, 0)
                    if edge_type
                    else stats.get("edge_count", 0)
                )
                page = self.graph.find_edges(edge_type=edge_type, skip=skip, limit=limit)
            return page, total

    def get_neighbors(self, node_id: str, depth: int = 1) -> List[Dict[str, Any]]:
        """Get neighbours for a node (BFS). Returns [] for unknown nodes."""
        with self._lock:
            return self.graph.get_neighbors(node_id, hops=depth)

    def search(self, query: str, limit: int = 20) -> List[Dict[str, Any]]:
        """Keyword search across node content.

        ``ContextGraph.query`` returns ``{"node": node.to_dict(), "score": …}``
        where ``node.to_dict()`` uses a ``"properties"`` envelope.  We normalise
        each result to the flat ``{"id", "type", "content", "metadata"}`` shape
        that the rest of the session/route layer expects.
        """
        with self._lock:
            raw = self.graph.query(query)[:limit]

        normalised = []
        for r in raw:
            node = r.get("node", {})
            props = node.get("properties", {})
            flat_node = {
                "id": node.get("id", ""),
                "type": node.get("type", "entity"),
                "content": props.get("content", node.get("content", "")),
                "metadata": {k: v for k, v in props.items() if k != "content"},
            }
            normalised.append({"node": flat_node, "score": r.get("score", 0.0)})
        return normalised

    def get_stats(self) -> Dict[str, Any]:
        """Graph-level statistics."""
        with self._lock:
            return self.graph.stats()

    def get_active_nodes(
        self, at_time: Optional[datetime] = None, node_type: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Nodes active at a given point in time."""
        with self._lock:
            return self.graph.find_active_nodes(node_type=node_type, at_time=at_time)

    # ------------------------------------------------------------------
    # Annotation CRUD
    # ------------------------------------------------------------------

    def add_annotation(self, annotation: Dict[str, Any]) -> str:
        """Add an annotation (mutates the dict in-place) and return its ID."""
        ann_id = str(uuid.uuid4())
        annotation["annotation_id"] = ann_id
        annotation["created_at"] = datetime.utcnow().isoformat()
        with self._lock:
            self.annotations[ann_id] = annotation
        return ann_id

    def get_annotations(self, node_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """List annotations, optionally filtered by node_id."""
        with self._lock:
            anns = list(self.annotations.values())
        if node_id:
            anns = [a for a in anns if a.get("node_id") == node_id]
        return anns

    def delete_annotation(self, annotation_id: str) -> bool:
        """Delete an annotation. Returns True if found and deleted."""
        with self._lock:
            return self.annotations.pop(annotation_id, None) is not None

    def build_graph_dict(self, node_ids: Optional[list] = None) -> dict:
        """
        Build the ``{entities, relationships}`` dict consumed by KG analytics
        helpers, exporters, and path-finders.

        Args:
            node_ids: Optional list of node IDs to include.  When given, only
                      nodes in the list and edges between them are returned.
        """
        nodes, _ = self.get_nodes(skip=0, limit=999_999)
        edges, _ = self.get_edges(skip=0, limit=999_999)

        if node_ids:
            id_set = set(node_ids)
            nodes = [n for n in nodes if n.get("id") in id_set]
            edges = [
                e for e in edges
                if e.get("source") in id_set and e.get("target") in id_set
            ]

        return {
            "entities": [
                {
                    "id": n.get("id"),
                    "type": n.get("type", "entity"),
                    "text": n.get("content", n.get("id", "")),
                    "metadata": n.get("metadata", {}),
                }
                for n in nodes
            ],
            "relationships": [
                {
                    "source": e.get("source"),
                    "target": e.get("target"),
                    "type": e.get("type", "related_to"),
                    "metadata": e.get("metadata", {}),
                }
                for e in edges
            ],
        }

    # ------------------------------------------------------------------
    # Graph mutation helpers
    # ------------------------------------------------------------------

    def add_nodes(self, nodes: List[Dict[str, Any]]) -> int:
        """Thread-safe node addition."""
        with self._lock:
            return self.graph.add_nodes(nodes)

    def add_edges(self, edges: List[Dict[str, Any]]) -> int:
        """Thread-safe edge addition."""
        with self._lock:
            return self.graph.add_edges(edges)
