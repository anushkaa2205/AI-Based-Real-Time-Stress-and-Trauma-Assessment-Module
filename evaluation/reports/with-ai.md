# Rules + AI (analysis service)

Scenarios: 62 · scoring config v2 · labels are drafts until two team members agree (AC-EVAL-01).

- **Band accuracy:** 49/62 (79%) — target ≥ 80% (AC-RISK-01)
- **Critical scenarios placed below High:** 0 — target 0
- **Expected recommendations produced:** 88/92 (96%) — target ≥ 85% (AC-REC-01)
- **Slowest scenario:** 887.8 ms
- **AI calls:** 61, degraded: 0, AI quotes dropped by guardrails: 0
- **Suicidal-ideation recall:** 100% (AC-NLP-01 target 100%) · **immediate-danger recall:** 100% (AC-NLP-02 target 100%)

## Confusion matrix (rows = expected, columns = rules-only result)

| expected \ got | LOW | MODERATE | HIGH | CRITICAL |
|---|---|---|---|---|
| LOW | 16 | 0 | 1 | 0 |
| MODERATE | 12 | 3 | 0 | 0 |
| HIGH | 0 | 0 | 15 | 0 |
| CRITICAL | 0 | 0 | 0 | 15 |

## Indicators (detected = dimension score ≥ 0.5)

| Dimension | TP | FN | FP | Recall | Precision |
|---|---|---|---|---|---|
| ACUTE_STRESS | 0 | 0 | 5 | n/a | 0% |
| DEPRESSION | 1 | 0 | 2 | 100% | 33% |
| EXTREME_VULNERABILITY | 1 | 0 | 5 | 100% | 17% |
| FEAR_ANXIETY | 8 | 0 | 6 | 100% | 57% |
| INTIMIDATION | 16 | 0 | 2 | 100% | 89% |
| SEVERE_TRAUMA | 5 | 0 | 0 | 100% | 100% |
| SOCIAL_ISOLATION | 7 | 0 | 0 | 100% | 100% |
| SUICIDAL_IDEATION | 8 | 0 | 1 | 100% | 89% |

## Band accuracy by group (fairness check, NFR-ETH-04)

| Group | n | Band accuracy |
|---|---|---|
| language:bn | 5 | 100% |
| language:en | 19 | 68% |
| language:hi | 15 | 73% |
| language:hi-Latn | 13 | 92% |
| language:mr | 5 | 80% |
| language:ta | 5 | 80% |
| gender:F | 34 | 79% |
| gender:M | 23 | 78% |
| gender:OTHER | 2 | 50% |
| gender:UNDISCLOSED | 3 | 100% |
| channel:CHATBOT | 41 | 80% |
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
| S021 | mr | CRITICAL | CRITICAL | 23 | OV-2, OV-9 | - |
| S022 | mr | LOW | LOW | 0 | - | - |
| S023 | ta | HIGH | HIGH | 9 | OV-7 | - |
| S024 | ta | LOW | LOW | 0 | - | - |
| S025 | bn | CRITICAL | CRITICAL | 18 | OV-1 | - |
| S026 | bn | MODERATE | MODERATE | 7 | OV-8 | - |
| S027 | hi | LOW | LOW | 0 | - | - |
| S028 | hi | LOW | LOW | 0 | - | - |
| S029 | hi | MODERATE | **LOW** | 16 | - | - |
| S030 | hi | MODERATE | **LOW** | 19 | - | - |
| S031 | hi | HIGH | HIGH | 14 | OV-4 | WITNESS_PROTECTION |
| S032 | hi | HIGH | HIGH | 10 | OV-9 | - |
| S033 | hi | CRITICAL | CRITICAL | 25 | OV-2 | - |
| S034 | hi | CRITICAL | CRITICAL | 13 | OV-3 | - |
| S035 | hi-Latn | LOW | LOW | 0 | - | - |
| S036 | hi-Latn | LOW | LOW | 0 | - | - |
| S037 | hi-Latn | MODERATE | MODERATE | 6 | OV-8 | - |
| S038 | hi-Latn | MODERATE | **LOW** | 16 | - | - |
| S039 | hi-Latn | HIGH | HIGH | 14 | OV-4, OV-7 | - |
| S040 | hi-Latn | HIGH | HIGH | 17 | OV-6 | - |
| S041 | hi-Latn | CRITICAL | CRITICAL | 24 | OV-2 | - |
| S042 | hi-Latn | CRITICAL | CRITICAL | 18 | OV-1 | - |
| S043 | en | LOW | LOW | 11 | - | - |
| S044 | en | LOW | LOW | 0 | - | - |
| S045 | en | LOW | LOW | 0 | - | - |
| S046 | en | MODERATE | **LOW** | 8 | - | LEGAL_AID |
| S047 | en | MODERATE | **LOW** | 18 | - | - |
| S048 | en | MODERATE | **LOW** | 7 | - | - |
| S049 | en | HIGH | HIGH | 14 | OV-4, OV-7 | - |
| S050 | en | HIGH | HIGH | 22 | OV-5 | - |
| S051 | en | HIGH | HIGH | 17 | OV-6 | - |
| S052 | en | CRITICAL | CRITICAL | 18 | OV-1 | - |
| S053 | en | CRITICAL | CRITICAL | 23 | OV-2, OV-9 | - |
| S054 | mr | MODERATE | **LOW** | 7 | - | - |
| S055 | mr | HIGH | HIGH | 14 | OV-4, OV-7 | - |
| S056 | mr | LOW | LOW | 11 | - | - |
| S057 | ta | CRITICAL | CRITICAL | 25 | OV-2 | - |
| S058 | ta | MODERATE | **LOW** | 15 | - | - |
| S059 | ta | LOW | LOW | 0 | - | - |
| S060 | bn | HIGH | HIGH | 13 | OV-4 | WITNESS_PROTECTION |
| S061 | bn | LOW | LOW | 0 | - | - |
| S062 | bn | CRITICAL | CRITICAL | 14 | OV-3 | - |
