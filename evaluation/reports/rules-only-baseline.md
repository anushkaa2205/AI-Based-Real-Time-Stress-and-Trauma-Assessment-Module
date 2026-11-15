# Rules-only baseline (no AI)

Scenarios: 62 · scoring config v2 · labels are drafts until two team members agree (AC-EVAL-01).

- **Band accuracy:** 48/62 (77%) — target ≥ 80% (AC-RISK-01)
- **Critical scenarios placed below High:** 0 — target 0
- **Expected recommendations produced:** 83/92 (90%) — target ≥ 85% (AC-REC-01)
- **Slowest scenario:** 824.5 ms
- **Suicidal-ideation recall:** 100% (AC-NLP-01 target 100%) · **immediate-danger recall:** 100% (AC-NLP-02 target 100%)

## Confusion matrix (rows = expected, columns = rules-only result)

| expected \ got | LOW | MODERATE | HIGH | CRITICAL |
|---|---|---|---|---|
| LOW | 16 | 0 | 1 | 0 |
| MODERATE | 13 | 2 | 0 | 0 |
| HIGH | 0 | 0 | 15 | 0 |
| CRITICAL | 0 | 0 | 0 | 15 |

## Indicators (detected = dimension score ≥ 0.5)

| Dimension | TP | FN | FP | Recall | Precision |
|---|---|---|---|---|---|
| DEPRESSION | 1 | 0 | 0 | 100% | 100% |
| EXTREME_VULNERABILITY | 1 | 0 | 1 | 100% | 50% |
| FEAR_ANXIETY | 7 | 1 | 2 | 88% | 78% |
| INTIMIDATION | 15 | 1 | 2 | 94% | 88% |
| SEVERE_TRAUMA | 5 | 0 | 0 | 100% | 100% |
| SOCIAL_ISOLATION | 5 | 2 | 0 | 71% | 100% |
| SUICIDAL_IDEATION | 8 | 0 | 1 | 100% | 89% |

## Band accuracy by group (fairness check, NFR-ETH-04)

| Group | n | Band accuracy |
|---|---|---|
| language:bn | 5 | 100% |
| language:en | 19 | 68% |
| language:hi | 15 | 73% |
| language:hi-Latn | 13 | 85% |
| language:mr | 5 | 80% |
| language:ta | 5 | 80% |
| gender:F | 34 | 76% |
| gender:M | 23 | 78% |
| gender:OTHER | 2 | 50% |
| gender:UNDISCLOSED | 3 | 100% |
| channel:CHATBOT | 41 | 78% |
| channel:IVRS | 2 | 100% |
| channel:PORTAL | 14 | 86% |
| channel:VOICE_CALL | 5 | 40% |

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
| S027 | hi | LOW | LOW | 0 | - | - |
| S028 | hi | LOW | LOW | 0 | - | - |
| S029 | hi | MODERATE | **LOW** | 0 | - | REHABILITATION_RELIEF |
| S030 | hi | MODERATE | **LOW** | 11 | - | - |
| S031 | hi | HIGH | HIGH | 14 | OV-4 | WITNESS_PROTECTION |
| S032 | hi | HIGH | HIGH | 10 | OV-9 | - |
| S033 | hi | CRITICAL | CRITICAL | 14 | OV-2 | - |
| S034 | hi | CRITICAL | CRITICAL | 13 | OV-3 | - |
| S035 | hi-Latn | LOW | LOW | 0 | - | - |
| S036 | hi-Latn | LOW | LOW | 0 | - | - |
| S037 | hi-Latn | MODERATE | **LOW** | 0 | - | REHABILITATION_RELIEF |
| S038 | hi-Latn | MODERATE | **LOW** | 8 | - | - |
| S039 | hi-Latn | HIGH | HIGH | 13 | OV-7 | - |
| S040 | hi-Latn | HIGH | HIGH | 18 | OV-6 | - |
| S041 | hi-Latn | CRITICAL | CRITICAL | 14 | OV-2 | - |
| S042 | hi-Latn | CRITICAL | CRITICAL | 19 | OV-1 | - |
| S043 | en | LOW | LOW | 11 | - | - |
| S044 | en | LOW | LOW | 0 | - | - |
| S045 | en | LOW | LOW | 0 | - | - |
| S046 | en | MODERATE | **LOW** | 6 | - | LEGAL_AID |
| S047 | en | MODERATE | **LOW** | 9 | - | - |
| S048 | en | MODERATE | **LOW** | 6 | - | - |
| S049 | en | HIGH | HIGH | 14 | OV-4 | - |
| S050 | en | HIGH | HIGH | 11 | OV-5 | COUNSELLING |
| S051 | en | HIGH | HIGH | 15 | OV-6 | - |
| S052 | en | CRITICAL | CRITICAL | 19 | OV-1 | - |
| S053 | en | CRITICAL | CRITICAL | 23 | OV-2, OV-9 | - |
| S054 | mr | MODERATE | **LOW** | 6 | - | - |
| S055 | mr | HIGH | HIGH | 13 | OV-7 | - |
| S056 | mr | LOW | LOW | 11 | - | - |
| S057 | ta | CRITICAL | CRITICAL | 14 | OV-2 | - |
| S058 | ta | MODERATE | **LOW** | 8 | - | - |
| S059 | ta | LOW | LOW | 0 | - | - |
| S060 | bn | HIGH | HIGH | 14 | OV-4 | WITNESS_PROTECTION |
| S061 | bn | LOW | LOW | 0 | - | - |
| S062 | bn | CRITICAL | CRITICAL | 13 | OV-3 | - |
