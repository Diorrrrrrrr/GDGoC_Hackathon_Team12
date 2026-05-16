from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import lifespan
from app.routers import analyze, auth, events, me, pair, pairings

app = FastAPI(title="GDGoC Team12 Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(me.router)
app.include_router(pair.router)
app.include_router(pairings.router)
app.include_router(analyze.router)
app.include_router(events.router)


@app.get("/healthz")
async def healthz() -> dict[str, bool]:
    return {"ok": True}
