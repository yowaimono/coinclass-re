#!/usr/bin/env node
/**
 * CoinGlass API 抓取 + 解密验证（Node 版 CLI）
 *
 * 用法：
 *   node scripts/verify_endpoint.js \
 *     --url https://capi.coinglass.com/api/futures/home/statistics
 *   node scripts/verify_endpoint.js \
 *     --url https://capi.coinglass.com/api/spot/rsi/list \
 *     --params '{"pageSize":5,"pageNum":1}'
 *
 * 依赖：Node 18+（内置 fetch / crypto / zlib），零第三方包
 */

'use strict';

const { fetchAndDecrypt } = require('../src/js/coinglass');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') args.url = argv[++i];
    else if (a === '--params') args.params = argv[++i];
  }
  return args;
}

async function main() {
  const { url, params } = parseArgs(process.argv.slice(2));
  if (!url) {
    console.error('用法: node scripts/verify_endpoint.js --url <API_URL> [--params \'{"pageSize":5}\']');
    process.exit(1);
  }

  let data;
  try {
    data = await fetchAndDecrypt(url, params ? JSON.parse(params) : {});
  } catch (err) {
    console.error(`[x] 失败: ${err.message}`);
    if (err.name === 'AbortError') console.error('    (请求超时)');
    process.exit(1);
  }

  const preview = JSON.stringify(data, null, 0).slice(0, 500);
  console.log(`[ok] 解密成功，数据预览（前 500 字符）：\n${preview}`);
}

main();
