package com.traffic;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.flink.api.common.eventtime.SerializableTimestampAssigner;
import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.api.common.functions.AggregateFunction;
import org.apache.flink.api.common.serialization.SimpleStringSchema;
import org.apache.flink.api.java.functions.KeySelector;
import org.apache.flink.connector.kafka.sink.KafkaSink;
import org.apache.flink.connector.kafka.sink.KafkaRecordSerializationSchema;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.functions.windowing.ProcessWindowFunction;
import org.apache.flink.streaming.api.windowing.assigners.TumblingEventTimeWindows;
import org.apache.flink.streaming.api.windowing.windows.TimeWindow;
import org.apache.flink.util.Collector;

import java.time.Duration;
import java.time.Instant;
import java.util.Objects;

public class App {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public static void main(String[] args) throws Exception {
        String bootstrapServers = env("KAFKA_BOOTSTRAP_SERVERS", "traffic-kafka:29092");
        String sourceTopic = env("KAFKA_SOURCE_TOPIC", "traffic.sensor.raw");
        String sinkTopic = env("KAFKA_SINK_TOPIC", "traffic.feature.windowed");
        String groupId = env("KAFKA_GROUP_ID", "traffic-flink-job");
        int windowSeconds = Integer.parseInt(env("WINDOW_SECONDS", "10"));
        int parallelism = Integer.parseInt(env("FLINK_PARALLELISM", "1"));

        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        env.setParallelism(parallelism);

        KafkaSource<String> source = KafkaSource.<String>builder()
                .setBootstrapServers(bootstrapServers)
                .setTopics(sourceTopic)
                .setGroupId(groupId)
                .setStartingOffsets(OffsetsInitializer.latest())
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .build();

        DataStream<SensorEvent> events = env
                .fromSource(source, WatermarkStrategy.noWatermarks(), "Kafka Source")
                .map(App::parseSensorEvent)
                .filter(Objects::nonNull)
                .assignTimestampsAndWatermarks(
                        WatermarkStrategy.<SensorEvent>forBoundedOutOfOrderness(Duration.ofSeconds(5))
                                .withTimestampAssigner(new SerializableTimestampAssigner<SensorEvent>() {
                                    @Override
                                    public long extractTimestamp(SensorEvent element, long recordTimestamp) {
                                        return element.eventTime;
                                    }
                                })
                );

        DataStream<String> aggregated = events
                .keyBy((KeySelector<SensorEvent, String>) value -> value.nodeId)
                .window(TumblingEventTimeWindows.of(Duration.ofSeconds(windowSeconds)))
                .aggregate(new WindowAggregate(), new WindowProcess(windowSeconds));

        KafkaSink<String> sink = KafkaSink.<String>builder()
                .setBootstrapServers(bootstrapServers)
                .setRecordSerializer(
                        KafkaRecordSerializationSchema.builder()
                                .setTopic(sinkTopic)
                                .setValueSerializationSchema(new SimpleStringSchema())
                                .build()
                )
                .build();

        aggregated.sinkTo(sink);
        env.execute("Traffic Flink Job");
    }

    private static String env(String key, String defaultValue) {
        String value = System.getenv(key);
        return value == null || value.isBlank() ? defaultValue : value;
    }

    private static SensorEvent parseSensorEvent(String raw) {
        try {
            JsonNode node = MAPPER.readTree(raw);
            String nodeId = node.path("node_id").asText();
            if (nodeId == null || nodeId.isBlank()) {
                return null;
            }

            double speed = node.path("speed").asDouble(0.0);
            double flow = node.hasNonNull("flow") ? node.path("flow").asDouble(0.0) : 0.0;
            double occupancy = node.hasNonNull("occupancy") ? node.path("occupancy").asDouble(0.0) : 0.0;
            long eventTime = parseEventTime(node);

            return new SensorEvent(nodeId, speed, flow, occupancy, eventTime);
        } catch (Exception e) {
            System.err.println("[flink] parse error: " + e.getMessage() + " raw=" + raw);
            return null;
        }
    }

    private static long parseEventTime(JsonNode node) {
        String[] candidates = new String[]{"event_time", "timestamp", "ts"};
        for (String field : candidates) {
            JsonNode value = node.get(field);
            if (value == null || value.isNull()) {
                continue;
            }
            if (value.isNumber()) {
                long ts = value.asLong();
                return ts < 100000000000L ? ts * 1000L : ts;
            }
            if (value.isTextual()) {
                String text = value.asText();
                try {
                    return Instant.parse(text).toEpochMilli();
                } catch (Exception ignored) {
                }
                try {
                    long ts = Long.parseLong(text);
                    return ts < 100000000000L ? ts * 1000L : ts;
                } catch (Exception ignored) {
                }
            }
        }
        return System.currentTimeMillis();
    }

    private static String iso(long millis) {
        return Instant.ofEpochMilli(millis).toString();
    }

    public static class SensorEvent {
        public String nodeId;
        public double speed;
        public double flow;
        public double occupancy;
        public long eventTime;

        public SensorEvent() {}

        public SensorEvent(String nodeId, double speed, double flow, double occupancy, long eventTime) {
            this.nodeId = nodeId;
            this.speed = speed;
            this.flow = flow;
            this.occupancy = occupancy;
            this.eventTime = eventTime;
        }
    }

    public static class Accumulator {
        public String nodeId;
        public double speedSum;
        public double flowSum;
        public double occupancySum;
        public long count;
    }

    public static class WindowAggregate implements AggregateFunction<SensorEvent, Accumulator, Accumulator> {
        @Override
        public Accumulator createAccumulator() {
            return new Accumulator();
        }

        @Override
        public Accumulator add(SensorEvent value, Accumulator acc) {
            acc.nodeId = value.nodeId;
            acc.speedSum += value.speed;
            acc.flowSum += value.flow;
            acc.occupancySum += value.occupancy;
            acc.count += 1L;
            return acc;
        }

        @Override
        public Accumulator getResult(Accumulator acc) {
            return acc;
        }

        @Override
        public Accumulator merge(Accumulator a, Accumulator b) {
            Accumulator merged = new Accumulator();
            merged.nodeId = a.nodeId != null ? a.nodeId : b.nodeId;
            merged.speedSum = a.speedSum + b.speedSum;
            merged.flowSum = a.flowSum + b.flowSum;
            merged.occupancySum = a.occupancySum + b.occupancySum;
            merged.count = a.count + b.count;
            return merged;
        }
    }

    public static class WindowProcess extends ProcessWindowFunction<Accumulator, String, String, TimeWindow> {
        private final int windowSeconds;

        public WindowProcess(int windowSeconds) {
            this.windowSeconds = windowSeconds;
        }

        @Override
        public void process(String key, Context context, Iterable<Accumulator> elements, Collector<String> out) throws Exception {
            Accumulator acc = elements.iterator().next();
            if (acc.count <= 0) {
                return;
            }

            double avgSpeed = acc.speedSum / acc.count;
            double avgFlow = acc.flowSum / acc.count;
            double avgOccupancy = acc.occupancySum / acc.count;
            long windowEnd = context.window().getEnd();
            double timeOfDay = ((windowEnd / 1000L) % 86400L) / 86400.0;

            ObjectNode result = MAPPER.createObjectNode();
            result.put("node_id", key);
            result.put("window_start", iso(context.window().getStart()));
            result.put("window_end", iso(windowEnd));
            result.put("sample_count", acc.count);

            result.put("speed", avgSpeed);
            result.put("avg_speed", avgSpeed);

            result.put("flow", avgFlow);
            result.put("avg_flow", avgFlow);

            result.put("occupancy", avgOccupancy);
            result.put("avg_occupancy", avgOccupancy);

            result.put("time_of_day", Math.round(timeOfDay * 10000.0) / 10000.0);
            result.put("feature_type", "windowed");
            result.put("window_size_sec", windowSeconds);
            result.put("updated_at", iso(windowEnd));

            out.collect(MAPPER.writeValueAsString(result));
        }
    }
}