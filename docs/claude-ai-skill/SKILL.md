---
name: "haftarah-sheet"
description: "Make the weekly haftarah study sheet for Central Reform Congregation (Torah from Scratch). Use when Daniel asks for the haftarah sheet, this week's haftarah, or a sheet for a named Shabbat or date."
---

# Haftarah study sheet

The sheet maker lives in the public GitHub repo **RavBogard/haftarah**: template, scripts, fonts, mural and runbook. The weekly records live in Google Drive, not in the repo.

1. Clone `https://github.com/RavBogard/haftarah` into the working directory. Reading needs no special access, and nothing in the weekly run pushes to GitHub.
2. Read `RUNBOOK.md` in the repo and follow it.
3. Keep every record in Drive: the PDF in the public `Haftarah` folder, and the week's `sheet.json`, `candidates.json` and a copy of the PDF in `Haftarah working/<slug>/`. The connector cannot carry a multi-MB PDF, so Daniel drops the PDFs in by hand.

Do not run `npm install`; the repo has no dependencies. If the cloud build fails, say so in one line and stop: from a cloud session Daniel's computer is reachable only through a Linux VM with no browser, so it cannot build there. Daniel can run it himself in Claude Code. The cloud session cannot push to GitHub; report template bugs to Daniel instead of fixing them in the cloud copy.

## Daniel's standing rules for this work

- Nothing prints unapproved, and Daniel approves by printing. Show translations and summaries in full in the conversation; he reviews the PDF and prints it once he likes it.
- Be brief. Ask only when blocked, with a short "Needs you:" list.
- Never invent a citation.
