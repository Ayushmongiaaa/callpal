import React from "react";
import { ArrowClockwise, CloudSlash, SpinnerGap } from "@phosphor-icons/react";
import { IS_HOSTED } from "../services/api";

/**
 * Shown only while the API is unreachable or still waking.
 *
 * The wording depends on where the app is running, because the two situations
 * are not the same problem. On this machine, an unreachable API means it was
 * never started, and the fix is a command. On the deployed site, it almost
 * always means the free instance has gone to sleep after inactivity and is
 * spinning back up — telling a visitor to run `./dev.sh` would be meaningless
 * and would make a working site look broken.
 */

export default function BackendBanner({ online, waking, checking, onRetry }) {
  // Waking takes precedence: the API has not answered yet, but nothing is
  // wrong, so this must not be dressed as an error.
  if (waking && online) {
    return (
      <div className="backend-banner waking" role="status">
        <SpinnerGap size={17} weight="bold" className="spin-icon" />

        <div className="backend-copy">
          <strong>Waking the server up.</strong>
          <span>
            The free host sleeps after inactivity. First load takes up to a
            minute — after that it is quick.
          </span>
        </div>
      </div>
    );
  }

  if (online) return null;

  return (
    <div className="backend-banner" role="status">
      <CloudSlash size={17} weight="duotone" />

      <div className="backend-copy">
        <strong>The CallPal API is not responding.</strong>
        <span>
          {IS_HOSTED ? (
            <>
              The free host may still be waking from sleep. Give it a moment and
              retry — this clears on its own once it answers.
            </>
          ) : (
            <>
              Start it with <code>./dev.sh</code> in the project folder. This
              will clear on its own once it is up.
            </>
          )}
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
