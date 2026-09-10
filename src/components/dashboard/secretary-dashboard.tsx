"use client";

import { useLocale } from "next-intl";
import type { ReactElement } from "react";
import { useReducer, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import type { ScanEvent } from "@/lib/calendar-scan-response";
import type { Result } from "@/lib/result";
import type { MandateResponse, TripResponse } from "@/lib/secretary-response";
import { EventList } from "./event-list";
import {
  effectiveTrips,
  eventRowsOf,
  INITIAL_FLOW_STATE,
  isBusy,
  reduceFlow,
  stepperStateOf,
  visibleEvents,
} from "./flow";
import { LedgerPanel } from "./ledger-panel";
import { MandateCard } from "./mandate-card";
import { MandateForm } from "./mandate-form";
import {
  requestApproveTrip,
  requestPayForTrip,
  requestProposeTrip,
  requestWriteBackTrip,
} from "./request-secretary";
import { TripStepper } from "./trip-stepper";
import type { PublicLedgerView, RequestFailure, Step } from "./types";

type Props = {
  now: string;
  mandate?: MandateResponse;
  events: readonly ScanEvent[];
  trips: readonly TripResponse[];
  publicLedger: PublicLedgerView;
};

// 1 手を進める fetch (成功すれば次の状態の trip が返る)
type StepRequest = () => Promise<Result<TripResponse, RequestFailure>>;

/**
 * Wave 1 のダッシュボード
 *
 * 休止状態は props から導き、進行中の 1 手と直近の応答だけを手元に持つ
 * 変更が成功するたびに `router.refresh()` で props を追いつかせる
 */
export const SecretaryDashboard = (props: Props): ReactElement => {
  const router = useRouter();
  const locale = useLocale();
  const [state, dispatch] = useReducer(reduceFlow, INITIAL_FLOW_STATE);
  const [createdMandate, setCreatedMandate] = useState<
    MandateResponse | undefined
  >(undefined);
  // 作った直後は応答の値、refresh 後は props が勝つ (作成は 1 回きりなので古い方が勝ち続けない)
  const mandate = props.mandate ?? createdMandate;
  const trips = effectiveTrips(props.trips, state.fresh);
  const events = visibleEvents(props.events, trips, state.ignored);
  const rows = eventRowsOf(events, trips);
  const stepper = stepperStateOf(state, events, trips);
  const busy = isBusy(state);

  // dispatch と router を閉じ込めるのでコンポーネントの中で定義する
  const runStep = async (
    step: Step,
    eventId: string,
    request: StepRequest,
  ): Promise<void> => {
    dispatch({ type: "start", step, eventId });
    const result = await request();

    if (!result.ok) {
      dispatch({ type: "fail", failure: result.error });
      return;
    }

    dispatch({ type: "succeed", trip: result.value });
    router.refresh();
  };

  const propose = async (eventId: string): Promise<void> => {
    return runStep("propose", eventId, () =>
      requestProposeTrip(fetch, { eventId, locale }),
    );
  };

  const approve = async (trip: TripResponse): Promise<void> => {
    return runStep("approve", trip.event.id, () =>
      requestApproveTrip(fetch, trip.id),
    );
  };

  const pay = async (trip: TripResponse): Promise<void> => {
    return runStep("pay", trip.event.id, () =>
      requestPayForTrip(fetch, trip.id),
    );
  };

  const writeBack = async (trip: TripResponse): Promise<void> => {
    return runStep("writeBack", trip.event.id, () =>
      requestWriteBackTrip(fetch, trip.id, { locale }),
    );
  };

  const onMandateCreated = (created: MandateResponse): void => {
    setCreatedMandate(created);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid items-start gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,20rem),1fr))]">
        {mandate === undefined ? (
          <MandateForm now={props.now} onCreated={onMandateCreated} />
        ) : (
          <MandateCard mandate={mandate} />
        )}
        <EventList
          rows={rows}
          ignoredCount={state.ignored.length}
          busy={busy}
          canPropose={mandate !== undefined}
          onPropose={propose}
          onSelect={(eventId) => dispatch({ type: "select", eventId })}
          onIgnore={(eventId) => dispatch({ type: "ignore", eventId })}
          onRestore={() => dispatch({ type: "restoreIgnored" })}
        />
      </div>
      <TripStepper
        state={stepper}
        onApprove={approve}
        onRepropose={propose}
        onPay={pay}
        onWriteBack={writeBack}
        onDismiss={() => dispatch({ type: "dismiss" })}
        onDeselect={() => dispatch({ type: "deselect" })}
      />
      <LedgerPanel publicLedger={props.publicLedger} mandate={mandate} />
    </div>
  );
};
