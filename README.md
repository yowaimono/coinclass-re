# coinclass-re · CoinGlass 逆向研究

对 [coinglass.com](https://www.coinglass.com) 内部 API 的**协议逆向 + 签名算法复刻**项目。目标是搞清楚网页版数据接口的加解密与风控机制，产出一套不依赖浏览器、可编程调用的数据通道，为个人看盘站（crypto-dashboard）补齐**衍生品独有指标**（爆仓 / OI / 资金费率 / 多空比等公开行情 API 拿不到的数据）。

> ⚠️ **用途边界**：本项目仅供**技术学习 / 个人研究 / 个人非商业工具**使用。
> 数据版权归 CoinGlass 所有；请遵守其 ToS，控制请求频率，勿用于商业转售或恶意抓取。

## 逆向对象速览（截至 2026-09）

| 项 | 结论 |
|---|---|
| API 域名 | `capi.coinglass.com`（同站点 `www.coinglass.com`） |
| 请求头 | `encryption: true` + `cache-ts-v2: <ms>` + 浏览器伪装头 |
| 响应头 | `v`（密钥版本）、`user`（base64 token）、`ev` |
| 加密 | **双层 AES-128-ECB + gzip**，Key0 由 URL path 派生 |
| 鉴权 | 无需 key / cookie / session（响应自带解密要素） |
| 端点规模 | 136+ 加密端点可用、16 明文端点、约 81 已下线 |

## 目录结构

```
coinclass-re/
├── README.md            # 本文件
├── ROADMAP.md           # 阶段化路线图
├── docs/
│   ├── intel/           # 情报笔记（协议、算法、参考项目）
│   └── endpoints/       # 端点清单 / 字段字典
├── capture/             # 抓包原始产物（不入库）
├── notes/               # 分析过程笔记
├── scripts/             # 工具脚本（验证 / 抓取 / 解密）
└── src/                 # 复刻实现（Python 包）
```

## 快速开始（复刻核心）

```bash
# 依赖：Python 3.10+，requests + pycryptodome
pip install requests pycryptodome

# 端到端验证：抓取并解密一个加密端点
python scripts/verify_endpoint.py \
  --url "https://capi.coinglass.com/api/futures/home/statistics"
```

详细协议说明见 [`docs/intel/01-加密方案.md`](docs/intel/01-加密方案.md)。
