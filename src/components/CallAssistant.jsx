import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, ChatTeardropText, Quotes } from "@phosphor-icons/react";
import { suggestedQuestions } from "../data/mockData";
import TypedText from "./TypedText";

export default function CallAssistant({
  call,
  messages = [],
  asking = false,
  onAsk = () => {},
}) {
  const [draft, setDraft] = useState("");
  const thread = useRef(null);

  // Only the newest answer types itself out. Older ones re-render instantly,
  // otherwise the whole thread would replay every time a message is added.
  const lastIndex = messages.length - 1;

  const scrollDown = useCallback(() => {
    const node = thread.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, []);

  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: "smooth" });
  }, [messages, asking]);

  function send() {
    if (!draft.trim() || asking) return;
    onAsk(draft);
    setDraft("");
  }

  const empty = messages.length === 0;

  return (
    <section className="assistant glass">
      <div className="assistant-head">
        <strong>
          <ChatTeardropText size={16} weight="duotone" color="#c4b5fd" />
          Ask CallPal
        </strong>
        <span className="online">
          <i />
          Online
        </span>
      </div>

      <div className="assistant-body" ref={thread}>
        {empty && (
          <>
            <div className="bubble">
              <strong>Hi Ayush! I&apos;m CallPal.</strong>
              <p>
                {call.isDemo
                  ? "This is a demo call. Upload a transcript and I'll answer questions from it, quoting the speakers."
                  : `Ask me anything about the ${call.ticker || call.company} call.`}
              </p>
            </div>

            {suggestedQuestions.map((q) => (
              <button
                className="suggest"
                key={q}
                onClick={() => onAsk(q)}
                type="button"
                disabled={asking}
              >
                {q}
              </button>
            ))}
          </>
        )}

        {messages.map((m, i) => (
          <div
            className={`msg ${m.role === "user" ? "msg-user" : "msg-bot"} ${
              m.isError ? "msg-error" : ""
            }`}
            key={i}
          >
            <p>
              {m.role === "callpal" && !m.isError ? (
                <TypedText
                  text={m.text}
                  enabled={i === lastIndex}
                  onTick={scrollDown}
                />
              ) : (
                m.text
              )}
            </p>

            {m.role === "callpal" && m.grounded === false && !m.isError && (
              <span className="msg-flag">Not found in this transcript</span>
            )}

            {m.citations?.length > 0 && (
              <details className="msg-cites">
                <summary>
                  <Quotes size={11} weight="fill" />
                  {m.citations.length} source
                  {m.citations.length > 1 ? "s" : ""} from the transcript
                </summary>
                {m.citations.map((c) => (
                  <blockquote key={c.index}>{c.excerpt}…</blockquote>
                ))}
              </details>
            )}
          </div>
        ))}

        {asking && (
          <div className="msg msg-bot msg-thinking">
            <span className="think-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="think-label">Reading the transcript</span>
          </div>
        )}
      </div>

      <div className="ask-row">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && send()}
          placeholder={
            call.isDemo ? "Upload a call to ask questions…" : "Ask a follow-up question…"
          }
          disabled={asking}
        />
        <button
          className="send-btn"
          type="button"
          aria-label="Send"
          onClick={send}
          disabled={asking || !draft.trim()}
        >
          <ArrowUp size={16} weight="bold" />
        </button>
      </div>

      <p className="disclaimer">
        CallPal can make mistakes. Verify important information.
      </p>
    </section>
  );
}
