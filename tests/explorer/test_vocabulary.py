"""
Tests for semantica/explorer/routes/vocabulary.py

Covers:
- GET /api/vocabulary/schemes
- GET /api/vocabulary/hierarchy
- POST /api/vocabulary/import
"""

import pytest
from unittest.mock import MagicMock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient

from semantica.explorer.routes.vocabulary import router
from semantica.explorer.dependencies import get_session


# ---------------------------------------------------------------------------
# App + dependency override setup
# ---------------------------------------------------------------------------

app = FastAPI()
app.include_router(router)

mock_session = MagicMock()

app.dependency_overrides[get_session] = lambda: mock_session

client = TestClient(app)


def setup_function():
    """Reset mock call history before each test to prevent state pollution."""
    mock_session.reset_mock()


# ---------------------------------------------------------------------------
# GET /api/vocabulary/schemes
# ---------------------------------------------------------------------------

def test_list_schemes_returns_correct_shape():
    """Maps skos:ConceptScheme nodes to VocabularyScheme schema."""
    mock_session.get_nodes.return_value = ([
        {
            "id": "http://example.org/Scheme1",
            "type": "skos:ConceptScheme",
            "properties": {
                "content": "My Test Scheme",
                "description": "A scheme for testing"
            }
        }
    ], 1)

    response = client.get("/api/vocabulary/schemes")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["uri"] == "http://example.org/Scheme1"
    assert data[0]["label"] == "My Test Scheme"
    assert data[0]["description"] == "A scheme for testing"


def test_list_schemes_empty_graph():
    """Returns empty list when no ConceptScheme nodes exist."""
    mock_session.get_nodes.return_value = ([], 0)

    response = client.get("/api/vocabulary/schemes")

    assert response.status_code == 200
    assert response.json() == []


def test_list_schemes_no_description():
    """Description field is optional — None when not present in properties."""
    mock_session.get_nodes.return_value = ([
        {"id": "http://example.org/S", "type": "skos:ConceptScheme",
         "properties": {"content": "Minimal"}}
    ], 1)

    response = client.get("/api/vocabulary/schemes")

    assert response.status_code == 200
    assert response.json()[0]["description"] is None


def test_list_schemes_metadata_envelope():
    """Label is read from 'metadata' envelope when 'properties' key absent."""
    mock_session.get_nodes.return_value = ([
        {"id": "http://example.org/S", "type": "skos:ConceptScheme",
         "metadata": {"content": "Via Metadata"}}
    ], 1)

    response = client.get("/api/vocabulary/schemes")

    assert response.status_code == 200
    assert response.json()[0]["label"] == "Via Metadata"


# ---------------------------------------------------------------------------
# GET /api/vocabulary/hierarchy
# ---------------------------------------------------------------------------

def test_hierarchy_parent_child_via_broader():
    """broader edge: child → parent. Returns single root with one child."""
    mock_session.get_nodes.return_value = ([
        {"id": "http://example.org/Parent", "type": "skos:Concept",
         "properties": {"content": "Parent Node"}},
        {"id": "http://example.org/Child", "type": "skos:Concept",
         "properties": {"content": "Child Node"}}
    ], 2)
    mock_session.get_edges.return_value = ([
        {"source": "http://example.org/Parent", "target": "http://example.org/Scheme1",
         "type": "skos:inScheme"},
        {"source": "http://example.org/Child", "target": "http://example.org/Scheme1",
         "type": "skos:inScheme"},
        {"source": "http://example.org/Child", "target": "http://example.org/Parent",
         "type": "skos:broader"},
    ], 3)

    response = client.get("/api/vocabulary/hierarchy?scheme=http://example.org/Scheme1")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    root = data[0]
    assert root["uri"] == "http://example.org/Parent"
    assert root["pref_label"] == "Parent Node"
    assert len(root["children"]) == 1
    child = root["children"][0]
    assert child["uri"] == "http://example.org/Child"
    assert child["pref_label"] == "Child Node"
    assert child["children"] is None


def test_hierarchy_parent_child_via_narrower():
    """narrower edge: parent → child. Same tree as broader, different edge direction."""
    mock_session.get_nodes.return_value = ([
        {"id": "http://example.org/P", "type": "skos:Concept",
         "properties": {"content": "P"}},
        {"id": "http://example.org/C", "type": "skos:Concept",
         "properties": {"content": "C"}}
    ], 2)
    mock_session.get_edges.return_value = ([
        {"source": "http://example.org/P", "target": "http://example.org/S",
         "type": "skos:inScheme"},
        {"source": "http://example.org/C", "target": "http://example.org/S",
         "type": "skos:inScheme"},
        # narrower: P → C means C is a child of P
        {"source": "http://example.org/P", "target": "http://example.org/C",
         "type": "skos:narrower"},
    ], 3)

    response = client.get("/api/vocabulary/hierarchy?scheme=http://example.org/S")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["uri"] == "http://example.org/P"
    assert len(data[0]["children"]) == 1
    assert data[0]["children"][0]["uri"] == "http://example.org/C"


def test_hierarchy_membership_via_top_concept_of():
    """topConceptOf edge includes node in scheme without inScheme edge."""
    mock_session.get_nodes.return_value = ([
        {"id": "http://example.org/Top", "type": "skos:Concept",
         "properties": {"content": "Top"}}
    ], 1)
    mock_session.get_edges.return_value = ([
        {"source": "http://example.org/Top", "target": "http://example.org/S",
         "type": "skos:topConceptOf"},
    ], 1)

    response = client.get("/api/vocabulary/hierarchy?scheme=http://example.org/S")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["uri"] == "http://example.org/Top"


def test_hierarchy_membership_via_has_top_concept():
    """hasTopConcept edge (scheme → concept) includes the target concept."""
    mock_session.get_nodes.return_value = ([
        {"id": "http://example.org/TC", "type": "skos:Concept",
         "properties": {"content": "TopConcept"}}
    ], 1)
    mock_session.get_edges.return_value = ([
        {"source": "http://example.org/S", "target": "http://example.org/TC",
         "type": "skos:hasTopConcept"},
    ], 1)

    response = client.get("/api/vocabulary/hierarchy?scheme=http://example.org/S")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["uri"] == "http://example.org/TC"


def test_hierarchy_empty_scheme():
    """No concepts in scheme returns empty list."""
    mock_session.get_nodes.return_value = ([], 0)
    mock_session.get_edges.return_value = ([], 0)

    response = client.get("/api/vocabulary/hierarchy?scheme=http://example.org/Empty")

    assert response.status_code == 200
    assert response.json() == []


def test_hierarchy_flat_scheme_all_roots():
    """All concepts without parent relationships are returned as roots."""
    mock_session.get_nodes.return_value = ([
        {"id": "http://example.org/A", "type": "skos:Concept",
         "properties": {"content": "A"}},
        {"id": "http://example.org/B", "type": "skos:Concept",
         "properties": {"content": "B"}},
    ], 2)
    mock_session.get_edges.return_value = ([
        {"source": "http://example.org/A", "target": "http://example.org/S",
         "type": "skos:inScheme"},
        {"source": "http://example.org/B", "target": "http://example.org/S",
         "type": "skos:inScheme"},
    ], 2)

    response = client.get("/api/vocabulary/hierarchy?scheme=http://example.org/S")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    uris = {n["uri"] for n in data}
    assert uris == {"http://example.org/A", "http://example.org/B"}


def test_hierarchy_missing_scheme_param():
    """scheme query param is required — returns 422 when omitted."""
    response = client.get("/api/vocabulary/hierarchy")
    assert response.status_code == 422


def test_hierarchy_cycle_does_not_hang():
    """Cyclic broader edges must not cause infinite recursion during serialization."""
    mock_session.get_nodes.return_value = ([
        {"id": "http://example.org/A", "type": "skos:Concept",
         "properties": {"content": "A"}},
        {"id": "http://example.org/B", "type": "skos:Concept",
         "properties": {"content": "B"}},
    ], 2)
    mock_session.get_edges.return_value = ([
        {"source": "http://example.org/A", "target": "http://example.org/S",
         "type": "skos:inScheme"},
        {"source": "http://example.org/B", "target": "http://example.org/S",
         "type": "skos:inScheme"},
        # Cycle: A broader B AND B broader A
        {"source": "http://example.org/A", "target": "http://example.org/B",
         "type": "skos:broader"},
        {"source": "http://example.org/B", "target": "http://example.org/A",
         "type": "skos:broader"},
    ], 4)

    response = client.get("/api/vocabulary/hierarchy?scheme=http://example.org/S")

    # Must return 200 without hanging or raising a RecursionError
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


# ---------------------------------------------------------------------------
# POST /api/vocabulary/import
# ---------------------------------------------------------------------------

MINIMAL_TTL = b"""
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix ex:   <http://example.org/> .
ex:S a skos:ConceptScheme ; skos:prefLabel "S" .
"""

MINIMAL_RDF_XML = b"""<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:skos="http://www.w3.org/2004/02/skos/core#"
         xmlns:ex="http://example.org/">
  <skos:ConceptScheme rdf:about="http://example.org/SX">
    <skos:prefLabel xml:lang="en">Scheme X</skos:prefLabel>
  </skos:ConceptScheme>
</rdf:RDF>
"""


def test_import_ttl_success():
    """Valid .ttl upload returns success and calls add_nodes/add_edges."""
    mock_session.add_nodes.return_value = 1
    mock_session.add_edges.return_value = 0

    response = client.post(
        "/api/vocabulary/import",
        files={"file": ("vocab.ttl", MINIMAL_TTL, "text/turtle")},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["filename"] == "vocab.ttl"
    assert data["nodes_added"] == 1
    assert data["edges_added"] == 0
    mock_session.add_nodes.assert_called_once()
    mock_session.add_edges.assert_called_once()


def test_import_rdf_xml_success():
    """.rdf extension triggers XML format path."""
    mock_session.add_nodes.return_value = 1
    mock_session.add_edges.return_value = 0

    response = client.post(
        "/api/vocabulary/import",
        files={"file": ("vocab.rdf", MINIMAL_RDF_XML, "application/rdf+xml")},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "success"


def test_import_invalid_file_returns_422():
    """Unparseable file content returns HTTP 422, not a silent 200 error dict."""
    response = client.post(
        "/api/vocabulary/import",
        files={"file": ("bad.ttl", b"this is not valid RDF!", "text/turtle")},
    )

    assert response.status_code == 422


def test_import_owl_extension_uses_xml_format():
    """.owl extension treated the same as .rdf — uses XML parser."""
    mock_session.add_nodes.return_value = 1
    mock_session.add_edges.return_value = 0

    response = client.post(
        "/api/vocabulary/import",
        files={"file": ("onto.owl", MINIMAL_RDF_XML, "application/rdf+xml")},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "success"
