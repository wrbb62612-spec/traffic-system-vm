from pyspark.sql import SparkSession
from pyspark.sql.functions import col, countDistinct

spark = (
    SparkSession.builder
    .appName("traffic-feature-summary-local")
    .getOrCreate()
)

df = spark.read.json("/opt/traffic-dw/data/feature_export/**/*.jsonl")

df.printSchema()

summary = df.select(
    countDistinct(col("node_id")).alias("node_count")
)

summary.show(truncate=False)
print("record_count =", df.count())

spark.stop()