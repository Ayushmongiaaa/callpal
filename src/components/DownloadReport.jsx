import React, { useState } from "react";
import { Check, DownloadSimple, Warning } from "@phosphor-icons/react";
import Working from "./Working";
import { downloadPdf } from "../utils/pdf";

/**
 * One button, used in both places the report can be downloaded.
 *
 * It has real states because generating the PDF is genuinely asynchronous —
 * jsPDF is fetched on demand, and a long call takes a moment to lay out. A
 * button that looks identical while that happens invites a second click and a
 * second file.
 */

export default function DownloadReport({ call, prices, className = "" }) {
  const [state, setState] = useState("idle");

  async function run(e) {
    e.stopPropagation();
    if (state === "working") return;

    setState("working");

    try {
      await downloadPdf(call, prices);
      setState("done");
      setTimeout(() => setState("idle"), 2400);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 3200);
    }
  }

  return (
    <button className={className} onClick={run} type="button" disabled={state === "working"}>
      {state === "working" && <Working size={13} />}
      {state === "done" && <Check size={13} weight="bold" />}
      {state === "error" && <Warning size={13} weight="fill" />}
      {state === "idle" && <DownloadSimple size={13} weight="bold" />}

      {state === "working"
        ? "Building PDF…"
        : state === "done"
          ? "Saved"
          : state === "error"
            ? "Could not build it"
            : "Download report"}
    </button>
  );
}
