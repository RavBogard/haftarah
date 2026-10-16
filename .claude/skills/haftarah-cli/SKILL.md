---
name: haftarah-cli
description: Make the week's haftarah study sheet for Central Reform Congregation (Torah from Scratch) from a clone of this repository with the scripts, in Claude Code, when the haftarah connector is down or Daniel asks for the CLI path.
---

# Weekly haftarah sheet: the CLI path

The usual path is the connector: the haftarah plugin, whose `haftarah-sheet` skill runs the week with the server's tools and needs no clone. This skill is the clone-and-scripts path for Claude Code, for when the connector is down or Daniel asks for it.

Follow `RUNBOOK.md` at the root of this repository, step by step (0b, then 1 to 7). It covers the calendar, fetch, the map, digging in, the opening note, the build, and delivery to Drive. `README.md` documents every field of `sheet.json`.

Do not edit `template/` during a weekly run. A template change is a separate task, done on Daniel's machine: a cloud session cannot push to GitHub.

Daniel approves a sheet by printing it. One build makes the PDF he reviews and prints; there is no draft build.
