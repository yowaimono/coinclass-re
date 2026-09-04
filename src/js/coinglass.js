#!/usr/bin/env node
/**
 * CoinGlass API 解密 — JavaScript 实现（零依赖）
 *
 * 与 scripts/verify_endpoint.py 对应的 Node 版。
 * 仅依赖 Node 18+ 内置能力：fetch / crypto / zlib，无需第三方包。
 *
 * 算法（详见 docs/intel/01-加密方案.md）：
 *   1. Key0 = base64(url_path)[:16]                       # v=1
 *   2. AES-128-ECB 解密响应头 user token → gzip → 真实 key
 *   3. AES-128-ECB 解密响应体 data(base64) → gzip → 明文 JSON
 *   密钥版本 v 支持 0/1/2 + 遗留 55/66/77 全量派生。
 *
 * 用法：
 *   const { fetchAndDecrypt } = require('./coinglass');
 *   const data = await fetchAndDecrypt('https://capi.coinglass.com/api/futures/home/statistics');
 */

'use strict';

const crypto = require('crypto');
const zlib = require('zlib');

// 遗留密钥常量（webpack module 12471）
const LEGACY_KEY_TABLE = {
  55: '170b070da9654622',
  66: 'd6537d845a964081',
  77: '863f08689c97435b',
};

// 浏览器态请求头模板
const BROWSER_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
  encryption: 'true',
  language: 'en',
  Origin: 'https://www.coinglass.com',
  Referer: 'https://www.coinglass.com',
  'Sec-Ch-Ua': '"Google Chrome";v="125", "Chromium";v="125"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
};

/**
 * 按响应头 v 值派生第一层密钥 Key0 = base64(常量)[:16]
 * @param {string|number} v
 * @param {{url?: string, cacheTs?: string, timeHeader?: string}} ctx
 * @returns {string} 16 字符 Key0
 */
function deriveKey0(v, { url = '', cacheTs = '', timeHeader = '' } = {}) {
  let constant;
  switch (String(v)) {
    case '0':
      if (!cacheTs) throw new Error('v=0 需要请求头 cache-ts-v2');
      constant = cacheTs;
      break;
    case '1':
      if (!url) throw new Error('v=1 需要完整请求 URL');
      constant = new URL(url).pathname;
      break;
    case '2':
      if (!timeHeader) throw new Error('v=2 需要响应头 time');
      constant = timeHeader;
      break;
    default: {
      constant = LEGACY_KEY_TABLE[String(v)];
      if (!constant) throw new Error(`未知 v=${v}；支持 0/1/2 + 遗留 55/66/77`);
    }
  }
  return Buffer.from(constant, 'utf8').toString('base64').slice(0, 16);
}

/** PKCS7 去填充（ECB 需手动 unpad） */
function unpad(buf) {
  const padLen = buf[buf.length - 1];
  if (!padLen || padLen > 16) throw new Error('无效的 PKCS7 填充');
  return buf.subarray(0, buf.length - padLen);
}

/**
 * AES-128-ECB 解密（Node 内置 crypto；ECB 无 IV，iv 传 null）
 * @param {Buffer} ciphertext
 * @param {Buffer} key 16 字节
 * @returns {Buffer}
 */
function aesEcbDecrypt(ciphertext, key) {
  if (key.length !== 16) throw new Error(`AES-128 密钥必须为 16 字节，实际 ${key.length}`);
  const decipher = crypto.createDecipheriv('aes-128-ecb', key, null);
  decipher.setAutoPadding(false);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * 双层 AES-128-ECB + gzip 解密，返回明文 JSON 对象
 * @param {string} body 原始响应体文本
 * @param {string} userTokenB64 响应头 user
 * @param {string|number} v 响应头 v
 * @param {{url?: string, cacheTs?: string, timeHeader?: string}} ctx
 */
function decryptResponse(body, userTokenB64, v, { url = '', cacheTs = '', timeHeader = '' } = {}) {
  const outer = JSON.parse(body);
  if (!outer.data) throw new Error('响应缺少 data 字段（可能不是加密端点）');

  const payload = Buffer.from(outer.data, 'base64');
  const token = Buffer.from(userTokenB64, 'base64');
  const key0 = Buffer.from(deriveKey0(v, { url, cacheTs, timeHeader }), 'utf8');

  // 第一层：解密 token → gunzip → 真实密钥（16 字符 hex）
  const step1 = unpad(aesEcbDecrypt(token, key0));
  const actualKey = zlib.gunzipSync(step1).toString('utf8');

  // 第二层：解密 data → gunzip → 明文 JSON
  const step2 = unpad(aesEcbDecrypt(payload, Buffer.from(actualKey, 'utf8')));
  const plain = zlib.gunzipSync(step2).toString('utf8');

  return JSON.parse(plain);
}

/**
 * 浏览器态请求 + 自动解密（加密端点）或直接返回明文 JSON
 * @param {string} url 完整 API URL
 * @param {object} [params] 查询参数
 * @param {number} [timeout=30000] 超时毫秒
 * @returns {Promise<object|Array>}
 */
async function fetchAndDecrypt(url, params = {}, timeout = 30000) {
  const cacheTs = String(Date.now());
  const qs = new URLSearchParams();
  for (const [k, val] of Object.entries(params)) qs.set(k, String(val));
  const fullUrl = `${url}${qs.toString() ? `?${qs.toString()}` : ''}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let resp;
  try {
    resp = await fetch(fullUrl, {
      headers: { ...BROWSER_HEADERS, 'cache-ts-v2': cacheTs },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);

  const text = await resp.text();
  const user = resp.headers.get('user');
  const v = resp.headers.get('v');
  console.log(`[i] HTTP ${resp.status} | v=${v} | user_header=${user ? 'yes' : 'no'}`);

  if (!user || !v) {
    console.log('[i] 明文端点（无加密头），直接返回 JSON');
    return JSON.parse(text);
  }

  return decryptResponse(text, user, v, {
    url: fullUrl,
    cacheTs,
    timeHeader: resp.headers.get('time') || '',
  });
}

module.exports = { deriveKey0, aesEcbDecrypt, decryptResponse, fetchAndDecrypt };
