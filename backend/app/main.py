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
        # Services will be initialized lazily on first use
        logger.info("API ready - ML models will load on first request")

    @application.on_event("shutdown")
    async def shutdown_event():
        logger.info(f"Shutting down {settings.APP_NAME}")

    return application


app = create_application()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
