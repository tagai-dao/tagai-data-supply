// 从 JSON Schema 生成 TS 类型（spec §2: JSON Schema 单一源）
const { compileFromFile } = require('json-schema-to-typescript');
const fs = require('fs');
const path = require('path');

const SCHEMA_DIR = path.join(__dirname, '..', 'schemas');
const OUT_DIR = path.join(__dirname, '..', 'src', 'generated');
fs.mkdirSync(OUT_DIR, { recursive: true });

const files = ['hello', 'auth_ack', 'register_request', 'task_assign', 'task_result'];

(async () => {
  for (const f of files) {
    const ts = await compileFromFile(path.join(SCHEMA_DIR, `${f}.schema.json`), {
      bannerComment: `/* eslint-disable */\n// AUTO-GENERATED from schemas/${f}.schema.json — do not edit`,
      style: { singleQuote: true },
    });
    fs.writeFileSync(path.join(OUT_DIR, `${f}.ts`), ts);
    console.log(`generated ${f}.ts`);
  }
})();
