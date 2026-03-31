"""
Semantica Server Entry Point

This module provides the REST API server for the Semantica framework
using FastAPI and uvicorn.
"""

import logging
import uvicorn
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from . import __version__
from .core.orchestrator import Semantica
from .utils.logging import setup_logging

try:
    from .context.context_graph import ContextGraph
    from .explorer.session import GraphSession
    from .explorer.ws import ConnectionManager
    EXPLORER_AVAILABLE = True
except ImportError:
    EXPLORER_AVAILABLE = False

# Initialize logging
setup_logging()

STATIC_DIR = Path(__file__).parent / "static"

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager for startup and shutdown events."""
    logging.info("Starting up Semantica API...")
    
    if EXPLORER_AVAILABLE:
        try:
            logging.info("Initializing Graph engine and Database connection...")
            graph = ContextGraph()
            app.state.session = GraphSession(graph)
            app.state.ws_manager = ConnectionManager()
            logging.info("Database Session and WebSockets attached to app state.")
        except Exception as e:
            logging.error(f"Failed to initialize GraphSession: {e}")
            app.state.session = None
            app.state.ws_manager = None
    else:
        app.state.session = None
        app.state.ws_manager = None

    yield  

    logging.info("Shutting down Semantica API...")
    if getattr(app.state, "session", None) and hasattr(app.state.session.graph, "close"):
        app.state.session.graph.close()


app = FastAPI(
    title="Semantica API",
    description="REST API for the Semantica Framework",
    version=__version__,
    lifespan=lifespan 
)

# Global framework instance
framework = Semantica()

class BuildRequest(BaseModel):
    sources: List[str]
    config: Optional[Dict[str, Any]] = None


@app.get("/api/info")
async def root():
    """Root endpoint returning framework info."""
    return {
        "name": "Semantica API",
        "version": __version__,
        "status": "active"
    }

@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}

@app.post("/build")
async def build_kb(request: BuildRequest):
    """Initiate knowledge base construction."""
    try:
        # result = framework.build_knowledge_base(sources=request.sources, config=request.config)
        return {"status": "accepted", "message": "Knowledge base construction initiated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# -Mount explorer routes
if EXPLORER_AVAILABLE:
    try:
        from .explorer.routes import (
            analytics,
            annotations,
            decisions,
            enrich,
            export_import,
            graph,
            temporal,
            vocabulary
        )

        app.include_router(analytics.router)
        app.include_router(annotations.router)
        app.include_router(decisions.router)
        app.include_router(enrich.router)
        app.include_router(export_import.router)
        app.include_router(graph.router)
        app.include_router(temporal.router)
        app.include_router(vocabulary.router)

        logging.info("Explorer and Vocabulary API routes successfully mounted.")
    except Exception as exc:
        logging.error(f"Failed to mount explorer routes: {exc}")
else:
    logging.warning(
        "Explorer API routes not mounted. To enable the Knowledge Explorer, "
        "install the required dependencies: pip install 'semantica[explorer]'."
    )

# SPA catch all 

@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    """
    Catch-all route that serves React assets and index.html for React Router.
    """
    requested_file = STATIC_DIR / full_path
    

    if requested_file.is_file():
        return FileResponse(requested_file)
    

    index_file = STATIC_DIR / "index.html"
    if index_file.is_file():
        return FileResponse(index_file)
        
    raise HTTPException(
        status_code=404, 
        detail="Frontend not built. Run `npm run build` in semantica-explorer/ first."
    )

def main():
    """Server entry point."""
    uvicorn.run(app, host="0.0.0.0", port=8000)

if __name__ == "__main__":
    main()