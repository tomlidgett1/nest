import http from "node:http";
import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..", "..");
const publicDir = path.join(__dirname, "public");

const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".py", ".swift"]);
const IGNORE_DIRS = new Set([".git", ".cursor", "node_modules", "Pods", "build", "DerivedData"]);
const V2_AGENT_FILES = new Set([
  "supabase/functions/_shared/orchestrator.ts",
  "supabase/functions/_shared/personality-agent.ts",
]);

function json(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendFile(res, filePath, contentType) {
  fs.readFile(filePath)
    .then((buffer) => {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(buffer);
    })
    .catch(() => {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
    });
}

function pathToPosix(p) {
  return p.split(path.sep).join("/");
}

function extractTemplateLiteral(source, equalsIndex) {
  const startTick = source.indexOf("`", equalsIndex);
  if (startTick === -1) return null;

  let i = startTick + 1;
  let escaped = false;
  while (i < source.length) {
    const ch = source[i];
    if (escaped) {
      escaped = false;
      i += 1;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      i += 1;
      continue;
    }
    if (ch === "`") {
      return {
        bodyStart: startTick + 1,
        bodyEnd: i,
      };
    }
    i += 1;
  }

  return null;
}

function classifyVariant(name, body) {
  const haystack = `${name}\n${body}`.toLowerCase();
  return haystack.includes("testing") ? "testing" : "normal";
}

function normalisePromptName(name) {
  return name
    .replace(/^TESTING_/i, "")
    .replace(/_TESTING$/i, "")
    .replace(/_V\d+$/i, "")
    .toUpperCase();
}

function extractPromptsFromFile(relativePath, content) {
  const prompts = [];
  const re = /\b(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=\s*/g;
  let match;

  while ((match = re.exec(content)) !== null) {
    const name = match[1];
    const lowerName = name.toLowerCase();
    const looksPrompty =
      lowerName.includes("prompt") ||
      lowerName.includes("rules") ||
      lowerName.includes("prefix");
    if (!looksPrompty) continue;

    const tpl = extractTemplateLiteral(content, re.lastIndex - 1);
    if (!tpl) continue;

    const body = content.slice(tpl.bodyStart, tpl.bodyEnd);
    if (body.trim().length < 40) continue;

    const variant = classifyVariant(name, body);
    prompts.push({
      id: `${relativePath}::${name}::${tpl.bodyStart}`,
      file: relativePath,
      name,
      variant,
      group: normalisePromptName(name),
      body,
      bodyStart: tpl.bodyStart,
      bodyEnd: tpl.bodyEnd,
      preview: body.trim().split("\n").slice(0, 2).join(" ").slice(0, 180),
    });
  }

  return prompts;
}

async function walkAndExtract(dirPath, relativeBase = "") {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const out = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (IGNORE_DIRS.has(entry.name)) continue;

    const abs = path.join(dirPath, entry.name);
    const rel = pathToPosix(path.join(relativeBase, entry.name));

    if (entry.isDirectory()) {
      const nested = await walkAndExtract(abs, rel);
      out.push(...nested);
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!SCAN_EXTENSIONS.has(ext)) continue;

    let content;
    try {
      content = await fs.readFile(abs, "utf8");
    } catch {
      continue;
    }

    if (!V2_AGENT_FILES.has(rel)) continue;

    const prompts = extractPromptsFromFile(rel, content);
    out.push(...prompts);
  }

  return out;
}

async function listPrompts() {
  const scanRoot = path.join(workspaceRoot, "supabase", "functions");
  const prompts = await walkAndExtract(scanRoot, "supabase/functions");
  prompts.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
  return prompts;
}

async function savePromptEdit(payload) {
  const { file, name, bodyStart, bodyEnd, newBody } = payload ?? {};
  if (!file || !name || typeof bodyStart !== "number" || typeof bodyEnd !== "number" || typeof newBody !== "string") {
    throw new Error("Invalid payload");
  }

  const absPath = path.resolve(workspaceRoot, file);
  if (!absPath.startsWith(path.join(workspaceRoot, "supabase", "functions"))) {
    throw new Error("Can only edit supabase/functions files");
  }

  const source = await fs.readFile(absPath, "utf8");
  if (bodyStart < 0 || bodyEnd < bodyStart || bodyEnd > source.length) {
    throw new Error("Prompt range is stale. Refresh and try again.");
  }

  const updated = source.slice(0, bodyStart) + newBody + source.slice(bodyEnd);
  await fs.writeFile(absPath, updated, "utf8");
  return { ok: true };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "GET" && url.pathname === "/api/prompts") {
    try {
      const prompts = await listPrompts();
      return json(res, 200, { prompts, count: prompts.length, root: "supabase/functions" });
    } catch (error) {
      return json(res, 500, { error: String(error) });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/prompts/save") {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk.toString("utf8");
      if (raw.length > 8_000_000) req.destroy();
    });
    req.on("end", async () => {
      try {
        const payload = JSON.parse(raw || "{}");
        await savePromptEdit(payload);
        json(res, 200, { ok: true });
      } catch (error) {
        json(res, 400, { error: String(error) });
      }
    });
    return;
  }

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    return sendFile(res, path.join(publicDir, "index.html"), "text/html; charset=utf-8");
  }
  if (req.method === "GET" && url.pathname === "/app.js") {
    return sendFile(res, path.join(publicDir, "app.js"), "text/javascript; charset=utf-8");
  }
  if (req.method === "GET" && url.pathname === "/styles.css") {
    return sendFile(res, path.join(publicDir, "styles.css"), "text/css; charset=utf-8");
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

const port = 4179;
server.listen(port, () => {
  console.log(`Prompt Studio running at http://localhost:${port}`);
});
