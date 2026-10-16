// tests/plugin.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_ORIGIN, MCP_PATH } from "../api/_lib/env.mjs";
import { INSTRUCTIONS } from "../api/_lib/instructions.mjs";
import { TOOLS } from "../api/_lib/tools.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = p => readFileSync(join(ROOT, p), "utf8");

test("the plugin manifest, the marketplace and the connector agree: one plugin named haftarah, one http server at the canonical MCP URL, one skill", () => {
  const plugin = JSON.parse(read("plugin/.claude-plugin/plugin.json"));
  assert.equal(plugin.name, "haftarah"); assert.match(plugin.version, /^\d+\.\d+\.\d+$/); assert.ok(plugin.description.length > 20);
  assert.equal(plugin.mcpServers, "./.mcp.json"); assert.equal(plugin.skills, "./skills/");
  const mcp = JSON.parse(read("plugin/.mcp.json"));
  assert.deepEqual(Object.keys(mcp.mcpServers), ["haftarah"]);
  assert.deepEqual(mcp.mcpServers.haftarah, { type: "http", url: `${DEFAULT_ORIGIN}${MCP_PATH}` });
  const market = JSON.parse(read(".claude-plugin/marketplace.json"));
  assert.equal(market.name, "haftarah"); assert.equal(market.owner.name, "RavBogard");
  assert.deepEqual(market.plugins.map(p => [p.name, p.source]), [["haftarah", "./plugin"]]);
});

test("the skill is one page with the standing rules and the run in tool order, and never carries a credential or a clone step", () => {
  const skill = read("plugin/skills/haftarah-sheet/SKILL.md");
  assert.match(skill, /^---\nname: haftarah-sheet\ndescription: .+\n---\n/);
  assert.ok(skill.length < 9000, `one page: ${skill.length} characters`);
  for (const must of ["approves by printing", "Never invent a citation", "ship it", "deliver_week", "get_calendar", "start_week", "fetch_texts", "get_texts", "save_entries", "build_sheet", "Needs you", "God-language", "set_status", "Sefaria connector", "Before you hand him the draft links", "expectedVersion", "version_conflict", "this skill's `draft-entries.md`"]) assert.ok(skill.includes(must), must);
  for (const never of ["git clone", "token", "~/.haftarah", "npm install", "HAFTARAH_DROPBOX"]) assert.ok(!skill.includes(never), `the skill never says ${never}`);
  const tools = new Set(TOOLS.map(t => t.name));
  for (const m of skill.matchAll(/`([a-z_]+)`/g)) if (/_/.test(m[1]) && /^(get|find|start|fetch|save|update|set|build|deliver|add)_/.test(m[1])) assert.ok(tools.has(m[1]), `${m[1]} is a tool`);
});

test("the server's instructions carry the rules that must hold without the skill, briefly", () => {
  assert.ok(INSTRUCTIONS.length > 300 && INSTRUCTIONS.length < 1800, `${INSTRUCTIONS.length} characters`);
  for (const must of ["deliver_week", "explicit", "Never invent a citation", "approves by printing", "Sefaria", "rejected", "before you hand him the draft links", "expectedVersion", "version_conflict"]) assert.ok(INSTRUCTIONS.includes(must), must);
});

// The connector edition of the drafting prompt: every rule line of the repo's prompt (below its ---) that names no
// path, no script, no clone and no -- flag is in the plugin's copy word for word, so the rules cannot drift; the
// lines about the clone's files are the tools' instead.
const mentionsClone = line => /`[^`]*\/[^`]*`|\b[\w-]+\.(md|json|mjs)\b|node scripts\/|\bclone\b|(^|\s|`)--[a-z]/i.test(line);
test("the skill's drafting brief keeps every rule line of the repo prompt verbatim and swaps the clone's files for the connector's tools", () => {
  const lf = s => s.replace(/\r\n/g, "\n");   // a Windows checkout may carry CRLF
  const repo = lf(read("docs/prompts/draft-entries.md")), plugin = lf(read("plugin/skills/haftarah-sheet/draft-entries.md"));
  assert.ok(repo.includes("\n---\n"));
  const body = repo.slice(repo.indexOf("\n---\n") + 5).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const rules = body.filter(l => !mentionsClone(l));
  assert.ok(rules.length >= 18, `${rules.length} rule lines`);
  const lines = new Set(plugin.split(/\r?\n/).map(l => l.trim()));
  for (const l of rules) assert.ok(lines.has(l), `the plugin copy keeps: ${l}`);
  assert.ok(body.filter(mentionsClone).length >= 5, "the clone lines are found, so the filter is not vacuous");
  for (const never of ["clone]", "node scripts/", "--fix", "weeks/", "RUNBOOK.md", "README.md", "bibliography/", "draft_entries.json"]) assert.ok(!plugin.includes(never), `the plugin copy never says ${never}`);
  for (const must of ["get_sheet", "get_texts", "save_entries", "`bibliography`", "`entrySchema`"]) assert.ok(plugin.includes(must), must);
  assert.ok(!read("plugin/skills/haftarah-sheet/SKILL.md").includes("docs/prompts/draft-entries.md"));
});
