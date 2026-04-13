"""
RAG 知识库检索接口。

端点：
  POST /rag/search          — 关键词检索（BM25），返回最相关知识条目
  GET  /rag/items           — 列出所有知识条目（仅元数据）
  GET  /rag/items/{item_id} — 获取单个知识条目完整内容
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.config import Settings, get_settings
from app.services.rag_store import get_knowledge_item, list_knowledge, search_knowledge

router = APIRouter(prefix="/rag", tags=["rag"])


class RagSearchRequest(BaseModel):
    query: str = Field(description="检索关键词或自然语言问题")
    limit: int = Field(default=5, ge=1, le=10)


@router.post("/search")
async def rag_search(body: RagSearchRequest, settings: Settings = Depends(get_settings)):
    results = search_knowledge(settings, body.query, body.limit)
    return {"query": body.query, "results": results, "count": len(results)}


@router.get("/items")
async def rag_list(settings: Settings = Depends(get_settings)):
    items = list_knowledge(settings)
    return {"items": items, "count": len(items)}


@router.get("/items/{item_id}")
async def rag_get_item(item_id: str, settings: Settings = Depends(get_settings)):
    item = get_knowledge_item(settings, item_id)
    if not item:
        raise HTTPException(status_code=404, detail=f"知识条目 {item_id} 不存在")
    return item
