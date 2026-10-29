import * as fs from "fs/promises";
import * as path from "path";

const PROJECT_ROOT = process.cwd();
const MAX_FILE_SIZE = 50_000;
const MAX_SEARCH_RESULTS = 20;
const CONTEXT_LINES = 2;

function resolveSecurePath(targetPath: string): string | null {
  const abolutePath = path.resolve(PROJECT_ROOT, targetPath);
  const projectWithSep = PROJECT_ROOT + path.sep;

  if (!abolutePath.startsWith(projectWithSep) && abolutePath != PROJECT_ROOT) {
    return null;
  }

  return abolutePath;
}

async function collectFiles(
  dirPath: string,
  extension?: string,
): Promise<string[]> {
  const results: string[] = [];
  let entries;

  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    console.error(`Error al leer el directorio ${dirPath}:`, error);
    return results;
  }

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await collectFiles(fullPath, extension);
      results.push(...subFiles);
    } else if (entry.isFile()) {
      if (!extension || entry.name.endsWith(extension)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

async function executeListFiles(params: {
  path: string;
  extension?: string;
}): Promise<string> {
  const securePath = resolveSecurePath(params.path);
  if (!securePath) {
    return `El directorio ${params.path} no es seguro.`;
  }

  try {
    const stats = await fs.stat(securePath);
    if (!stats.isDirectory()) {
      return `El directorio ${params.path} no es un directorio.`;
    }

    const files = await collectFiles(securePath, params.extension);
    if (files.length === 0) {
      const filterFile = params.extension
        ? ` con extensión ${params.extension}`
        : "";
      return `No se encontraron archivos en ${params.path} ${filterFile}.`;
    }

    const relativePaths = files.map((file) =>
      path.relative(PROJECT_ROOT, file),
    );

    return relativePaths.join("\\n");
  } catch (error) {
    console.error(`Error al listar los archivos en ${securePath}:`, error);
    return `Error al listar los archivos en ${securePath}: ${error}`;
  }
}

async function executeReadFile(params: { file_path: string }): Promise<string> {
  const securePath = resolveSecurePath(params.file_path);
  if (!securePath) {
    return `El directorio ${params.file_path} no es seguro.`;
  }

  try {
    const stats = await fs.stat(securePath);
    if (stats.isDirectory()) {
      return `El archivo ${params.file_path} es un directorio.`;
    }

    if (stats.size > MAX_FILE_SIZE) {
      return `El archivo ${params.file_path} es demasiado grande.`;
    }

    const fileContent = await fs.readFile(securePath, "utf-8");

    if (fileContent.length > MAX_FILE_SIZE) {
      return fileContent.slice(0, MAX_FILE_SIZE) + "\\n\\n... (truncado)";
    }

    return fileContent;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return `El archivo ${params.file_path} no existe.`;
    }

    console.error(`Error al leer el archivo ${securePath}:`, error);
    return `Error al leer el archivo ${securePath}: ${error}`;
  }
}

async function executeSearchCode(params: { 
  pattern: string,
  path?: string,
  file_extension?: string,
}): Promise<string> {
  const searchPath = params.path ?? '.';
  const securePath = resolveSecurePath(searchPath);
  if (!securePath) {
    return `El directorio ${searchPath} no es seguro.`;
  }

  const files = await collectFiles(securePath, params.file_extension);
  const results: string[] = [];

  let totalMatches = 0;

  for (const file of files) {
    if(totalMatches >= MAX_SEARCH_RESULTS) {
      break;
    }

    let content;

    try {
      content = await fs.readFile(file, "utf-8");
    } catch (error) {
      console.error(`Error al leer el archivo ${file}:`, error);
      continue;
    }

    const lines = content.split('\n');
    const relativePath = path.relative(PROJECT_ROOT, file);

    for (let i = 0; i < lines.length; i++) {
      if(totalMatches >= MAX_SEARCH_RESULTS) {
        break;
      }

      const line = lines[i] ?? '';
      if(!line.includes(params.pattern)) {
        continue;
      }

      totalMatches++;

      const contextBlock: string[] = [];
      const startLine = Math.max(0, i - CONTEXT_LINES);
      const endLine = Math.min(lines.length - 1, i + CONTEXT_LINES);

      for (let j = startLine; j <= endLine; j++) {
        const contextLine = lines[j] ?? '';
        const lineNumber = j + 1;
        const prefix = j === i ? '>' : ' ';
        contextBlock.push(`${prefix}${relativePath}: ${lineNumber}: ${contextLine}`);
      }

      results.push(contextBlock.join('\n'));

    }
  }

  if(results.length === 0) {
    return `No se encontraron coincidencias para "${params.pattern}" en el directorio ${searchPath}.`;
  }

  const header = totalMatches >= MAX_SEARCH_RESULTS 
  ? `Se encontraron más de ${MAX_SEARCH_RESULTS} coincidencias.` 
  : `Se encontraron ${totalMatches} coincidencias.`;

  return header + results.join('\n\n');
}

export async function executeTool(name: string, params: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'list_files': {
      const p = params as { path: unknown, extension?: unknown };
      if (typeof p.path !== 'string') {
        return 'El parámetro "path" debe ser una cadena de texto.';
      }
      return executeListFiles({ path: p.path, extension: typeof p.extension === 'string' ? p.extension : undefined });
    }
    case 'read_file': {
      const p = params as { file_path?: unknown };
      if (p.file_path && typeof p.file_path !== 'string') {
        return 'El parámetro "file_path" debe ser una cadena de texto.';
      }
      return executeReadFile({ file_path: p.file_path ?? '' });
    }
    case 'search_code': {
      const p = params as { pattern: unknown, path?: unknown, file_extension?: unknown };
      if (typeof p.pattern !== 'string') {
        return 'El parámetro "pattern" debe ser una cadena de texto.';
      }
      return executeSearchCode({ 
        pattern: p.pattern, 
        path: typeof p.path === 'string' ? p.path : undefined, 
        file_extension: typeof p.file_extension === 'string' ? p.file_extension : undefined });
    }
      
    default:
      return `Herramienta desconocida: ${name}`;
  }
}