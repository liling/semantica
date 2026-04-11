"""
Semantica Explorer FastAPI application factory.
"""

import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .. import __version__
from .session import GraphSession
from .ws import ConnectionManager


def _install_mutation_bridge(app: FastAPI, session: GraphSession) -> None:
    def on_mutation(event_type: str, entity_id: str, payload: dict) -> None:
        loop = getattr(app.state, "event_loop", None)
        manager = getattr(app.state, "ws_manager", None)
        if loop is None or manager is None or loop.is_closed():
            return
        message = {
            "event_type": event_type,
            "entity_id": entity_id,
            "payload": payload,
        }
        asyncio.run_coroutine_threadsafe(
            manager.broadcast("graph_mutation", message),
            loop,
        )

    session.graph.mutation_callback = on_mutation


def create_app(session: Optional[GraphSession] = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.event_loop = asyncio.get_running_loop()
        app.state.ws_manager = ConnectionManager()
        if session is not None:
            app.state.session = session
            _install_mutation_bridge(app, session)
        yield

    app = FastAPI(
        title="Semantica Knowledge Explorer",
        description="Interactive dashboard API for exploring Semantica knowledge graphs.",
        version=__version__,
        lifespan=lifespan,
    )

    cors_origins = os.environ.get("EXPLORER_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins.split(","),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(KeyError)
    async def key_error_handler(_request: Request, exc: KeyError):
        return JSONResponse(status_code=404, content={"detail": f"Not found: {exc}"})

    @app.exception_handler(ValueError)
    async def value_error_handler(_request: Request, exc: ValueError):
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @app.exception_handler(Exception)
    async def generic_error_handler(_request: Request, exc: Exception):
        if isinstance(exc, HTTPException):
            raise exc
        return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})

    from .routes.analytics import router as analytics_router
    from .routes.annotations import router as annotations_router
    from .routes.decisions import router as decisions_router
    from .routes.enrich import router as enrich_router
    from .routes.export_import import router as export_import_router
    from .routes.graph import router as graph_router
    from .routes.provenance import router as provenance_router
    from .routes.sparql import router as sparql_router
    from .routes.temporal import router as temporal_router
    from .routes.vocabulary import router as vocabulary_router

    app.include_router(graph_router)
    app.include_router(analytics_router)
    app.include_router(decisions_router)
    app.include_router(temporal_router)
    app.include_router(enrich_router)
    app.include_router(export_import_router)
    app.include_router(annotations_router)
    app.include_router(sparql_router)
    app.include_router(provenance_router)
    app.include_router(vocabulary_router)

    @app.websocket("/ws/graph-updates")
    async def websocket_endpoint(websocket: WebSocket):
        manager: ConnectionManager = app.state.ws_manager
        await manager.connect(websocket)
        await manager.send_personal(websocket, "connection_ack", {"connected": True})
        try:
            while True:
                message = await websocket.receive_text()
                if message.strip().lower() == "ping":
                    await manager.send_personal(websocket, "pong", {"ok": True})
        except WebSocketDisconnect:
            manager.disconnect(websocket)

    @app.get("/api/health")
    async def health():
        return {"status": "healthy"}

    @app.get("/api/info")
    async def info():
        return {
            "name": "Semantica Knowledge Explorer",
            "version": __version__,
            "status": "active",
        }

    static_dir = Path(__file__).resolve().parent.parent / "static"
    if static_dir.is_dir():
        assets_dir = static_dir / "assets"
        if assets_dir.is_dir():
            app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

        @app.get("/{full_path:path}", include_in_schema=False)
        async def serve_spa(full_path: str):
            if full_path.startswith("api/"):
                raise HTTPException(status_code=404, detail="API route not found")
            index_path = static_dir / "index.html"
            if index_path.is_file():
                return FileResponse(index_path)
            raise HTTPException(status_code=404, detail="Frontend build missing")

    return app


# Module-level app instance used by uvicorn and Docker CMD.
app = create_app()
