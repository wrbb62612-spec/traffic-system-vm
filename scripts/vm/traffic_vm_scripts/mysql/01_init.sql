CREATE DATABASE IF NOT EXISTS traffic_db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE traffic_db;

CREATE TABLE IF NOT EXISTS llm_generated_reports (
  report_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  trigger_node_id VARCHAR(64) NOT NULL,
  markdown_content LONGTEXT NOT NULL,
  is_approved TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_configs (
  config_key VARCHAR(128) PRIMARY KEY,
  config_value TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO system_configs (config_key, config_value)
VALUES
  ('predictor_backend', 'dcrnn'),
  ('infer_service_url', 'http://localhost:5001')
ON DUPLICATE KEY UPDATE config_value = VALUES(config_value);
