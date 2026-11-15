# Rules-only baseline (no AI)

Scenarios: 26 · scoring config v2 · labels are drafts until two team members agree (AC-EVAL-01).

- **Band accuracy:** 21/26 (81%) — target ≥ 80% (AC-RISK-01)
- **Critical scenarios placed below High:** 0 — target 0
- **Expected recommendations produced:** 39/42 (93%) — target ≥ 85% (AC-REC-01)
- **Slowest scenario:** 813.4 ms
- **Suicidal-ideation recall:** 100% (AC-NLP-01 target 100%) · **immediate-danger recall:** 100% (AC-NLP-02 target 100%)

## Confusion matrix (rows = expected, columns = rules-only result)

| expected \ got | LOW | MODERATE | HIGH | CRITICAL |
|---|---|---|---|---|
| LOW | 6 | 0 | 1 | 0 |
| MODERATE | 4 | 2 | 0 | 0 |
| HIGH | 0 | 0 | 6 | 0 |
| CRITICAL | 0 | 0 | 0 | 7 |

## Indicators (detected = dimension score ≥ 0.5)

| Dimension | TP | FN | FP | Recall | Precision |
|---|---|---|---|---|---|
| DEPRESSION | 1 | 0 | 0 | 100% | 100% |
| EXTREME_VULNERABILITY | 1 | 0 | 0 | 100% | 100% |
| FEAR_ANXIETY | 2 | 0 | 1 | 100% | 67% |
| INTIMIDATION | 6 | 1 | 0 | 86% | 100% |
| SEVERE_TRAUMA | 2 | 0 | 0 | 100% | 100% |
| SOCIAL_ISOLATION | 3 | 0 | 0 | 100% | 100% |
| SUICIDAL_IDEATION | 4 | 0 | 1 | 100% | 80% |

## Band accuracy by group (fairness check, NFR-ETH-04)

| Group | n | Band accuracy |
|---|---|---|
| language:bn | 2 | 100% |
| language:en | 8 | 63% |
| language:hi | 7 | 71% |
| language:hi-Latn | 5 | 100% |
| language:mr | 2 | 100% |
| language:ta | 2 | 100% |
| gender:F | 14 | 86% |
| gender:M | 11 | 73% |
| gender:UNDISCLOSED | 1 | 100% |
| channel:CHATBOT | 20 | 85% |
| channel:PORTAL | 6 | 67% |

## Per scenario

| ID | Lang | Expected | Got | SVI | Overrides | Missing recommendations |
|---|---|---|---|---|---|---|
| S001 | en | LOW | LOW | 0 | - | - |
| S002 | hi | LOW | LOW | 0 | - | - |
| S003 | hi-Latn | LOW | LOW | 0 | - | - |
| S004 | en | LOW | **HIGH** | 16 | OV-6 | INFORMATION |
| S005 | hi-Latn | LOW | LOW | 0 | - | - |
| S006 | en | MODERATE | **LOW** | 13 | - | - |
| S007 | hi | MODERATE | **LOW** | 8 | - | - |
| S008 | hi-Latn | MODERATE | MODERATE | 7 | OV-8 | - |
| S009 | en | MODERATE | **LOW** | 9 | - | - |
| S010 | hi | MODERATE | **LOW** | 6 | - | - |
| S011 | en | HIGH | HIGH | 13 | OV-7 | - |
| S012 | hi | HIGH | HIGH | 15 | OV-6 | - |
| S013 | hi-Latn | HIGH | HIGH | 14 | OV-4 | - |
| S014 | en | HIGH | HIGH | 11 | OV-5 | COUNSELLING |
| S015 | hi | HIGH | HIGH | 12 | OV-7 | - |
| S016 | hi | CRITICAL | CRITICAL | 14 | OV-2, OV-7 | - |
| S017 | en | CRITICAL | CRITICAL | 19 | OV-1 | - |
| S018 | hi-Latn | CRITICAL | CRITICAL | 14 | OV-2 | - |
| S019 | en | CRITICAL | CRITICAL | 20 | OV-1 | - |
| S020 | hi | CRITICAL | CRITICAL | 13 | OV-3 | - |
| S021 | mr | CRITICAL | CRITICAL | 24 | OV-2, OV-9 | - |
| S022 | mr | LOW | LOW | 0 | - | - |
| S023 | ta | HIGH | HIGH | 7 | OV-7 | POLICE_INTERVENTION |
| S024 | ta | LOW | LOW | 0 | - | - |
| S025 | bn | CRITICAL | CRITICAL | 19 | OV-1 | - |
| S026 | bn | MODERATE | MODERATE | 7 | OV-8 | - |
