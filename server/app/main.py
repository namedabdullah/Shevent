"""Shevent model server: the AI features behind one HTTP API (packages/core/api is its client).

    uvicorn app.main:app --app-dir server --port 8000      # from the repo root, with the ml/ environment

Endpoints follow packages/core/schemas. Handlers are plain functions, so FastAPI runs them in its thread pool: the
models are CPU-bound and would block the event loop. Every answer carries model_version.
"""

# shevent_ml first: it loads the right C++ runtime before pandas, pyarrow or LightGBM do (see its __init__).
import shevent_ml  # noqa: F401, I001

import logging
import os
import threading
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .assistant import LLMUnavailable
from .schemas import (
    AssistantChatRequest,
    AssistantChatResponse,
    EstimateRequest,
    EstimateResponse,
    FeedbackRequest,
    FeedbackResponse,
    Health,
    PackagesRequest,
    PackagesResponse,
    PortfolioCheckResponse,
    QuoteCheckRequest,
    QuoteCheckResponse,
    RecommendRequest,
    RecommendResponse,
    ReviewInsightsRequest,
    ReviewInsightsResponse,
)
from .services import Services, Unavailable, load_services

MAX_UPLOAD_BYTES = 10_000_000  # one portfolio photo

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger(__name__)


def plan_of(model):
    """A request's plan as the models take it: plain JSON values, unset optional fields left out."""
    return model.model_dump(mode="json", exclude_none=True)


def warm_up(llm):
    """Loads #8's model in the background at startup; the server answers everything else meanwhile."""
    try:
        llm.warm_up()
        log.info("Assistant model %s loaded", llm.version)
    except Exception as error:  # noqa: BLE001 - the assistant then answers 503 until Ollama is up
        log.warning("Couldn't load the assistant model %s: %s", llm.version, error)


def get_services(request: Request) -> Services:
    return request.app.state.services


ServicesDep = Annotated[Services, Depends(get_services)]


def create_app(services=None):
    @asynccontextmanager
    async def lifespan(app):
        app.state.services = services or load_services()
        if app.state.services.assistant is not None:
            threading.Thread(target=warm_up, args=(app.state.services.assistant.llm,), daemon=True).start()
        yield

    app = FastAPI(title="Shevent model server", version="1.0.0", lifespan=lifespan)
    # The web app calls the server from its own backend; browsers only need CORS for origins listed here.
    origins = [o for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o]
    if origins:
        app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["POST", "GET"], allow_headers=["*"])

    @app.exception_handler(Unavailable)
    @app.exception_handler(LLMUnavailable)
    def unavailable(request, error):
        return JSONResponse(status_code=503, content={"detail": str(error)})

    @app.get("/health", response_model=Health)
    def health(services: ServicesDep):
        versions = services.versions()
        try:
            vendors = len(services.catalog.vendors())
        except Exception:  # noqa: BLE001 - health reports the database being down instead of failing
            vendors = None
        ok = all(versions.values()) and vendors is not None
        assistant = services.assistant.version if services.assistant else None
        return {"status": "ok" if ok else "degraded", "models": versions, "vendors": vendors, "assistant": assistant}

    @app.post("/v1/estimate", response_model=EstimateResponse)
    def estimate(request: EstimateRequest, services: ServicesDep):
        """#1 budget split and #2 price ranges."""
        return services.estimate(plan_of(request))

    @app.post("/v1/recommend", response_model=RecommendResponse)
    def recommend(request: RecommendRequest, services: ServicesDep):
        """#3 ranked vendors for one category; sponsored ones in their own list."""
        return services.recommend(plan_of(request.plan), request.category, request.budget_pkr, request.limit)

    @app.post("/v1/packages", response_model=PackagesResponse)
    def packages(request: PackagesRequest, services: ServicesDep):
        """#4 cheapest / balanced / highest-quality bundles within the budget."""
        return services.packages(plan_of(request.plan), request.categories, request.unavailable_vendor_ids)

    @app.post("/v1/quote-check", response_model=QuoteCheckResponse)
    def quote_check(request: QuoteCheckRequest, services: ServicesDep):
        """#5 fairness level and inclusion checklist for a quote."""
        return services.quote_check(plan_of(request))

    @app.post("/v1/assistant/chat", response_model=AssistantChatResponse)
    def assistant_chat(request: AssistantChatRequest, services: ServicesDep):
        """#8 chat planner: extracts the plan, estimates with #1 and #2, and replies with their figures only."""
        return services.assistant_chat([m.model_dump() for m in request.messages])

    @app.post("/v1/reviews/insights", response_model=ReviewInsightsResponse)
    def review_insights(request: ReviewInsightsRequest, services: ServicesDep):
        """#6 praise and complaints per aspect in a vendor's reviews, with pros and cons."""
        return services.review_insights(request.vendor_id)

    @app.post("/v1/portfolio/check", response_model=PortfolioCheckResponse)
    def portfolio_check(
        services: ServicesDep,
        vendor_id: Annotated[str, Form(min_length=1, max_length=64)],
        image: Annotated[UploadFile, File()],
    ):
        """#7 style tags for an uploaded portfolio photo, and whether it copies another vendor's photo."""
        data = image.file.read(MAX_UPLOAD_BYTES + 1)
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, f"Photos up to {MAX_UPLOAD_BYTES // 1_000_000} MB")
        try:
            return services.portfolio_check(data, vendor_id)
        except ValueError as error:
            raise HTTPException(422, str(error)) from error

    @app.post("/v1/feedback", response_model=FeedbackResponse)
    def feedback(request: FeedbackRequest, services: ServicesDep):
        """Actual spend and rating after the event, kept for retraining."""
        return services.feedback(plan_of(request))

    return app


app = create_app()
