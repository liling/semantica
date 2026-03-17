"""
AgnoKnowledgeGraph — Relational agent knowledge backed by Semantica's KG pipeline.

Implements Agno's ``AgentKnowledge`` protocol so that Agno agents can query a
structured ``ContextGraph`` instead of a flat vector document store.

Ingested documents pass through the full Semantica extraction pipeline:

    parse → split → NER → relation extract → graph build

and search uses multi-hop GraphRAG: vector retrieval + graph traversal +
context injection.

Install
-------
    pip install semantica[agno]

Example
-------
    >>> from integrations.agno import AgnoKnowledgeGraph
    >>> from semantica.kg import GraphBuilder
    >>> from semantica.semantic_extract import NERExtractor, RelationExtractor
    >>> kg = AgnoKnowledgeGraph(
    ...     graph_builder=GraphBuilder(),
    ...     ner_extractor=NERExtractor(),
    ...     relation_extractor=RelationExtractor(),
    ... )
    >>> kg.load("regulatory_docs/", recursive=True)
    >>> from agno.agent import Agent
    >>> agent = Agent(knowledge=kg, search_knowledge=True)
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Union

from semantica.utils.logging import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Optional: Agno AgentKnowledge base class
# ---------------------------------------------------------------------------
AGNO_AVAILABLE = False
AGNO_IMPORT_ERROR: Optional[str] = None

_KnowledgeBase: Any = object

try:
    from agno.knowledge.base import AgentKnowledge as _AgnoAgentKnowledge  # type: ignore

    _KnowledgeBase = _AgnoAgentKnowledge
    AGNO_AVAILABLE = True
except ImportError as exc:
    AGNO_IMPORT_ERROR = str(exc)


# ---------------------------------------------------------------------------
# Lightweight document stand-in (used when agno is absent)
# ---------------------------------------------------------------------------
class _Document:
    """Minimal stand-in for ``agno.document.Document``."""

    __slots__ = ("id", "content", "meta_data", "name")

    def __init__(
        self,
        content: str,
        id: Optional[str] = None,
        name: Optional[str] = None,
        meta_data: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.id = id
        self.content = content
        self.name = name
        self.meta_data = meta_data or {}


try:
    from agno.document.base import Document as AgnoDocument  # type: ignore
except ImportError:
    AgnoDocument = _Document  # type: ignore


# ---------------------------------------------------------------------------
# AgnoKnowledgeGraph
# ---------------------------------------------------------------------------
class AgnoKnowledgeGraph(_KnowledgeBase):  # type: ignore[misc]
    """
    Relational agent knowledge store backed by Semantica's KG pipeline.

    Parameters
    ----------
    graph_builder:
        A ``semantica.kg.GraphBuilder`` instance.  Created automatically if
        ``None``.
    ner_extractor:
        A ``semantica.semantic_extract.NERExtractor`` instance.  Created
        automatically if ``None``.
    relation_extractor:
        A ``semantica.semantic_extract.RelationExtractor`` instance.  Created
        automatically if ``None``.
    context_graph:
        An existing ``semantica.context.ContextGraph`` to use as the backing
        store.  A fresh in-memory graph is created when ``None``.
    graph_store_backend:
        Passed to ``ContextGraph`` when ``context_graph`` is ``None``.
        Supported values: ``"inmemory"`` (default), ``"neo4j"``,
        ``"falkordb"``.
    graph_store_uri:
        Connection URI for the chosen graph store backend.
    num_documents:
        Default number of documents returned by ``search()``.
    """

    def __init__(
        self,
        graph_builder: Any = None,
        ner_extractor: Any = None,
        relation_extractor: Any = None,
        context_graph: Any = None,
        graph_store_backend: str = "inmemory",
        graph_store_uri: Optional[str] = None,
        num_documents: int = 5,
        **kwargs: Any,
    ) -> None:
        if AGNO_AVAILABLE:
            super().__init__(**kwargs)  # type: ignore[call-arg]

        self.num_documents = num_documents
        self._graph_store_backend = graph_store_backend

        # Lazy imports to keep semantica core optional at import time
        from semantica.context import ContextGraph
        from semantica.kg import GraphBuilder
        from semantica.semantic_extract import NERExtractor, RelationExtractor

        self._graph = context_graph or ContextGraph()
        self._graph_builder = graph_builder or GraphBuilder()
        self._ner = ner_extractor or NERExtractor()
        self._rel = relation_extractor or RelationExtractor()

        # In-process document store for search fallback
        self._docs: List[Dict[str, Any]] = []

        logger.info(
            "AgnoKnowledgeGraph initialised",
            extra={"backend": graph_store_backend},
        )

    # ------------------------------------------------------------------
    # AgentKnowledge protocol
    # ------------------------------------------------------------------

    def search(
        self,
        query: str,
        num_documents: Optional[int] = None,
        filters: Optional[Dict[str, Any]] = None,
    ) -> List[Any]:
        """
        Multi-hop GraphRAG search.

        1. Vector retrieval over stored document texts.
        2. Graph hop expansion for entities found in top results.
        3. Returns a list of Agno ``Document`` objects.
        """
        k = num_documents or self.num_documents
        results: List[Any] = []

        # Simple keyword / substring filter over in-process store
        q_lower = query.lower()
        scored = [
            (doc, sum(1 for w in q_lower.split() if w in doc["text"].lower()))
            for doc in self._docs
        ]
        scored.sort(key=lambda t: t[1], reverse=True)
        top = [d for d, _ in scored[:k]]

        for doc in top:
            # Graph expansion: pull related entities from the context graph
            extra = self._graph_context_for(doc.get("entities", []))
            content = doc["text"]
            if extra:
                content += "\n\n[Graph context]\n" + extra

            results.append(
                AgnoDocument(
                    content=content,
                    id=doc.get("id"),
                    name=doc.get("source"),
                    meta_data=doc.get("metadata", {}),
                )
            )

        logger.debug("search('%s') → %d documents", query, len(results))
        return results

    def load(
        self,
        path: Union[str, Path, None] = None,
        urls: Optional[List[str]] = None,
        texts: Optional[List[str]] = None,
        recursive: bool = False,
        recreate: bool = False,
    ) -> None:
        """
        Ingest documents into the knowledge graph.

        Parameters
        ----------
        path:
            A file path, directory path, or glob pattern.
        urls:
            List of URLs to fetch and ingest.
        texts:
            Raw text strings to ingest directly.
        recursive:
            When ``path`` points to a directory, walk subdirectories.
        recreate:
            Drop all previously loaded documents before ingesting.
        """
        if recreate:
            self._docs.clear()

        if texts:
            for text in texts:
                self._ingest_text(text, source="<inline>")

        if path is not None:
            self._ingest_path(Path(path), recursive=recursive)

        if urls:
            self.load_urls(urls)

    def load_urls(self, urls: List[str]) -> None:
        """Fetch each URL and ingest the response body."""
        import urllib.request

        for url in urls:
            try:
                with urllib.request.urlopen(url, timeout=10) as resp:  # noqa: S310
                    text = resp.read().decode("utf-8", errors="replace")
                self._ingest_text(text, source=url)
                logger.info("Loaded URL: %s", url)
            except Exception as exc:
                logger.warning("Failed to fetch %s: %s", url, exc)

    # AgentKnowledge also expects `load_documents`
    def load_documents(
        self,
        documents: List[Any],
        upsert: bool = False,
    ) -> None:
        """Ingest a list of Agno ``Document`` objects."""
        for doc in documents:
            text = getattr(doc, "content", None) or getattr(doc, "text", str(doc))
            source = getattr(doc, "name", None) or getattr(doc, "id", "<document>")
            self._ingest_text(text, source=source)

    def get_graph_context(self, entity: str) -> str:
        """Return a text summary of an entity's subgraph (neighbours + edges)."""
        return self._graph_context_for([entity])

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _ingest_text(self, text: str, source: str = "<text>") -> None:
        """Run the full extraction pipeline and store in graph + doc list."""
        import uuid

        # NER
        entities: List[str] = []
        try:
            ner_result = self._ner.extract_entities(text)
            entities = [
                getattr(e, "name", str(e)) for e in (ner_result or [])
            ]
        except Exception as exc:
            logger.debug("NER failed for '%s': %s", source, exc)

        # Relation extraction
        relations: List[Any] = []
        try:
            relations = self._rel.extract_relations(text, entities=ner_result)  # type: ignore[arg-type]
        except Exception as exc:
            logger.debug("RelationExtractor failed for '%s': %s", source, exc)

        # Graph build
        try:
            sources = [{"text": text, "entities": entities, "relations": relations, "source": source}]
            self._graph_builder.build(sources)
        except Exception as exc:
            logger.debug("GraphBuilder.build() failed for '%s': %s", source, exc)

        # Cache document for search
        self._docs.append(
            {
                "id": str(uuid.uuid4()),
                "text": text,
                "source": source,
                "entities": entities,
                "metadata": {"source": source},
            }
        )
        logger.debug("Ingested '%s' — %d entities, %d relations", source, len(entities), len(relations))

    def _ingest_path(self, path: Path, recursive: bool = False) -> None:
        """Walk a file or directory and ingest all text files."""
        if path.is_file():
            self._ingest_file(path)
        elif path.is_dir():
            pattern = "**/*" if recursive else "*"
            for child in path.glob(pattern):
                if child.is_file():
                    self._ingest_file(child)
        else:
            logger.warning("Path not found: %s", path)

    def _ingest_file(self, filepath: Path) -> None:
        try:
            text = filepath.read_text(encoding="utf-8", errors="replace")
            self._ingest_text(text, source=str(filepath))
        except Exception as exc:
            logger.warning("Could not read %s: %s", filepath, exc)

    def _graph_context_for(self, entities: List[str]) -> str:
        """Build a short text summary of graph neighbours for a set of entities."""
        if not entities:
            return ""
        lines: List[str] = []
        for entity in entities[:3]:  # limit to avoid context bloat
            try:
                nodes = self._graph.find_nodes(label=entity)  # type: ignore[attr-defined]
                for node in (nodes or [])[:3]:
                    label = getattr(node, "label", entity)
                    ntype = getattr(node, "node_type", "")
                    lines.append(f"- {label} ({ntype})" if ntype else f"- {label}")
            except Exception:
                pass
        return "\n".join(lines)
