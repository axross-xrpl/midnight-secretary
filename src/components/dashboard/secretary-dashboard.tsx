"use client";

import type { Dispatch, ReactElement } from "react";
import { useEffect, useMemo, useReducer, useState } from "react";
import { EventList } from "./event-list";
import {
  appendAuthorization,
  applyPayment,
  checkPayment,
  isBusy,
  reduceFlow,
  sampleAuthorization,
} from "./flow";
import { LedgerPanel } from "./ledger-panel";
import { MandateCard } from "./mandate-card";
import {
  sampleEvents,
  sampleLedger,
  sampleMandate,
  samplePlanFor,
} from "./sample";
import { TripStepper } from "./trip-stepper";
import type {
  FlowAction,
  FlowState,
  MandateView,
  PublicLedgerView,
} from "./types";

type Props = {
  now: string;
};

/**
 * Simulated latencies for the steps that will later talk to the planner, the
 * proof server, and Google Calendar.
 */
export const SIMULATED_DELAYS_MS = {
  proposal: 900,
  proof: 2500,
  calendarWrite: 1000,
} as const;

type SimulationDeps = {
  now: string;
  mandate: MandateView;
  dispatch: Dispatch<FlowAction>;
  setMandate: Dispatch<MandateView>;
  setLedger: Dispatch<(ledger: PublicLedgerView) => PublicLedgerView>;
};

type Cleanup = () => void;

const scheduleProposal = (
  state: Extract<FlowState, { step: "proposing" }>,
  deps: SimulationDeps,
): Cleanup => {
  const plan = samplePlanFor(state.event);
  const timer = setTimeout(() => {
    deps.dispatch(
      plan === undefined ? { type: "reset" } : { type: "planReady", plan },
    );
  }, SIMULATED_DELAYS_MS.proposal);

  return () => clearTimeout(timer);
};

const settlePayment = (
  state: Extract<FlowState, { step: "proving" }>,
  deps: SimulationDeps,
): void => {
  const error = checkPayment(deps.mandate, state.plan.total, deps.now);

  if (error !== undefined) {
    deps.dispatch({ type: "failed", error });
    return;
  }

  const authorization = sampleAuthorization(
    state.plan,
    deps.mandate.id,
    deps.now,
  );
  deps.setMandate(applyPayment(deps.mandate, authorization.amount));
  deps.setLedger((ledger) =>
    appendAuthorization(ledger, authorization.publicHash),
  );
  deps.dispatch({ type: "authorized", authorization });
};

const scheduleProof = (
  state: Extract<FlowState, { step: "proving" }>,
  deps: SimulationDeps,
): Cleanup => {
  const timer = setTimeout(
    () => settlePayment(state, deps),
    SIMULATED_DELAYS_MS.proof,
  );

  return () => clearTimeout(timer);
};

const scheduleCalendarWrite = (
  state: Extract<FlowState, { step: "writing" }>,
  deps: SimulationDeps,
): Cleanup => {
  const timer = setTimeout(() => {
    deps.dispatch({
      type: "written",
      calendarEventId: `gcal-${state.plan.id}`,
    });
  }, SIMULATED_DELAYS_MS.calendarWrite);

  return () => clearTimeout(timer);
};

/**
 * Runs the simulated background step for the current state, if any, and
 * returns its cleanup.
 */
const runSimulation = (
  state: FlowState,
  deps: SimulationDeps,
): Cleanup | undefined => {
  if (state.step === "proposing") {
    return scheduleProposal(state, deps);
  }

  if (state.step === "proving") {
    return scheduleProof(state, deps);
  }

  if (state.step === "writing") {
    return scheduleCalendarWrite(state, deps);
  }

  return undefined;
};

/**
 * The Wave 1 dashboard: mandate, upcoming events, the one-path trip flow, and
 * the dual-ledger view. All data is sample data until the domain ports land.
 */
export const SecretaryDashboard = ({ now }: Props): ReactElement => {
  const [state, dispatch] = useReducer(reduceFlow, { step: "idle" });
  const [mandate, setMandate] = useState(() => sampleMandate(now));
  const [ledger, setLedger] = useState(() => sampleLedger(sampleMandate(now)));
  const events = useMemo(() => sampleEvents(now), [now]);

  useEffect(() => {
    return runSimulation(state, {
      now,
      mandate,
      dispatch,
      setMandate,
      setLedger,
    });
  }, [state, now, mandate]);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(100%,20rem),1fr))]">
        <MandateCard mandate={mandate} />
        <EventList
          events={events}
          busy={isBusy(state)}
          onPropose={(event) => dispatch({ type: "propose", event })}
        />
      </div>
      <TripStepper
        state={state}
        onApprove={() => dispatch({ type: "approve" })}
        onPay={() => dispatch({ type: "pay" })}
        onWriteBack={() => dispatch({ type: "writeBack" })}
        onReset={() => dispatch({ type: "reset" })}
      />
      <LedgerPanel ledger={ledger} mandate={mandate} />
    </div>
  );
};
