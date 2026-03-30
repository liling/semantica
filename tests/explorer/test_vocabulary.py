"""
Tests for semantica/explorer/routes/vocabulary.py

Covers:
- GET /api/vocabulary/schemes
- GET /api/vocabulary/hierarchy
- POST /api/vocabulary/import
"""

import sys
from unittest.mock import MagicMock

sys.modules['spacy'] = MagicMock()

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from semantica.explorer.routes.vocabulary import router
from semantica.explorer.dependencies import get_session


app = FastAPI()
app.include_router(router)

mock_session = MagicMock()

def override_get_session():
    return mock_session

app.dependency_overrides[get_session] = override_get_session

client = TestClient(app)

# Test cases

def test_list_schemes():
    """Test that /schemes correctly maps graph nodes to the Pydantic schema."""
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


def test_get_hierarchy():
    """Test the O(V+E) in-memory tree building algorithm."""

    mock_session.get_nodes.return_value = ([
        {"id": "http://example.org/Parent", "type": "skos:Concept", "properties": {"content": "Parent Node"}},
        {"id": "http://example.org/Child", "type": "skos:Concept", "properties": {"content": "Child Node"}}
    ], 2)


    mock_session.get_edges.return_value = ([
        {"source": "http://example.org/Parent", "target": "http://example.org/Scheme1", "type": "skos:inScheme"},
        
        {"source": "http://example.org/Child", "target": "http://example.org/Scheme1", "type": "skos:inScheme"},
        
        {"source": "http://example.org/Child", "target": "http://example.org/Parent", "type": "skos:broader"}
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


def test_import_vocabulary():
    """Test the file upload endpoint safely parses and calls add_nodes/add_edges."""

    minimal_ttl = b"""
    @prefix skos: <http://www.w3.org/2004/02/skos/core#> .
    @prefix ex:   <http://example.org/> .
    ex:S a skos:ConceptScheme ; skos:prefLabel "S" .
    """
    
    mock_session.add_nodes.return_value = 1
    mock_session.add_edges.return_value = 0

    response = client.post(
        "/api/vocabulary/import",
        files={"file": ("test.ttl", minimal_ttl, "text/turtle")}
    )
    
    assert response.status_code == 200
    data = response.json()
    
    assert data["status"] == "success"
    assert data["nodes_added"] == 1
    assert data["edges_added"] == 0
    
    mock_session.add_nodes.assert_called_once()
    mock_session.add_edges.assert_called_once()