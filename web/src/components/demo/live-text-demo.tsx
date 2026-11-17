"use client";

/**
 * Demo input 1, type a message (tasks M.11, N.7; NIVARA_FLOW_AND_UI_PLAN.md §6.3). A chat window
 * that plays the part of NHAA's chatbot: each message goes, one at a time, through /api/demo to the
 * module with the demo key. The person's messages are typed by the visitor; the chatbot's questions
 * are NHAA's scripted wording and arrive as OPERATOR turns, never scored. The module itself asks
 * nothing (rule 2), and the page shows only that each message was received (rule 1).
 */
import { AlertCircle, Bot, Send, User } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { DemoReceipt } from "@/contracts/demo";
import type { VictimLang } from "@/contracts/interaction";
import { ConsentFields, DEFAULT_DISTRICT, DistrictSelect, FULL_CONSENT, LanguageSelect, type DemoConsent, type DistrictOption } from "./consent-fields";
import { DemoShell } from "./demo-shell";
import { EmergencyPanel } from "./emergency-panel";
import { Registered } from "./registered";
import { demoFetch, messageFor, useDemoCase } from "./use-demo-case";

type Sender = "VICTIM" | "OPERATOR";

interface ChatLine {
  key: string;
  sender: Sender;
  text: string;
  state: "sending" | "sent" | "failed";
}

const TITLE = "Type a message";
const LEAD = "Write as a person would in NHAA's chat. Each message goes to the module as it is; you get a docket ID at the end, never a score.";

export function LiveTextDemo({ questions, districts }: { questions: Record<VictimLang, { key: string; text: string }[]>; districts: DistrictOption[] }) {
  const demo = useDemoCase();
  const [language, setLanguage] = useState<VictimLang>("en");
  const [district, setDistrict] = useState(districts.some((d) => d.code === DEFAULT_DISTRICT) ? DEFAULT_DISTRICT : (districts[0]?.code ?? ""));
  const [consent, setConsent] = useState<DemoConsent>(FULL_CONSENT);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const sending = lines.some((l) => l.state === "sending");
  const canFinish = demo.phase === "input" && lines.some((l) => l.sender === "VICTIM" && l.state === "sent") && !sending;

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [lines]);

  async function start(e: FormEvent) {
    e.preventDefault();
    const ok = await demo.start({ mode: "LIVE_TEXT", language, districtCode: district, consent });
    if (ok) {
      setLines([]);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  async function send(text: string, who: Sender) {
    if (!demo.interactionId || demo.phase !== "input" || !text.trim()) return;
    const key = `${Date.now()}-${lines.length}`;
    setLines((ls) => [...ls, { key, sender: who, text: text.trim(), state: "sending" }]);
    const r = await demoFetch<DemoReceipt>(`/api/demo/interactions/${demo.interactionId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: text.trim(), sender: who }),
    });
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, state: r.ok ? "sent" : "failed" } : l)));
    if (r.ok) demo.receipt(r.data);
    else demo.setError(messageFor(r.code, r.detail));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = draft;
    setDraft("");
    void send(text, "VICTIM");
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (draft.trim() && !sending) submit(e);
    }
  }

  function another() {
    demo.reset();
    setLines([]);
  }

  const shell = (children: React.ReactNode) => (
    <DemoShell title={TITLE} lead={LEAD} phase={demo.phase}>
      {children}
    </DemoShell>
  );

  if (demo.phase === "registered" && demo.docketNumber) return shell(<Registered docketNumber={demo.docketNumber} onAnother={another} />);

  if (demo.phase === "consent") {
    return shell(
      <form onSubmit={start} className="card card-pad flex flex-col gap-5" data-testid="consent-step">
        <div className="grid gap-4 sm:grid-cols-2">
          <LanguageSelect value={language} onChange={setLanguage} />
          <DistrictSelect districts={districts} value={district} onChange={setDistrict} />
        </div>
        <ConsentFields value={consent} onChange={setConsent} />
        {demo.error && <ErrorLine text={demo.error} />}
        <button type="submit" disabled={demo.busy || !district} className="btn btn-primary btn-lg" data-testid="start">
          {demo.busy ? "Starting…" : "Start the chat"}
        </button>
      </form>,
    );
  }

  return shell(
    <div className="flex flex-col gap-4">
      {demo.emergency && <EmergencyPanel panel={demo.emergency} />}
      <section className="card flex flex-col overflow-hidden" aria-label="Chat">
        <ol ref={listRef} className="flex max-h-[26rem] min-h-[16rem] flex-col gap-2.5 overflow-y-auto bg-surface-2/60 p-4" data-testid="chat">
          {lines.length === 0 && <li className="m-auto text-center text-sm text-ink-3">Write as the person would. Nothing you type here is shown back as an assessment.</li>}
          {lines.map((l) => (
            <li key={l.key} className={`flex items-end gap-2 ${l.sender === "VICTIM" ? "flex-row-reverse" : ""}`} data-testid={`line-${l.sender.toLowerCase()}`}>
              <span className={`grid size-7 shrink-0 place-items-center rounded-full ${l.sender === "VICTIM" ? "bg-brand text-white" : "bg-surface text-ink-2 ring-1 ring-line"}`} aria-hidden>
                {l.sender === "VICTIM" ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
              </span>
              <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[0.9375rem] leading-relaxed ${l.sender === "VICTIM" ? "rounded-br-sm bg-brand text-white" : "rounded-bl-sm bg-surface text-ink ring-1 ring-line"}`}>
                <p className="whitespace-pre-wrap">{l.text}</p>
                <p className={`mt-0.5 text-[0.6875rem] ${l.sender === "VICTIM" ? "text-white/70" : "text-ink-3"}`}>
                  {l.state === "sending" ? "Sending…" : l.state === "sent" ? "Received" : "Not received"}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <form onSubmit={submit} className="flex items-end gap-2 border-t border-line p-3">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            rows={2}
            maxLength={2000}
            placeholder="Type as the person… (Enter to send, Shift+Enter for a new line)"
            className="field resize-none"
            aria-label="Message as the person"
            data-testid="draft"
          />
          <button type="submit" disabled={!draft.trim() || sending} className="btn btn-primary min-h-11" aria-label="Send" data-testid="send">
            <Send className="size-4" aria-hidden />
          </button>
        </form>
      </section>

      <div className="grid gap-3">
        <details className="card group">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-ink">Ask one of NHAA&apos;s scripted questions as the chatbot</summary>
          <ul className="flex flex-wrap gap-2 border-t border-line p-3">
            {questions[demo.language].map((q) => (
              <li key={q.key}>
                <button type="button" disabled={sending} onClick={() => void send(q.text, "OPERATOR")} className="btn btn-secondary btn-sm whitespace-normal text-left" data-testid={`q-${q.key}`}>
                  {q.text}
                </button>
              </li>
            ))}
          </ul>
        </details>
      </div>

      {demo.error && <ErrorLine text={demo.error} />}
      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
        <p className="hint">When you are done, register the case to get a docket ID.</p>
        <button type="button" onClick={() => void demo.finish()} disabled={!canFinish} className="btn btn-primary" data-testid="finish">
          {demo.phase === "finishing" ? "Registering…" : "Finish and register"}
        </button>
      </div>
    </div>,
  );
}

export function ErrorLine({ text }: { text: string }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {text}
    </p>
  );
}
