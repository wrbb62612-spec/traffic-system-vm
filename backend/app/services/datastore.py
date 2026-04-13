import pymysql
from fastapi import APIRouter, Depends
from pymongo import MongoClient

from app.core.config import Settings, get_settings
from app.services.feature_store import FeatureStoreService

router = APIRouter(prefix="/datastore", tags=["datastore"])


@router.get("/health")
def datastore_health(settings: Settings = Depends(get_settings)):
    result = {
        "redis": "down",
        "mysql": "down",
        "mongo": "down",
    }

    # Redis
    try:
        feature_store = FeatureStoreService(settings)
        result["redis"] = "up" if feature_store.ping() else "down"
        result["redis_keys"] = feature_store.client.keys("feature:*")
    except Exception as e:
        result["redis_error"] = str(e)

    # MySQL
    try:
        conn = pymysql.connect(
            host=settings.mysql_host,
            port=settings.mysql_port,
            user=settings.mysql_user,
            password=settings.mysql_password,
            database=settings.mysql_database,
            autocommit=True,
        )
        with conn.cursor() as cursor:
            cursor.execute("SELECT 1;")
            cursor.fetchone()
            cursor.execute("SHOW TABLES;")
            tables = [row[0] for row in cursor.fetchall()]
        conn.close()
        result["mysql"] = "up"
        result["mysql_tables"] = tables
    except Exception as e:
        result["mysql_error"] = str(e)

    # MongoDB
    try:
        client = MongoClient(settings.mongo_uri)
        client.admin.command("ping")
        db = client["traffic_events"]
        result["mongo"] = "up"
        result["mongo_collections"] = db.list_collection_names()
    except Exception as e:
        result["mongo_error"] = str(e)

    return result


@router.get("/feature/current/{node_id}")
def feature_current(node_id: str, settings: Settings = Depends(get_settings)):
    feature_store = FeatureStoreService(settings)
    return feature_store.get_current_feature(node_id=node_id)


@router.get("/feature/history/{node_id}")
def feature_history(
    node_id: str,
    steps: int = 12,
    settings: Settings = Depends(get_settings),
):
    feature_store = FeatureStoreService(settings)
    return feature_store.get_history_feature(node_id=node_id, steps=steps)


@router.get("/feature/dcrnn-input")
def dcrnn_input_preview(
    node_ids: str,
    steps: int = 12,
    settings: Settings = Depends(get_settings),
):
    """
    node_ids 传逗号分隔字符串，例如:
    /datastore/feature/dcrnn-input?node_ids=1001,1002,1003&steps=12
    """
    parsed_node_ids = [x.strip() for x in node_ids.split(",") if x.strip()]
    feature_store = FeatureStoreService(settings)
    return feature_store.assemble_dcrnn_input(node_ids=parsed_node_ids, steps=steps)