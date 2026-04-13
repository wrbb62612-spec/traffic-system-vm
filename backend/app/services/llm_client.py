from openai import OpenAI

from app.core.config import Settings


def build_qwen_client(settings: Settings) -> OpenAI:
    if not settings.qwen_api_key:
        raise ValueError("环境变量 QWEN_API_KEY 未配置。")
    return OpenAI(
        api_key=settings.qwen_api_key,
        base_url=settings.qwen_base_url,
    )
