/**
 * 从运行中的 App Server 重新生成 web 端使用的 OpenAPI fixture。
 *
 * 用法：
 *   pnpm --filter @cinereel/ui regen:openapi-fixture
 *   OPENAPI_URL=http://127.0.0.1:5099 pnpm --filter @cinereel/ui regen:openapi-fixture
 *
 * 默认读取 http://localhost:5237/openapi/v1.json（即 `pnpm dev:service` 的地址）。
 * 生成结果会把 `servers` 归一化为 `http://localhost/`，与 fixture 的历史约定保持一致。
 */
import { writeFile } from "node:fs/promises";
import { EOL } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const baseUrl = (process.env.OPENAPI_URL ?? "http://localhost:5237").replace(/\/$/, "");
const documentUrl = `${baseUrl}/openapi/v1.json`;
const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/api/__fixtures__/openapi.json",
);

let document;
try {
  const response = await fetch(documentUrl);
  if (!response.ok) {
    throw new Error(`${documentUrl} 返回 ${response.status}`);
  }
  document = await response.json();
} catch (error) {
  console.error(`无法读取 ${documentUrl}：${error.message}`);
  console.error("请先启动 App Server，例如 `pnpm dev:service`，再重新执行本脚本。");
  process.exit(1);
}

document.servers = [{ url: "http://localhost/" }];

// 仓库启用了 core.autocrlf，工作区文件应为 CRLF；用平台换行符避免每次生成都被 git 改写。
const json = `${JSON.stringify(document, null, 2)}${EOL}`.replace(/\r?\n/g, EOL);

await writeFile(fixturePath, json, "utf8");

const paths = Object.keys(document.paths ?? {});
console.log(`已写入 ${fixturePath}`);
console.log(`共 ${paths.length} 个路径：`);
for (const path of paths) {
  console.log(`  ${path}`);
}
