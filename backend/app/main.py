import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.agents import router as agents_router
from app.api.routes.chat import router as chat_router
from app.api.routes.datastore import router as datastore_router
from app.api.routes.external import router as external_router
from app.api.routes.health import router as health_router
from app.api.routes.predict import router as predict_router
from app.api.routes.rag import router as rag_router
from app.api.routes.streaming import router as streaming_router
from app.core.config import get_settings
from app.services.external_scheduler import external_collection_loop
from app.services.external_store import init_external_db
from app.services.mission_store import init_mission_db
from app.services.rag_store import init_rag_db

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_external_db(settings)
    init_mission_db(settings)
    init_rag_db(settings)
    stop_event = asyncio.Event()
    task = None
    if settings.external_collection_enabled:
        task = asyncio.create_task(external_collection_loop(settings, stop_event))
    try:
        yield
    finally:
        stop_event.set()
        if task:
            await task


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(predict_router)
app.include_router(datastore_router)
app.include_router(streaming_router)
app.include_router(agents_router)
app.include_router(chat_router)
app.include_router(external_router)
app.include_router(rag_router)