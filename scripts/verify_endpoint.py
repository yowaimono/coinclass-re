#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CoinGlass API 验证脚本（自研复刻，基于 docs/intel/01-加密方案.md）

功能：
  1. 带浏览器态请求头访问加密端点
  2. 按响应头 v 值全版本派生 Key0，双层 AES-128-ECB + gzip 解密
  3. 明文端点自动降级

用法：
  python scripts/verify_endpoint.py \
    --url "https://capi.coinglass.com/api/futures/home/statistics"
  python scripts/verify_endpoint.py \
    --url "https://capi.coinglass.com/api/spot/rsi/list" --params '{"pageSize":5,"pageNum":1}'

依赖：pip install requests pycryptodome
"""

import argparse
import base64
import gzip
import json
import time
from urllib.parse import urlparse

import requests
from Crypto.Cipher import AES
from Crypto.Util.Padding import unpad

# 遗留密钥常量（webpack module 12471）
_LEGACY_KEY_TABLE = {
    "55": "170b070da9654622",
    "66": "d6537d845a964081",
    "77": "863f08689c97435b",
}


def derive_key0(v: str, url: str = "", cache_ts: str = "", time_header: str = "") -> str:
    """按 v 值派生第一层密钥 Key0 = base64(常量)[:16]"""
    if v == "0":
        if not cache_ts:
            raise ValueError("v=0 requires cache-ts-v2 request header")
        constant = cache_ts
    elif v == "1":
        constant = urlparse(url).path or url.split("?")[0]
    elif v == "2":
        if not time_header:
            raise ValueError("v=2 requires response header 'time'")
        constant = time_header
    elif v in _LEGACY_KEY_TABLE:
        constant = _LEGACY_KEY_TABLE[v]
    else:
        raise ValueError(f"Unknown v={v!r}; known: 0/1/2 + legacy 55/66/77")
    return base64.b64encode(constant.encode()).decode()[:16]


def aes_ecb_decrypt(ciphertext: bytes, key: bytes) -> bytes:
    return unpad(AES.new(key, AES.MODE_ECB).decrypt(ciphertext), 16)


def decrypt_response(body: str, user_token_b64: str, v: str,
                     url: str = "", cache_ts: str = "", time_header: str = "") -> dict:
    """双层 AES-128-ECB + gzip 解密，返回明文 JSON dict"""
    outer = json.loads(body)
    payload = base64.b64decode(outer["data"])
    token = base64.b64decode(user_token_b64)

    key0 = derive_key0(v, url, cache_ts=cache_ts, time_header=time_header).encode()
    actual_key = gzip.decompress(aes_ecb_decrypt(token, key0)).decode()
    plain = gzip.decompress(aes_ecb_decrypt(payload, actual_key.encode())).decode()
    return json.loads(plain)


def fetch_and_decrypt(url: str, params: dict | None = None, timeout: int = 30):
    """浏览器态请求 + 自动解密（加密端点）或直接返回明文"""
    cache_ts = str(int(time.time() * 1000))
    resp = requests.get(
        url,
        params=params or {},
        headers={
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
            "cache-ts-v2": cache_ts,
            "encryption": "true",
            "language": "en",
            "Origin": "https://www.coinglass.com",
            "Referer": "https://www.coinglass.com",
            "Sec-Ch-Ua": '"Google Chrome";v="125", "Chromium";v="125"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-site",
            "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                           "AppleWebKit/537.36 (KHTML, like Gecko) "
                           "Chrome/125.0.0.0 Safari/537.36"),
        },
        timeout=timeout,
    )
    resp.raise_for_status()

    user = resp.headers.get("user")
    v = resp.headers.get("v")
    print(f"[i] HTTP {resp.status_code} | v={v} | user_header={'yes' if user else 'no'}")

    if not user or not v:
        print("[i] 明文端点（无加密头），直接返回 JSON")
        return resp.json()

    return decrypt_response(
        resp.text, user, v, url,
        cache_ts=cache_ts,
        time_header=resp.headers.get("time", ""),
    )


def main():
    ap = argparse.ArgumentParser(description="CoinGlass API 抓取+解密验证")
    ap.add_argument("--url", required=True, help="完整 API URL，如 https://capi.coinglass.com/api/futures/home/statistics")
    ap.add_argument("--params", default="{}", help='JSON 查询参数，如 \'{"pageSize":5}\'')
    args = ap.parse_args()

    params = json.loads(args.params)
    data = fetch_and_decrypt(args.url, params)

    preview = json.dumps(data, ensure_ascii=False)[:500]
    print(f"[ok] 解密成功，数据预览（前 500 字符）：\n{preview}")


if __name__ == "__main__":
    main()
