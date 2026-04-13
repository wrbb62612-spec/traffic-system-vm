# traffic_vm_scripts

这组脚本用于在 Ubuntu VM 上启动当前 traffic-system 项目，并搭建最小大数据底座。

## 文件说明
- start_frontend.sh: 启动 Vite 前端
- start_backend.sh: 启动 FastAPI 后端
- start_infer_service.sh: 启动 DCRNN 回放推理服务
- install_docker_ubuntu.sh: 安装 Docker + Compose
- docker-compose.base.yml: 最小大数据底座（Redis + MySQL + MongoDB）
- start_bigdata_base.sh: 将 compose 和初始化文件复制到 /opt/traffic-dw 并启动
- init_redis_feature_store.sh: 写入 Redis 示例特征数据

## 推荐放置位置
把整个目录上传到 VM，例如：/opt/traffic-system/scripts/vm
