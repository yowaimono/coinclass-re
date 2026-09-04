# ROADMAP · CoinGlass 逆向路线图

> 目标：复刻 capi.coinglass.com 的请求签名 / 加密通信，产出一套**不依赖浏览器**的 Python 数据通道，服务个人看盘站。

## Phase 0 · 情报侦察（进行中 ✅ 大部队完成）
- [x] 确认 API 域名 `capi.coinglass.com`、加解密形态（AES-128-ECB + gzip）
- [x] 找到社区逆向参考（coinglass-decrypt / spider-hub / open-coinglass）
- [x] 摸清 v=0/1/2 密钥轮换机制
- [ ] **实机验证**：跑通 3~5 个加密端点，确认真实性（当前时代可能已变化）

## Phase 1 · 核心复刻（自研实现，不直接搬运）
- [ ] 实现 `src/coinglass/client.py`：浏览器态请求封装（完整请求头 + cache-ts-v2）
- [ ] 实现 `src/coinglass/crypto.py`：v=0/1/2 全版本解密 + 遗留表
- [ ] 实现 `src/coinglass/endpoints.py`：端点注册表（URL / 参数 / 数据模型）
- [ ] 实现 `fetch_and_decrypt()` 高层接口 + 容错（限流 / 反爬 / 加密头缺失降级明文）
- [ ] 单元测试：已知样例向量回归

## Phase 2 · 端点摸底与数据字典
- [ ] 抓取 136+ 端点，产出 `docs/endpoints/catalog.md`（路径 / 参数 / 返回字段 / 是否加密）
- [ ] 标记衍生品核心端点（清算 / OI / 资金费率 / 多空比）为高优先级
- [ ] 字段词典：`docs/endpoints/fields.md`（字段名 / 类型 / 含义 / 单位）

## Phase 3 · 验证与风控应对
- [ ] 频率测试：间隔 / 并发 / 触发风控阈值摸底
- [ ] 反爬策略笔记：IP 封禁、429、验证码、UA 指纹等应对方案
- [ ] 稳定性：密钥轮换（v 值变化）时自动降级与告警

## Phase 4 · 接入 crypto-dashboard（独立模块）
- [ ] 以 submodule 或独立服务形式接入看盘站数据层
- [ ] 缓存策略（TTL / 快照落盘）避免高频请求
- [ ] 展示层：清算热力图、OI/资金费率仪表盘

## 合规红线（贯穿全程）
- 只做**个人研究 / 非商业**用途
- 控制请求频率，尊重 robots.txt 与 ToS
- 不抓隐私、不二次分发原始数据
- 数据版权归 CoinGlass，仅个人学习引用
