# Recorded audio library (demo input layer, task M.14)

Repeatable helpline calls for presentations. **Synthetic scripts, the team's own voices.** Audio is never generated (`docs/PRODUCT_VISION.md`, decision Q4).

- `library.json` lists the scenarios. Each one points at an evaluation scenario in `evaluation/scenarios/`. That scenario's conversation is the script, and its `expected` block is the label fixed before any run. The demo shows the label apart from the module's result, for comparison only, and never sends it to the module.
- Recordings go in `audio/<scenarioId>.wav`, for example `audio/S047.wav`. The folder is **git-ignored**: real voices are never committed (FR-VOI-09).

## How to record one

1. Open the demo page **Recorded audio** (signed in as a supervisor, `DEMO_ENABLED=true`). Each scenario card shows its script with who says what.
2. Two team members read it like a helpline call: one reads the **operator** lines, the other the **caller** lines. The operator speaks first (the helpline answers), unless the card says otherwise. Speak calmly and naturally, with short pauses between turns. Lines with no operator line before them are the caller continuing.
3. Record both voices on one track (a phone on speaker, or one laptop microphone). That is a `MIXED` recording, and the module separates the two voices (task M.10). If you record the caller alone, set `"audioSource": "CALLER_ONLY"` for that item in `library.json`.
4. Export as **WAV, PCM 16-bit**, mono, 16 kHz if you can (any PCM WAV works; the demo converts it). Audacity, which is free, does this: *File, Export Audio, WAV, Signed 16-bit PCM*.
5. Save it as `audio/<scenarioId>.wav` and reload the page. The card now offers **Play through the module**.

Keep each recording under 10 minutes and 50 MB. Only consenting team members record, reading only the script. No real case, no real names or places.

## On the deployed demo

Files in this folder exist only on the machine that has them. On a hosted demo, use **Upload a WAV** on the same page (up to 4 MB, about 2 minutes at 16 kHz). It goes through exactly the same path.
