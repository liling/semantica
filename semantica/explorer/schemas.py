"""
Semantica Explorer : Pydantic Schemas

All request/response models for the Knowledge Explorer REST API.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, Field



class ErrorResponse(BaseModel):
    """Standard error envelope."""
    detail: str
    status_code: int = 500



class NodeResponse(BaseModel):
    """Single node representation."""
    id: str
    type: str
    content: str = ""
    properties: Dict[str, Any] = Field(default_factory=dict)
    valid_from: Optional[str] = None
    valid_until: Optional[str] = None


class EdgeResponse(BaseModel):
    """Single edge representation."""
    source: str
    target: str
    type: str
    weight: float = 1.0
    properties: Dict[str, Any] = Field(default_factory=dict)


class NodeListResponse(BaseModel):
    """Paginated node list."""
    nodes: List[NodeResponse]
    total: int
    skip: int = 0
    limit: int = 100


class EdgeListResponse(BaseModel):
    """Paginated edge list."""
    edges: List[EdgeResponse]
    total: int
    skip: int = 0
    limit: int = 100


class NeighborResponse(BaseModel):
    """Neighbor node with relationship info."""
    id: str
    type: str
    content: str = ""
    relationship: str = ""
    weight: float = 1.0
    hop: int = 1


class PathResponse(BaseModel):
    """Path between two nodes."""
    source: str
    target: str
    algorithm: str
    path: List[str]
    total_weight: float = 0.0


class GraphStatsResponse(BaseModel):
    """Graph-level statistics."""
    node_count: int
    edge_count: int
    node_types: Dict[str, int] = Field(default_factory=dict)
    edge_types: Dict[str, int] = Field(default_factory=dict)
    density: float = 0.0


class SearchRequest(BaseModel):
    """Search request body."""
    query: str
    filters: Optional[Dict[str, Any]] = None
    limit: int = 20


class SearchResultItem(BaseModel):
    """Single search result."""
    node: NodeResponse
    score: float = 0.0


class SearchResultResponse(BaseModel):
    """Search results."""
    results: List[SearchResultItem]
    total: int
    query: str




class AnalyticsResponse(BaseModel):
    """Analytics results."""
    centrality: Optional[Dict[str, Any]] = None
    community: Optional[Dict[str, Any]] = None
    connectivity: Optional[Dict[str, Any]] = None


class ValidationIssue(BaseModel):
    """Single validation error or warning."""
    severity: str  # "error" or "warning"
    message: str
    node_id: Optional[str] = None
    edge_source: Optional[str] = None
    edge_target: Optional[str] = None


class ValidationReportResponse(BaseModel):
    """Graph validation report."""
    valid: bool
    error_count: int = 0
    warning_count: int = 0
    issues: List[ValidationIssue] = Field(default_factory=list)



class DecisionResponse(BaseModel):
    """Single decision."""
    decision_id: str
    category: str = ""
    scenario: str = ""
    reasoning: str = ""
    outcome: str = ""
    confidence: float = 0.0
    timestamp: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class CausalChainResponse(BaseModel):
    """Causal chain for a decision."""
    decision_id: str
    chain: List[Dict[str, Any]] = Field(default_factory=list)


class ComplianceResponse(BaseModel):
    """Policy compliance check result."""
    decision_id: str
    compliant: bool = True
    violations: List[Dict[str, Any]] = Field(default_factory=list)



class TemporalSnapshotResponse(BaseModel):
    """Graph state at a point in time."""
    timestamp: str
    active_nodes: List[NodeResponse]
    active_node_count: int


class TemporalDiffResponse(BaseModel):
    """Diff between two temporal snapshots."""
    from_time: str
    to_time: str
    added_nodes: List[str] = Field(default_factory=list)
    removed_nodes: List[str] = Field(default_factory=list)


class TemporalPatternResponse(BaseModel):
    """Detected temporal patterns."""
    patterns: List[Dict[str, Any]] = Field(default_factory=list)


class EnrichExtractRequest(BaseModel):
    """Entity/relation extraction from text."""
    text: str


class EnrichExtractResponse(BaseModel):
    """Extraction results."""
    entities: List[Dict[str, Any]] = Field(default_factory=list)
    relations: List[Dict[str, Any]] = Field(default_factory=list)


class LinkPredictionRequest(BaseModel):
    """Link prediction request."""
    node_id: str
    top_n: int = 10


class LinkPredictionResponse(BaseModel):
    """Link prediction results."""
    node_id: str
    predictions: List[Dict[str, Any]] = Field(default_factory=list)


class DedupRequest(BaseModel):
    """Deduplication scan request."""
    threshold: float = 0.8


class DedupResponse(BaseModel):
    """Deduplication results."""
    duplicates: List[Dict[str, Any]] = Field(default_factory=list)
    total_flagged: int = 0


class ReasoningRequest(BaseModel):
    """Reasoning request."""
    facts: List[str]
    rules: List[str]
    mode: str = "forward"  # forward, backward, rete


class ReasoningResponse(BaseModel):
    """Reasoning results."""
    inferred_facts: List[str] = Field(default_factory=list)
    rules_fired: int = 0




class ExportRequest(BaseModel):
    """Export request."""
    format: str = "json" 
    node_ids: Optional[List[str]] = None


class ExportResponse(BaseModel):
    """Export result metadata."""
    format: str
    content_type: str
    filename: str
    size_bytes: int = 0


class ImportResponse(BaseModel):
    """Response after successful import."""
    nodes_imported: int
    edges_imported: int
    message: str = "Import successful"

class StandardMessageResponse(BaseModel):
    """Standard generic success/error response."""
    status: str
    message: str




class AnnotationCreate(BaseModel):
    """Create an annotation."""
    node_id: str
    content: str
    tags: List[str] = Field(default_factory=list)
    visibility: str = "public" 


class AnnotationResponse(BaseModel):
    """Single annotation."""
    annotation_id: str
    node_id: str
    content: str
    tags: List[str] = Field(default_factory=list)
    visibility: str = "public"
    created_at: str = ""

class VocabularyScheme(BaseModel):
    """ A SKOS Concept Scheme (Vocabulary / Ontology)."""
    
    uri: str
    label: str
    description: Optional[str] = None
    
class ConceptNode(BaseModel):
    """ A SKOS Concept, nested hierarchically."""
    
    uri: str
    pref_label: str
    alt_labels: List[str] = Field(default_factory=list)
    children: Optional[List['ConceptNode']] = None

class MergeRequest(BaseModel):
    """Merge duplicate entities request."""
    primary_id: str
    duplicate_ids: List[str]

class MergeResponse(BaseModel):
    """Merge duplicate entities response."""
    merged_into: str
    removed_ids: List[str]
    edges_updated: int
