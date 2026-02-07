from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.core.logging import logger
from app.api import recommendations, admin

settings = get_settings()


def create_application() -> FastAPI:
    application = FastAPI(
        title=settings.APP_NAME, debug=settings.DEBUG, version="1.0.0"
    )

    # CORS
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Configure appropriately for production
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include routers
    application.include_router(
        recommendations.router,
        prefix=f"{settings.API_V1_STR}",
        tags=["recommendations"],
    )

    application.include_router(
        admin.router, prefix=f"{settings.API_V1_STR}/admin", tags=["admin"]
    )

    @application.on_event("startup")
    async def startup_event():
        logger.info(f"Starting up {settings.APP_NAME}")

        # Preload ML models during startup to avoid cold start on first request
        logger.info("Preloading ML models...")
        try:
            from app.services.minilm_ranker import get_minilm_ranker
            from app.services.two_tower import get_two_tower_model

            # Initialize MiniLM model (loads HuggingFace transformers)
            minilm = get_minilm_ranker()
            logger.info("MiniLM model loaded successfully")

            # Initialize Two-Tower model (initializes PyTorch towers)
            two_tower = get_two_tower_model()
            logger.info("Two-Tower model loaded successfully")

            logger.info("All ML models preloaded - API ready")
        except Exception as e:
            logger.error(f"Failed to preload models: {e}")
            raise

    @application.on_event("shutdown")
    async def shutdown_event():
        logger.info(f"Shutting down {settings.APP_NAME}")

    return application


app = create_application()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
