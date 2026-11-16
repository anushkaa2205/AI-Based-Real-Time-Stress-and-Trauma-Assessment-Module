# Audio test fixtures

**Synthetic only.** No recording of any real person is ever stored in this repository (FR-VOI-09, CLAUDE.md rule 11). `.gitignore` blocks all audio files except the two listed below.

## `pauses_en.wav`

Offline text-to-speech (Windows "Microsoft Zira Desktop" voice), 16 kHz, 16-bit, mono, about 21 s long.

- **Content:** six neutral phrases about a village meeting, 52 words in total.
- **Pauses:** five inserted pauses, in order 700, 1000, 1300, 1600 and 900 ms.
- **Used by:**
  - `tests/test_audio.py`: AC-VOI-01 pauses, AC-VOI-03 speech rate, endpoint tests.
  - `web/tests/e2e/voice.spec.ts`: the voice call end to end.
  - `scripts/spike_voice.py`: speed and memory measurement.

To regenerate it on Windows (PowerShell):

```powershell
Add-Type -AssemblyName System.Speech
$phrases = @(
  "the village meeting was held near the old school",
  "many families came to talk about the water supply",
  "the officer wrote down every complaint in a register",
  "people asked when the new pump would be repaired",
  "the committee promised to visit again next month",
  "everyone went home before the evening rain started"
)
$breaks = @(700, 1000, 1300, 1600, 900)
$body = ""
for ($i = 0; $i -lt $phrases.Count; $i++) {
  $body += $phrases[$i]
  if ($i -lt $breaks.Count) { $body += " <break time=`"$($breaks[$i])ms`"/> " }
}
$ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='Microsoft Zira Desktop'>$body</voice></speak>"
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$s.SetOutputToWaveFile("$PWD\pauses_en.wav", $fmt)
$s.SpeakSsml($ssml)
$s.Dispose()
```

## `two_voices_en.wav`

Offline text-to-speech with two Windows voices taking turns, 16 kHz, 16-bit, mono, about 28 s long. It stands in for a helpline call recorded as one mixed track (task M.10, FR-VOI-10, AC-VOI-08).

- **Operator:** "Microsoft David Desktop". **Caller:** "Microsoft Zira Desktop". The operator speaks first.
- **Content:** six neutral turns (a greeting, a question about a postponed hearing, "are you safe right now?", a calm answer), with a 700 ms break after each turn.
- **Who speaks when** is listed in `TRUTH` in `tests/test_speakers.py`.
- **Limit:** two synthetic voices of different genders are much easier to tell apart than two real people on a phone line. The fixture proves the mechanics of separation, not real-world accuracy.
- **Used by:** `tests/test_speakers.py` (AC-VOI-08, with the real speaker model; skipped if the model is not available offline).

To regenerate it on Windows (PowerShell):

```powershell
Add-Type -AssemblyName System.Speech
$turns = @(
  @("Microsoft David Desktop", "National helpline against atrocities. How can I help you today?"),
  @("Microsoft Zira Desktop", "I want to ask about my complaint. The hearing was postponed again."),
  @("Microsoft David Desktop", "I understand. Are you safe right now?"),
  @("Microsoft Zira Desktop", "Yes, I am at home with my sister."),
  @("Microsoft David Desktop", "Is there anything else you would like us to know?"),
  @("Microsoft Zira Desktop", "We have been worried since the meeting in the village.")
)
$body = ""
foreach ($t in $turns) { $body += "<voice name='$($t[0])'>$($t[1])</voice><break time='700ms'/>" }
$ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>$body</speak>"
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$s.SetOutputToWaveFile("$PWD\two_voices_en.wav", $fmt)
$s.SpeakSsml($ssml)
$s.Dispose()
```
