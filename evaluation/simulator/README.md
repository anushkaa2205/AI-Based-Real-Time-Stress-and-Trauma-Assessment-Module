# Simulator cases (C01–C12)

The twelve synthetic cases the NHAA Simulator plays (task S.2, FR-SIM-02). Design and running order: `docs/SIMULATOR_PLAN.md`.

**A case file is a script, not a result.** It says what the caller says, types or presses, on which channel and in which language, and which band the team *expects*. The SVI, band, indicators and recommendations shown in the simulator come only from the module when the case is played. The schema (`web/src/contracts/simulator.ts`) rejects any result field.

| Case | Channel | Language | Expected | What it proves |
|---|---|---|---|---|
| C01 | Phone call | Hindi | Low | Does not over-react to a calm information request |
| C02 | Phone call | Hindi | High | Intimidation to withdraw, supported by long pauses |
| C03 | Phone call | Hindi | Critical | Accused outside now; indirect words about not being around |
| C04 | Phone call | Hindi | Two readings | Same words, calm vs shaking voice |
| C05 | IVRS | Hindi | Moderate | Keypad answers plus a short spoken answer |
| C06 | IVRS | Marathi | High | "Not safe right now" by key press (OV-9) |
| C07 | Chatbot | Hinglish | Moderate | Romanised Hindi; isolation and fear |
| C08 | Chatbot | Hindi | Moderate | Understands a clear "no" to self-harm |
| C09 | Mobile app | Hindi | High | Voice note plus a typed message |
| C10 | Mobile app | English | Low | Routine case for the queue contrast |
| C11 | Portal | Tamil | High | Long written complaint after displacement |
| C12 | Portal | Bengali | High | Bereaved family member, no means of support |

## Rules for every script

- Fully made up. No real names. No place below state level in the script text (`districtCode` is routing metadata only).
- Respectful and non-graphic (C-DAT-03). No caste or community detail.
- Every non-English line has an English `gloss` so reviewers can check it. The gloss is for the team only and is never shown as the module's output.
- Two team members review each script before it is recorded; add their names to `reviewedBy`.
- If a played case does not reach its expected band, **change the script, never the scoring, lexicon or prompts**, and note the change.

## Audio

Spoken lines point to files in `audio/`. `source` is `TTS`, `TEAM_RECORDING` or `PLACEHOLDER` (not recorded yet; the file may be missing). Recordings: quiet room, 20–60 s per case, by team members only, never real caller audio.

## Checking

```bash
npm run sim:validate
```

Run it from `web/`. It fails on any schema or library error, and lists the reviews and recordings still owed by the team.
