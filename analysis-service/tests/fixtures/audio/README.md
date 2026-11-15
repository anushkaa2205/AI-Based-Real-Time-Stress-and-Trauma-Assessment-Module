# Audio test fixtures

**Synthetic only.** No recording of any real person is ever stored in this repository (FR-VOI-09, CLAUDE.md rule 11). `.gitignore` blocks all audio files except the one listed below.

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
