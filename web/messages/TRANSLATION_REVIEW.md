# Translations waiting for native-speaker review

JSON has no comments, so draft wording is tracked here. English (`en.json`) is the source text.
Since 16 Nov 2026 (task M.2) the message files held only what the module returns or shows: the
emergency options for calling systems (`emergency.*`) and the operator's suggested questions
(`operatorQuestions.*`, moved unchanged from the old flow and suggestion keys). Since Phase P
(17 Nov 2026) they also hold every public, portal, login and staff string, because the whole site
switches language (FR-LANG-07). Every key in
`hi`, `mr`, `ta` and `bn` is a **draft** until a native speaker has reviewed it (NFR-ACC-04, task 8.1).
Remove a row once its review is done.

| Key | Why | Reviewed (hi / mr / ta / bn) |
|---|---|---|
| `emergency.*` | Shown to the person by the calling system (FR-REC-06). | – / – / – / – |
| `operatorQuestions.*` | Read aloud by the operator (FR-DSH-01), and since Phase P shown by the portal assistant and returned by `GET …/next-question` (P.3). `operatorQuestions.opening` is new (17 Nov 2026). | – / – / – / – |
| `track.*` | The public "track your case" page of the demo (task N.8): status line, support arranged, errors. | – / – / – / – |
| `languageNames.*` | Each language named in its own script, for the language switcher (task P.5). Same in every file. | – / – / – / – |
| `public.nav.*`, `public.footer.*`, `public.trackForm.*`, `public.meta.*` | Public header, footer, track form and page titles; the whole site switches language (task P.5, FR-LANG-07). | – / – / – / – |
| `login.*` | The staff sign-in page (task P.5). | – / – / – / – |
