推理服务模式说明

当前模式划分

当前系统将推理服务划分为两种模式：

1. replay 模式

- 当前已实现
- 使用 dcrnn_predictions.npz
- 适合演示、答辩、离线样本回放
- 当前默认运行模式

2. live 模式

- 当前预留
- 目标是未来接入真实在线前向推理
- 当前仓库尚未提供稳定可运行实现

当前启动方式

    cd /opt/traffic-system/backend
    source venv/bin/activate
    export INFER_SERVICE_MODE=replay
    /opt/traffic-system/scripts/model/start_infer_service_mode.sh

当前健康检查

    /opt/traffic-system/scripts/model/check_infer_service.sh
    

当前结论

当前系统已经完成：

- replay 模式推理链路
- Redis Feature Store 驱动预测
- MinIO 离线归档
- 本地离线批处理统计

下一阶段再继续补 live 模式。
