import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';

const sourceRoot = resolve('src');
const legacyRoot = resolve('src/legacy/v1');
const errors = [];

async function collectTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = join(directory, entry.name);
    if (absolutePath === legacyRoot) {
      continue;
    }
    if (entry.isDirectory()) {
      files.push(...await collectTypeScriptFiles(absolutePath));
    } else if (extname(entry.name) === '.ts') {
      files.push(absolutePath);
    }
  }

  return files;
}

const activeFiles = await collectTypeScriptFiles(sourceRoot);
const forbiddenImportPattern = /from\s+['"][^'"]*(?:legacy\/v1|\/game|\/town|\/tornado)['"]/i;
const explicitAnyPattern = /(?:\bas\s+any\b|:\s*any\b|<any>)/;

for (const filePath of activeFiles) {
  const source = await readFile(filePath, 'utf8');
  const displayPath = relative(resolve('.'), filePath);
  if (forbiddenImportPattern.test(source)) {
    errors.push(`${displayPath}: imports the v1 runtime`);
  }
  if (explicitAnyPattern.test(source)) {
    errors.push(`${displayPath}: contains an explicit any escape hatch`);
  }
}

const mainSource = await readFile(resolve('src/main.ts'), 'utf8');
if (!mainSource.includes("from './app/GameApp'")) {
  errors.push('src/main.ts: does not boot through GameApp');
}

const tsconfig = JSON.parse(await readFile(resolve('tsconfig.json'), 'utf8'));
if (tsconfig.compilerOptions?.strict !== true) {
  errors.push('tsconfig.json: strict TypeScript is not enabled');
}
if (!tsconfig.exclude?.includes('src/legacy/v1')) {
  errors.push('tsconfig.json: frozen v1 source is not explicitly excluded');
}

const contracts = await readFile(resolve('src/core/types.ts'), 'utf8');
for (const contractName of [
  'StormProfile',
  'WorldSeed',
  'DistrictDescriptor',
  'TerrainSample',
  'WorldItemRecord',
  'BuildingDefinition',
  'StructuralState',
  'DestructionEvent',
  'RenderQualityProfile',
  'RuntimeDiagnostics',
]) {
  if (!contracts.includes(`interface ${contractName}`)) {
    errors.push(`src/core/types.ts: missing ${contractName}`);
  }
}

if (errors.length > 0) {
  throw new Error(`Foundation architecture verification failed:\n${errors.join('\n')}`);
}

console.log(
  `foundation architecture ok: ${activeFiles.length} strict active TypeScript files, `
  + 'v1 isolated, core contracts present',
);
