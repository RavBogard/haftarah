# Chant audio and a "trope trainer" for haftarah.centralreform.org (2.0 research)

Researched 2026-10-15. Read-only scouting; nothing in the repo was changed.
Bottom line: **record the cantor first and ship recorded, verse-synced audio plus trope-family drills in 2.0. Train an AI model of his voice later (2.x), from those same recordings, and only for verses he hasn't recorded, labeled as synthetic.** Nobody today can turn trope marks straight into a convincing chanted Hebrew verse without a human or a custom model in the loop.

---

## 1. TropeTrainer: what it was, why it died, what replaced it

**What it was.** Desktop software (Windows/Mac, later iOS) from Kinnor Software, written by Thomas Buchler. It covered Torah, haftarah, megillot and High Holy Day readings, with Hebrew, English and transliteration views, color-coded trope, printing, practice exercises and a calendar. It grew from 7 to **29 nusachot**, and the voice's timbre and speed ("from unbearably slow to comfortably fast") could be adjusted.
**The voice was synthesized, not recorded.** Buchler used the DECtalk speech engine, built Hebrew phonemes out of English and German sounds, and programmed pitch, duration and pauses for each trope. The point matters here: the product people still mourn used a robotic computed voice. Users valued **correct melody on any verse, in any tradition, at any speed** more than how natural the voice sounded.
- https://www.inverse.com/input/features/tropetrainer-thomas-buchler-torah-software (S.I. Rosenbaum, Input, 2022)
- https://news.ycombinator.com/item?id=35401895

**Why it died.** Buchler died in 2019, and the source code was probably lost with his computer. Kinnor said the program couldn't be updated. Windows 7 end-of-life and macOS Catalina (2020) broke it, and some copies froze at launch while looking for a license server that no longer existed. A former Kinnor consultant called the Mac audio "unfixable" (https://groups.google.com/g/leining/c/xjW1BebOB28).

**What replaced it.**

| Product | Model | Audio | Notes |
|---|---|---|---|
| TropeTrainer by HazzanSolutions (Daniel Friedman; endorsed by the Cantors Assembly) https://www.tropetrainer.com/ , https://www.cantors.org/tropetrainer/ | Web subscription, $13/mo or $130/yr | "6 voice styles"; source not stated. In 2022 it had no voice at all, and the plan was to add cantors' MP3s | Claims 78 voicing systems (25 for haftarah), 0.25x–2x speed, word highlighting, record-yourself, PDF printing. This is the paid incumbent. |
| PocketTorah (Not-a-Box Media Lab, 2012) https://apps.apple.com/us/app/pockettorah/id515833985 | Free, open source | **Human recordings, CC BY-SA 3.0**, 31.7 hours | Funded by the Jewish New Media Innovation Fund (Jim Joseph, Righteous Persons, Schusterman). Code is GPL3. https://ejewishphilanthropy.com/torah-on-the-go/ , https://archive.org/details/PockettorahAudioFiles |
| TorahTrope.com https://torahtrope.com/ | Free, no account | Reuses PocketTorah audio | Color-coded phrase groups, tap a word, downloadable clips, printable handouts, transliteration. Shows that a static site built on CC audio is feasible. |
| Trope Tutor (ivritsuite) https://ivritsuite.com/trope_tutor.html | Free | Recorded examples | Symbol and melody flashcards, quizzes. |
| Synagogue pages (e.g. Beth El South Hills, https://www.bethelcong.org/learn/readhaftarah) | Free | The congregation's own cantor | The most common real-world pattern: a cantor's MP3s posted per portion. |
| Sefaria | Free | **No chant audio** | Text and trope marks only. |
| YouTube cantors, Chabad, TorahReadings.com | Free | Recorded | No sync and no drills. |

**What users still say is missing** (from Inverse, the leining list and the feature gaps above):
- Any verse on demand, not only the weekly portion.
- Several nusachot side by side.
- One tool that combines a correct melody, slow-down, looping and printing.
- Longevity: tools die with their maker.
- Nothing free combines **synced highlighting, trope-family drills and adult study content** in one place. That combination is CRC's niche.

**Nusach note.** Haftarah trope (the prophetic melody) is distinct from Torah trope. It has its own final cadence (the "haftarah sof pasuk" before the blessings). The families are Eastern Ashkenazi (Lithuanian/Polish; the US default, taught from A.W. Binder's *Biblical Chant* and Joshua Jacobson's *Chanting the Hebrew Bible*), Western/German Ashkenazi, Sephardi/Moroccan/Syrian, Yemenite, and Italian. US Reform overwhelmingly uses Eastern Ashkenazi. **v1 should ship exactly one nusach, the cantor's.** Multiple nusachot are low value for this audience.

---

## 2. State of the art: producing a cantor's voice chanting arbitrary verses

### (a) Singing voice conversion (SVC): a human chants, the timbre becomes the cantor's
- **RVC v2 / Applio** (MIT license). The mature hobbyist standard. Training wants 10–30 minutes of clean, dry, single-voice audio; 40+ minutes is better. It needs an NVIDIA GPU with 6–8 GB or more, and a free or cheap Colab/RunPod T4 works. Training takes about 1–3 hours of GPU time. Output quality on sustained sung vowels is good, and singers widely use it for demos. **It does not create melody.** It needs a source performance with the right pitch and words. Applio is now in maintenance mode.
  https://github.com/IAHispano/Applio , https://voicechanger.live/hub/how-to-train-rvc-model
- **Seed-VC** (GPL-3.0). Zero-shot conversion from a 1–30 second reference, with an optional fine-tune (about 100 steps, roughly 2 minutes on a T4). It has a 44.1 kHz singing model (about 200M params, BigVGAN vocoder). Its own evaluation shows better speaker similarity than RVC v2. **The repo was archived (read-only) on 2025-11-21.** https://github.com/Plachtaa/seed-vc
- **Research successors** (R2-SVC, YingMusic-SVC, 2025–26) use Seed-VC as their baseline. These are papers, not products. https://arxiv.org/html/2512.04793v1
- **Hosted services** (kits.ai, Voice.ai). Upload vocals to train a custom model, then convert. Kits listed $9.99/mo for 2 model slots in 2024 (https://www.kits.ai/blog/kits-ai-subscription). Output rights for custom models are unclear, and you'd be paying a subscription for what a one-time self-hosted run already does.
- **Verdict:** this is production-ready today, **but it only re-voices a human performance.** It helps when the cantor's time is the bottleneck and someone else (Daniel, a student, a soloist) can chant accurately. It doesn't produce arbitrary verses on its own.

### (b) Singing voice synthesis from a score (no human performance)
- **DiffSinger / OpenUtau** (open source). Supports custom phoneme dictionaries, but **I found no Hebrew voicebank or phoneme set.** Training one needs about 1–3+ hours of the singer, labeled to the phoneme. That means aligning Hebrew phonemes, which is research-hobbyist work and probably weeks of effort.
  https://github.com/openutau/OpenUtau/wiki/Singer-Settings-and-Requirements
- **Synthesizer V** (English, Japanese, Chinese, Cantonese, Spanish, plus cross-lingual) and **ACE Studio** (8 languages; "Custom Singer" training). **Neither supports Hebrew.** Faking Hebrew through Spanish or Italian phonemes covers most vowels and consonants but not ח, ע or the Hebrew ר well. It might pass as a "guide vocal" to feed into (a).
- **NNSVS:** older, research-grade, no Hebrew.
- **Verdict:** no off-the-shelf Hebrew chanter exists. A custom DiffSinger model trained on the cantor's own haftarah recordings is possible later, and the recordings from stage 1 would be its training data.

### (c) Speech TTS voice cloning (ElevenLabs, Cartesia, Fish Audio, OpenAI, Google)
- ElevenLabs states it plainly: "Professional Voice Clones do not currently support singing. Audio recordings must consist of spoken voice only." https://elevenlabs.io/docs/eleven-creative/voices/voice-cloning/professional-voice-cloning
- Eleven Music v2 (May 2026) generates songs from prompts, but you can't give it a melody or a cloned voice, and it can't follow trope. https://techcrunch.com/2026/05/27/elevenlabss-new-music-generation-model-can-switch-genres-mid-track/
- The others are speech engines. Their Hebrew speech is decent now, but none take a pitch contour.
- **Verdict:** they can't chant. They're useful only for a *spoken* reading voice (for example, an English translation read aloud), which wasn't asked for.

### (d) Hybrid: compute the melody from the te'amim, then voice it
- **Feasibility.** Within one nusach, each trope is a small set of fixed motifs. The motif lands on the stressed syllable, which the trope's position marks, except for the prepositive and postpositive marks (pashta, telisha, zarka, segol, yetiv), where a lookup or meteg handles it. Context rules cover the rest: pashta doubling, munach before zarka, short versus long tevir, and the haftarah final cadence. So **pitch and rhythm per syllable are computable from the Masoretic text the sheet already holds.** This is exactly what TropeTrainer did in 1990s code. No published computational *synthesis* system exists; academic work is analysis (Kranenburg et al., ISMIR 2011, https://ismir2011.ismir.net/papers/OS2-3.pdf ; Technion, https://keshet.net.technion.ac.il/files/2022/05/BenShalomKeYe14.pdf).
- **Rendering paths:**
  1. Computed MIDI plus Hebrew phonemes, sent to a custom DiffSinger model of the cantor. This gives the best ceiling. It needs (b)'s custom model, so it's months of hobby-research effort.
  2. Computed MIDI sent to a non-Hebrew SVS through Spanish-ish phonemes, then RVC to the cantor's timbre. Working but accented. A proof of concept takes days to weeks.
  3. **Concatenation:** stitch the cantor's own recorded motifs, pitch-shifted and time-stretched to the syllables (PSOLA/WORLD). This is TropeTrainer-level quality. It's fully deterministic, so the melody can't be "wrong," and it's cheap.
- **Realistic v1 of AI chant:** path 3, or path 2 for the "any verse" drill only. It should be clearly labeled, and never replace a recording where one exists. Expect "clearly synthetic but melodically correct," about TropeTrainer parity. "Indistinguishable from the cantor on any verse" is research-grade and not a 2.0 promise.

---

## 3. The "record a lot" baseline (numbers computed, not guessed)

Verse counts come from Hebcal leyning data (https://github.com/hebcal/hebcal-leyning) and Sefaria chapter shapes:
- **Weekly Ashkenazi haftarot, 54 parashiyot: 1,239 verses** (average 22.7; range 9 to 52).
- **Holiday and special-Shabbat haftarot: about 28 distinct readings, about 670 verses.** That covers the Four Parshiyot, Rosh Chodesh, Machar Chodesh, Chanukah, Shuva, festivals, Tisha b'Av, fast days and Yom Kippur (Jonah).
- **Full Diaspora annual cycle: about 82 haftarot, about 1,900 verses.**
- **Torah: 5,846 verses.**

Measured from PocketTorah's archive metadata, as a real chanted pace:
- 54 weekly haftarot = **387 minutes** (average 7.2 min, about **18.7 seconds per verse**), 93 MB at about 33 kbps.
- Torah = 25.4 hours (about 15.6 seconds per verse).

**Studio time** (assuming 2–3x the finished length for takes, fixes and breaks):

| Scope | Finished audio | Studio/session time |
|---|---|---|
| Trope-family drill set (each family slow and in tempo, on a syllable and on 2 real words, plus haftarah blessings and final cadence) | ~30–45 min | **2–4 h** |
| 54 weekly haftarot | ~6.5 h | **~15–20 h** |
| + holidays/specials (full annual cycle) | ~10 h total | **~25–30 h** |
| Full Torah | ~25 h | 60–80 h (not for 2.0) |

**A per-family drill set plus about 60 recorded haftarot is a far more realistic product than AI synthesis.** It's achievable in roughly 10–15 two-hour sessions over a season. The weekly sheet only needs one haftarah a week, so it can **ship week by week** ("record this Thursday, publish Friday"). Recording the whole cycle up front isn't necessary.

**PocketTorah licensing precedent:** foundation-funded new recordings, released CC BY-SA. Anyone may reuse them with credit, under share-alike. That gives CRC a **stopgap** (attributed PocketTorah haftarah MP3s, synced to our verses) while the cantor records, if Daniel wants one and the chanter's nusach and accuracy pass the cantor's ear. Note that CRC's haftarah selection may differ from PocketTorah's, which follows the traditional Ashkenazi ranges.

---

## 4. Verse- and word-level sync on the web

**Verse level (enough for v1):**
- Easiest and most robust: **record each verse as its own take** (the cantor pauses between verses). Splitting on silence (ffmpeg `silencedetect`) gives the cue list automatically. Either store per-verse files or one file plus a `timings.json` `[{ref, start, end}]` next to `sheet.json`.
- Fallback: a small "tap along" authoring page where Daniel taps at each verse start while it plays. That's about 10 minutes per week.

**Word level (karaoke):**
- **Meta MMS forced aligner** covers about 1,130 languages, including Hebrew (`heb`), through uroman romanization. There's a torchaudio tutorial (https://docs.pytorch.org/audio/2.8/tutorials/forced_alignment_for_multilingual_data_tutorial.html) and a CLI wrapper, **ctc-forced-aligner** (BSD-2; https://github.com/MahmoudAshraf97/ctc-forced-aligner), which gives word-level JSON. **The default model is CC-BY-NC-4.0.** That's fine for a free nonprofit site, but it's worth a line in the decisions log.
  Caveat: MMS was trained on speech. Long melismas in chant stretch vowels, so expect drift and plan a quick correction pass. That suggests an authoring page that nudges word boundaries.
- **WhisperX / ivrit.ai Whisper:** ivrit.ai's fine-tunes transcribe Hebrew well, but their timestamp quality on *singing* is unproven. Use them for a sanity check that the take matches the text, not for alignment. https://github.com/ShmuelRonen/hebrew_whisper
- **Montreal Forced Aligner:** no pretrained Hebrew acoustic model was found. You'd have to train one; skip it.
- Run everything **offline at publish time** on Daniel's PC (CPU works for 7-minute files, just slowly) or a free Colab. There's no server cost.

**Player patterns (plain JS, fits `site/app/sheet.js`):**
- One `<audio preload="metadata">`. Drive highlighting from a `requestAnimationFrame` loop that reads `currentTime`, because `timeupdate` fires only about every 250 ms, too coarse for words. Toggle `aria-current` and a class on the verse and word spans, which the trope-colors mode already renders.
- Tap a verse: seek to `start` and play. Loop a verse or phrase with A–B bounds checked in the rAF loop.
- **Slow down without pitch change:** `audio.playbackRate = 0.5–0.75`. Pitch is preserved by default (`preservesPitch`) in current Chrome, Safari and Firefox. Below about 0.5 it sounds smeary; for drills, record a separately sung slow version.
- Use HTTP range requests (Blob/CDN supports them) so seeking doesn't download the whole file.
- **Format: MP3, mono, 64–96 kbps** for universal support (Opus-in-WebM on older iOS Safari is spotty), at about 0.5–0.7 MB per minute.
- Respect `prefers-reduced-motion` for the karaoke animation, and expose keyboard controls (space, arrow keys, L for loop) in line with the existing Aa/Escape work.

**Storage and bandwidth (Vercel Blob, docs updated 2026-09-23: https://vercel.com/docs/vercel-blob/usage-and-pricing):**
- Hobby includes 1 GB storage and 10 GB Blob data transfer per month. If you exceed it, Blob is blocked for 30 days (it doesn't bill), so set an alert. Pro is about $0.023/GB-month storage and about $0.05/GB transfer (iad1), and cache HITs don't count as operations.
- 60 haftarot x 7.2 min x about 0.6 MB/min = **about 260 MB** (about 520 MB if per-verse clips are stored too). Drill clips are under 30 MB. **That fits Hobby's 1 GB with room to spare.**
- Traffic: 100 listens a week x 7 MB is about 3 GB a month, so **$0 on Hobby and about $0.15/month on Pro.** Bandwidth won't threaten the $20 ceiling unless a haftarah goes viral; even 100 GB/month is about $5 on Pro.

---

## 5. Ethics and consent

- **A written voice license with the cantor, signed before any recording.** Three separable grants with separate checkboxes:
  - (A) Recordings of his chanting published on CRC's site and PDFs.
  - (B) Use of the recordings to train an AI model of his voice, internal and experimental only.
  - (C) Publication of synthetic audio in his voice.
  Each grant states its scope (CRC's study materials only, no commercial resale, no other liturgy or speech) and its credit line.
- **Withdrawal:** (B) and (C) are revocable on 30 days' notice. On revocation CRC deletes the model weights and any training copies, and takes synthetic audio offline. Deletion should be confirmed in writing and logged. Whether (A) recordings stay up after withdrawal should be his choice in the contract. A default of "they stay, credited, unless you ask" is common.
- **Model weights are the sensitive asset.** An RVC `.pth` file lets anyone make him "say" anything. Never publish it or put it in the repo or Blob. Keep it on Daniel's machine or encrypted storage, and destroy it on request.
- **Compensation and recognition:** even for a best friend, a nominal honorarium or donation and a named credit make the license clearly voluntary and current.
- **Label synthetic audio** in the player itself, not only in fine print: "AI-generated in Cantor X's voice, with his permission; melody computed from the trope marks." Never mix synthetic and recorded audio without a visible marker. Learners will imitate mistakes.
- **Law:** the federal NO FAKES Act isn't law yet. S.4591 cleared Senate Judiciary on 2026-06-18 and was blocked on the floor on 2026-09-30. Its draft requires written, specific, signed licenses of 10 years or less for living people's digital replicas. That's a good template to follow now.
  https://www.congress.gov/bill/119th-congress/senate-bill/1367 , https://www.hklaw.com/en/insights/publications/2026/06/senate-judiciary-committee-advances-legislation-to-protect-name
  Several states (Tennessee's ELVIS Act, California, New York, Illinois) already restrict unauthorized voice replicas; Missouri has general right-of-publicity common law. A written license makes all of these moot.
- **Also:** when the cantor leaves CRC or dies, what happens to the voice? Write it down now. TropeTrainer's fate (one person, no succession) is the cautionary tale for both the code and the voice.

---

## 6. Feature list for a CRC "trope trainer", ranked by value to adult learners

1. **Hear this week's haftarah chanted, with the current verse highlighted; tap any verse to hear it.** This is the core, and almost all the value for non-chanters.
2. **Slow down (0.5x–1x) and loop a verse.** This is the main thing actual chanters practice with.
3. **Trope-family drills tied to the existing trope-colors mode:** tap a colored phrase and hear that family's motif alone (on "la" and on the word), then in the verse. This is the actual "trainer."
4. **A trope chart page:** every haftarah trope mark with its name, glyph, family color and a recorded motif. It's printable, and it reuses the `--trope` PDF work.
5. **Word-level karaoke highlighting.** Nice, but it costs alignment and correction time each week.
6. **Echo mode:** play a phrase, pause for the learner to repeat, play the next phrase.
7. **Record yourself and play it back against the cantor**, done in the browser with MediaRecorder and **never uploaded.** This is cheap and private.
8. **An archive covering every haftarah in the cycle** (and later, any verse), not just this week's.
9. **"Any verse" synthetic chant,** labeled AI, for passages the cantor hasn't recorded. This belongs in 2.x.
10. **Automatic pitch feedback** ("you sang tevir flat"), using pitch tracking against the reference. This is research-grade and later.
11. **Multiple nusachot.** Lowest value for CRC's audience.

---

## 7. Recommended path, in stages

**Stage 0: paperwork and gear (before 2.0 code).**
- Voice license signed. The cantor names his nusach and reference book.
- Pick the venue: a quiet room with a loaned mic, or a local studio.
- Recording spec: 48 kHz/24-bit WAV, dry room, 15–20 cm from a cardioid mic, a 2-second pause between verses, and a slate saying "Isaiah 42:5" before each haftarah.

**Stage 1: ship in 2.0 (recorded audio only).**
1. Record the **trope-family drill set** first (2–4 hours). It serves features 3 and 4 for every week at once, and it's the most reusable asset.
2. Record **this season's haftarot week by week** ahead of each Shabbat, then backfill to about 60.
3. Build a pipeline step in the existing publish flow:
   - WAV, then loudness normalization (`ffmpeg loudnorm` -16 LUFS), then a mono 80 kbps MP3, then a silence split into verse cues, then `timings.json` uploaded to the week's Blob folder next to `sheet.json`.
   - Have the cantor confirm each take's verse map with a quick listen.
4. Player features 1, 2, 3, 4 and 7. Add feature 5 (word karaoke via ctc-forced-aligner plus a correction page) only if verse-level sync feels thin.
5. Optional stopgap: attributed PocketTorah CC BY-SA audio for weeks not yet recorded (Daniel's call, and the cantor's ear).

**Stage 2: 2.x experiments (after about 6–7 hours of his chant exist).**
- Train an **RVC model** on 30+ minutes of his cleanest takes. Cost: about $5 of cloud GPU, or free Colab. Test it privately on Daniel's own chanting re-voiced as the cantor's.
- Prototype the **te'amim-to-melody engine** in JS from the cantor's drill set. Start with concatenation (path 3), then try SVS plus RVC (path 2). Gate publication on the cantor's blind review: does it sing the right melody? Would he sign his name to it?

**Stage 3: later (3.0).** A custom DiffSinger Hebrew model trained on the cantor's full haftarah corpus, for "any verse, any book." Optionally, Torah recordings.

**Should AI voice be in 2.0? No.** 2.0 can deliver about 90% of the learner value with real recordings at almost no running cost. AI chant today is either a re-voicing of another human (it doesn't save the cantor's effort for the weekly sheet) or a computed melody that sounds synthetic and needs a custom engine. Put it in 2.x as a labeled experiment built on the 2.0 corpus.

---

## 8. Costs

**One-time:**

| Item | Low | Typical |
|---|---|---|
| Mic + interface + stand + pop filter (if not borrowed) | $0 | $250–450 |
| Or a local studio, 20–30 h at $50–100/h | — | $1,000–3,000 (only if home recording is too noisy) |
| Cantor honorarium (Daniel's call) | $0 | $500–2,000 |
| Lawyer review of the voice license (optional; a template exists) | $0 | $300–750 |
| RVC training GPU (RunPod/Colab) | $0 | $5–20 |
| Prototyping hosted SVS, if tried (ACE Studio or kits, 1–2 months) | $0 | $20–60 |

**Monthly:**

| Item | Estimate |
|---|---|
| Blob storage, under 1 GB | $0 on Hobby; about $0.02 on Pro |
| Blob transfer, 2–10 GB | $0 on Hobby; about $0.10–0.50 on Pro |
| Alignment and encoding (local, offline) | $0 |
| AI inference (pre-rendered offline, not on demand) | $0 |
| **Total** | **Under $1/month.** Well inside the $20 ceiling. Avoid any per-month SaaS voice subscription. |

---

## 9. Risks

- **Teaching errors:** a wrong motif in synthetic audio, or a misaligned highlight, teaches the wrong thing. Mitigate with the cantor's sign-off and with synthetic audio never shown as authoritative.
- **Cantor capacity and consent:** a single point of failure for content. If he withdraws or moves away, consent revocation has to be operational: deletion steps, and what stays online.
- **Model-weight leakage:** a deepfake risk to a real person. Keep weights offline and never in the repo or Blob.
- **Tool churn:** Seed-VC is archived and Applio is in maintenance mode. The recorded WAV corpus is the durable asset; models are disposable.
- **Licensing gotchas:** MMS aligner weights are CC-BY-NC. PocketTorah audio is CC BY-SA (attribution plus share-alike on derivatives such as edited clips). Seed-VC is GPL (only matters if redistributed).
- **Nusach mismatch:** if the cantor's tradition differs from what CRC's b'nei mitzvah learn, learners get two melodies. Confirm before recording.
- **Selection mismatch:** CRC/Reform may read shorter or alternative haftarot than the traditional ranges. Record the passage CRC actually reads.
- **Hobby-plan cliff:** exceeding Blob limits on Hobby blocks Blob for 30 days, taking the whole site's week data down with it. Add a usage alert, or keep audio in a separate store.
- **Scope creep:** "TropeTrainer competitor" can swallow 2.0. Hold to stage 1.

---

## 10. Questions only Daniel or the cantor can answer (8)

1. **Cantor:** which haftarah nusach and reference do you chant (Binder, Jacobson, family or teacher tradition)? Is it what CRC's b'nei mitzvah students are taught?
2. **Cantor:** which of the three grants will you sign: (A) recordings published, (B) AI model trained privately, (C) synthetic audio published in your voice? On what credit and compensation, and what should happen to each if you later withdraw?
3. **Cantor:** how many recording hours can you realistically give per month, and where: home, CRC sanctuary or a studio? Can you record the weekly haftarah 2–3 days before Shabbat?
4. **Daniel:** for 2.0, haftarah only, or also the blessings before and after, megillot, and High Holy Days? (Torah is a 60–80-hour project.)
5. **Daniel:** do we record the traditional haftarah range, or exactly the passage CRC reads when it differs?
6. **Daniel:** may we use attributed PocketTorah CC BY-SA recordings as a placeholder for weeks the cantor hasn't recorded yet, or cantor-only?
7. **Daniel:** what's the acceptable bar for AI chant on the public site: "clearly synthetic but melodically correct" (TropeTrainer-like), "only if the cantor can't tell," or "never public, internal practice only"?
8. **Daniel:** is "record yourself" (local-only, never uploaded) in scope for 2.0? Do you ever want learners to *send* a recording to the cantor for feedback? That adds storage, privacy and a moderation workload.
