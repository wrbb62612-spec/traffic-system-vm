from app.core.config import Settings
from app.services.predictor import DCRNNPredictor, Predictor, StubPredictor


def build_predictor(settings: Settings) -> Predictor:
    backend = settings.predictor_backend.strip().lower()
    if backend == "dcrnn":
        return DCRNNPredictor(
            infer_service_url=settings.infer_service_url,
            timeout=settings.infer_service_timeout,
        )
    return StubPredictor()
