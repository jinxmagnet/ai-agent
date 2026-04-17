import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

export const OUTPUT_DIR = join(process.cwd(), 'output');

export function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function writeArticleFile(filePath, content) {
  writeFileSync(filePath, content, 'utf-8');
}

export function writeAssetFile(filePath, data) {
  writeFileSync(filePath, data);
}
