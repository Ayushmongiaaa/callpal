import React from "react";
import { ArrowClockwise, CloudSlash, SpinnerGap } from "@phosphor-icons/react";

/**
 * Shown only while the API is unreachable.
 *
 * It says the one command that fixes it and offers a retry, rather than
 * leaving a dead error in the upload card with no way forward. It clears
 * itself as soon as the API answers — no page reload needed.
 */

export default function BackendBanner({ online, checking, onRetry }) {
  if (online) return null;

  return (
    <div className="backend-banner" role="status">
      <CloudSlash size={17} weight="duotone" />

      <div className="backend-copy">
        <strong>The CallPal API is not responding.</strong>
        <span>
          Start it with <code>./dev.sh</code> in the project folder. This will
          clear on its own once it is up.
        </span>
      </div>

      <button onClick={onRetry} disabled={checking} type="button">
        {checking ? (
          <SpinnerGap size={13} weight="bold" className="spin-icon" />
        ) : (
          <ArrowClockwise size={13} weight="bold" />
        )}
        {checking ? "Checking" : "Retry"}
      </button>
    </div>
  );
}
