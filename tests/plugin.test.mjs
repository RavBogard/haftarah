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

test("the skill carries its own drafting brief, equal to the repo file", () => {
  assert.equal(read("plugin/skills/haftarah-sheet/draft-entries.md"), read("docs/prompts/draft-entries.md"));
  assert.ok(!read("plugin/skills/haftarah-sheet/SKILL.md").includes("docs/prompts/draft-entries.md"));
});
