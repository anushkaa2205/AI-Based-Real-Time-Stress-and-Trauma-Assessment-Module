# Rules + AI (analysis service)

Scenarios: 20 · scoring config v1 · labels are drafts until two team members agree (AC-EVAL-01).

- **Band accuracy:** 15/20 (75%) — target ≥ 80% (AC-RISK-01)
- **Critical scenarios placed below High:** 0 — target 0
- **Expected recommendations produced:** 32/33 (97%) — target ≥ 85% (AC-REC-01)
- **Slowest scenario:** 4352.2 ms
- **AI calls:** 20, degraded: 0, AI quotes dropped by guardrails: 0
- **Suicidal-ideation recall:** 100% (AC-NLP-01 target 100%) · **immediate-danger recall:** 100% (AC-NLP-02 target 100%)

## Confusion matrix (rows = expected, columns = rules-only result)

| expected \ got | LOW | MODERATE | HIGH | CRITICAL |
|---|---|---|---|---|
| LOW | 4 | 0 | 1 | 0 |
| MODERATE | 4 | 1 | 0 | 0 |
| HIGH | 0 | 0 | 5 | 0 |
| CRITICAL | 0 | 0 | 0 | 5 |

## Indicators (detected = dimension score ≥ 0.5)

| Dimension | TP | FN | FP | Recall | Precision |
|---|---|---|---|---|---|
| ACUTE_STRESS | 0 | 0 | 1 | n/a | 0% |
| DEPRESSION | 1 | 0 | 1 | 100% | 50% |
| EXTREME_VULNERABILITY | 1 | 0 | 2 | 100% | 33% |
| FEAR_ANXIETY | 2 | 0 | 3 | 100% | 40% |
| INTIMIDATION | 5 | 0 | 0 | 100% | 100% |
| SEVERE_TRAUMA | 2 | 0 | 0 | 100% | 100% |
| SOCIAL_ISOLATION | 2 | 0 | 0 | 100% | 100% |
| SUICIDAL_IDEATION | 3 | 0 | 1 | 100% | 75% |

## Band accuracy by group (fairness check, NFR-ETH-04)

| Group | n | Band accuracy |
|---|---|---|
| language:en | 8 | 63% |
| language:hi | 7 | 71% |
| language:hi-Latn | 5 | 100% |
| gender:F | 11 | 82% |
| gender:M | 9 | 67% |
| channel:CHATBOT | 17 | 82% |
| channel:PORTAL | 3 | 33% |

## Per scenario

| ID | Lang | Expected | Got | SVI | Overrides | Missing recommendations |
|---|---|---|---|---|---|---|
| S001 | en | LOW | LOW | 0 | - | - |
| S002 | hi | LOW | LOW | 0 | - | - |
| S003 | hi-Latn | LOW | LOW | 0 | - | - |
| S004 | en | LOW | **HIGH** | 16 | OV-6 | INFORMATION |
| S005 | hi-Latn | LOW | LOW | 0 | - | - |
| S006 | en | MODERATE | **LOW** | 13 | - | - |
| S007 | hi | MODERATE | **LOW** | 15 | - | - |
| S008 | hi-Latn | MODERATE | MODERATE | 15 | OV-8 | - |
| S009 | en | MODERATE | **LOW** | 21 | - | - |
| S010 | hi | MODERATE | **LOW** | 6 | - | - |
| S011 | en | HIGH | HIGH | 13 | OV-7 | - |
| S012 | hi | HIGH | HIGH | 14 | OV-6 | - |
| S013 | hi-Latn | HIGH | HIGH | 24 | OV-4, OV-7 | - |
| S014 | en | HIGH | HIGH | 20 | OV-5 | - |
| S015 | hi | HIGH | HIGH | 13 | OV-7 | - |
| S016 | hi | CRITICAL | CRITICAL | 14 | OV-2, OV-7 | - |
| S017 | en | CRITICAL | CRITICAL | 20 | OV-1 | - |
| S018 | hi-Latn | CRITICAL | CRITICAL | 25 | OV-2 | - |
| S019 | en | CRITICAL | CRITICAL | 26 | OV-1, OV-6 | - |
| S020 | hi | CRITICAL | CRITICAL | 13 | OV-3 | - |
