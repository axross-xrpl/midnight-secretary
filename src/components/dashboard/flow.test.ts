import { describe, expect, expectTypeOf, test } from "vitest";
import { tripIdAt } from "@/testing/ids";
import type { TripStatus } from "@/domain/trip";
import type { ScanEvent } from "@/lib/calendar-scan-response";
import type { TripPlanResponse, TripResponse } from "@/lib/secretary-response";
import {
  effectiveTrips,
  eventRowsOf,
  INITIAL_FLOW_STATE,
  isBusy,
  nextStepOf,
  reduceFlow,
  STATUS_ORDER,
  stepIndexOf,
  stepperStateOf,
  tripForEvent,
  visibleEvents,
} from "./flow";
import type { FlowState, RequestFailure, Step } from "./types";

const TRIP_ID = tripIdAt(1);

const OTHER_TRIP_ID = tripIdAt(2);

const NETWORK_FAILURE: RequestFailure = { code: "network" };

const eventOf = (id: string, title: string): ScanEvent => {
  return {
    id,
    title,
    when: {
      kind: "timed",
      start: "2026-09-15T10:00:00+09:00",
      end: "2026-09-15T17:00:00+09:00",
    },
  };
};

const OSAKA = eventOf("seed-2", "大阪出張 (取引先訪問)");

const MEETING = eventOf("seed-1", "チーム定例");

const WRITTEN_EVENT = eventOf("written-1", "大阪 出張");

const demo = (amount: number): { amount: number; currency: "DEMO" } => {
  return { amount, currency: "DEMO" };
};

const RAIL = {
  id: "rail-tokyo-osaka",
  mode: "rail",
  vendor: "デモ鉄道",
  payee: "wallet-rail",
  origin: "東京",
  destination: "新大阪",
  departAt: "2026-09-15T09:00:00+09:00",
  arriveAt: "2026-09-15T11:30:00+09:00",
  price: demo(14720),
} as const;

const PLAN: TripPlanResponse = {
  intent: {
    destination: "大阪",
    departOn: "2026-09-15",
    returnOn: "2026-09-15",
    purpose: "取引先訪問",
  },
  outbound: RAIL,
  inbound: { ...RAIL, id: "rail-osaka-tokyo" },
  total: demo(29440),
  rationale: "日帰りで往復できる",
};

type TripBase = {
  id: string;
  event: ScanEvent;
  plan: TripPlanResponse;
  proposedAt: string;
};

const baseOf = (id: string, event: ScanEvent): TripBase => {
  return { id, event, plan: PLAN, proposedAt: "2026-09-10T00:00:00Z" };
};

const proposedTrip = (id: string, event: ScanEvent): TripResponse => {
  return { status: "proposed", ...baseOf(id, event) };
};

const approvedTrip = (id: string, event: ScanEvent): TripResponse => {
  return {
    status: "approved",
    ...baseOf(id, event),
    approvedAt: "2026-09-10T00:01:00Z",
    authorizations: [],
  };
};

const paidTrip = (id: string, event: ScanEvent): TripResponse => {
  return {
    status: "paid",
    ...baseOf(id, event),
    approvedAt: "2026-09-10T00:01:00Z",
    authorizations: [],
    paidAt: "2026-09-10T00:02:00Z",
  };
};

const writtenTrip = (
  id: string,
  event: ScanEvent,
  writtenEventId: string,
): TripResponse => {
  return {
    status: "written",
    ...baseOf(id, event),
    approvedAt: "2026-09-10T00:01:00Z",
    authorizations: [],
    paidAt: "2026-09-10T00:02:00Z",
    writtenEventId,
    writtenAt: "2026-09-10T00:03:00Z",
  };
};

const PROPOSED = proposedTrip(TRIP_ID, OSAKA);

const APPROVED = approvedTrip(TRIP_ID, OSAKA);

const PAID = paidTrip(TRIP_ID, OSAKA);

const WRITTEN = writtenTrip(TRIP_ID, OSAKA, WRITTEN_EVENT.id);

const selectedState = (eventId: string): FlowState => {
  return { ...INITIAL_FLOW_STATE, selectedEventId: eventId };
};

const busyState = (step: Step, eventId: string): FlowState => {
  return {
    ...INITIAL_FLOW_STATE,
    activity: { kind: "busy", step, eventId },
    selectedEventId: eventId,
  };
};

describe("reduceFlow", () => {
  test("一本道では 1 手ごとに fresh と選択中の予定が進む", () => {
    const proposing = reduceFlow(INITIAL_FLOW_STATE, {
      type: "start",
      step: "propose",
      eventId: OSAKA.id,
    });

    expect(proposing.activity).toStrictEqual({
      kind: "busy",
      step: "propose",
      eventId: OSAKA.id,
    });
    expect(proposing.selectedEventId).toBe(OSAKA.id);
    expect(isBusy(proposing)).toBe(true);

    const proposed = reduceFlow(proposing, { type: "succeed", trip: PROPOSED });

    expect(proposed.activity).toStrictEqual({ kind: "idle" });
    expect(proposed.fresh).toStrictEqual({ [TRIP_ID]: PROPOSED });
    expect(proposed.selectedEventId).toBe(OSAKA.id);
    expect(isBusy(proposed)).toBe(false);

    const approving = reduceFlow(proposed, {
      type: "start",
      step: "approve",
      eventId: OSAKA.id,
    });

    expect(approving.activity).toStrictEqual({
      kind: "busy",
      step: "approve",
      eventId: OSAKA.id,
    });

    const approved = reduceFlow(approving, { type: "succeed", trip: APPROVED });

    expect(approved.fresh).toStrictEqual({ [TRIP_ID]: APPROVED });

    const paying = reduceFlow(approved, {
      type: "start",
      step: "pay",
      eventId: OSAKA.id,
    });
    const paid = reduceFlow(paying, { type: "succeed", trip: PAID });

    expect(paid.fresh).toStrictEqual({ [TRIP_ID]: PAID });

    const writing = reduceFlow(paid, {
      type: "start",
      step: "writeBack",
      eventId: OSAKA.id,
    });
    const written = reduceFlow(writing, { type: "succeed", trip: WRITTEN });

    expect(written.activity).toStrictEqual({ kind: "idle" });
    expect(written.fresh).toStrictEqual({ [TRIP_ID]: WRITTEN });
    expect(written.selectedEventId).toBe(OSAKA.id);
  });

  test("進行中は select / start / ignore で状態が変わらない", () => {
    const busy = busyState("propose", OSAKA.id);

    expect(reduceFlow(busy, { type: "select", eventId: MEETING.id })).toBe(
      busy,
    );
    expect(
      reduceFlow(busy, { type: "start", step: "approve", eventId: MEETING.id }),
    ).toBe(busy);
    expect(reduceFlow(busy, { type: "ignore", eventId: MEETING.id })).toBe(
      busy,
    );
    expect(reduceFlow(busy, { type: "deselect" })).toBe(busy);
  });

  test("進行中でなければ succeed / fail で状態が変わらない", () => {
    expect(
      reduceFlow(INITIAL_FLOW_STATE, { type: "succeed", trip: PROPOSED }),
    ).toBe(INITIAL_FLOW_STATE);
    expect(
      reduceFlow(INITIAL_FLOW_STATE, {
        type: "fail",
        failure: NETWORK_FAILURE,
      }),
    ).toBe(INITIAL_FLOW_STATE);
  });

  test("fail は進行中の 1 手を引き継ぎ、dismiss で消える", () => {
    const failed = reduceFlow(busyState("pay", OSAKA.id), {
      type: "fail",
      failure: NETWORK_FAILURE,
    });

    expect(failed.activity).toStrictEqual({
      kind: "failed",
      step: "pay",
      eventId: OSAKA.id,
      failure: NETWORK_FAILURE,
    });

    expect(reduceFlow(failed, { type: "dismiss" }).activity).toStrictEqual({
      kind: "idle",
    });
  });

  test("select は直前の失敗も消す", () => {
    const failed = reduceFlow(busyState("pay", OSAKA.id), {
      type: "fail",
      failure: NETWORK_FAILURE,
    });

    const selected = reduceFlow(failed, {
      type: "select",
      eventId: MEETING.id,
    });

    expect(selected.activity).toStrictEqual({ kind: "idle" });
    expect(selected.selectedEventId).toBe(MEETING.id);
  });

  test("ignore は選択中の予定を外し、同じ id を重ねない", () => {
    const ignored = reduceFlow(selectedState(OSAKA.id), {
      type: "ignore",
      eventId: OSAKA.id,
    });

    expect(ignored.ignored).toStrictEqual([OSAKA.id]);
    expect(ignored.selectedEventId).toBeUndefined();

    const twice = reduceFlow(ignored, { type: "ignore", eventId: OSAKA.id });

    expect(twice.ignored).toStrictEqual([OSAKA.id]);
  });

  test("restoreIgnored で無視した予定が空になる", () => {
    const ignored = reduceFlow(INITIAL_FLOW_STATE, {
      type: "ignore",
      eventId: MEETING.id,
    });

    expect(
      reduceFlow(ignored, { type: "restoreIgnored" }).ignored,
    ).toStrictEqual([]);
  });

  test("deselect は選択を外す", () => {
    const deselected = reduceFlow(selectedState(OSAKA.id), {
      type: "deselect",
    });

    expect(deselected.selectedEventId).toBeUndefined();
  });
});

describe("effectiveTrips", () => {
  test("応答の方が進んでいれば応答を採る", () => {
    expect(effectiveTrips([PROPOSED], { [TRIP_ID]: APPROVED })).toStrictEqual([
      APPROVED,
    ]);
  });

  test("props の方が進んでいれば props を採る", () => {
    expect(effectiveTrips([PAID], { [TRIP_ID]: APPROVED })).toStrictEqual([
      PAID,
    ]);
  });

  test("同じ status なら応答の方を採る (計画が違う)", () => {
    const reproposed: TripResponse = {
      status: "proposed",
      ...baseOf(TRIP_ID, OSAKA),
      plan: { ...PLAN, rationale: "作り直した計画" },
    };

    expect(effectiveTrips([PROPOSED], { [TRIP_ID]: reproposed })).toStrictEqual(
      [reproposed],
    );
  });

  test("props に無い id の応答は末尾に足す", () => {
    const added = proposedTrip(OTHER_TRIP_ID, MEETING);

    expect(
      effectiveTrips([PROPOSED], { [OTHER_TRIP_ID]: added }),
    ).toStrictEqual([PROPOSED, added]);
  });
});

describe("tripForEvent", () => {
  test("予定の id で trip を引く", () => {
    expect(tripForEvent(OSAKA.id, [PROPOSED])).toBe(PROPOSED);
    expect(tripForEvent(MEETING.id, [PROPOSED])).toBeUndefined();
  });
});

describe("visibleEvents", () => {
  test("無視した予定と秘書が書き戻した予定を除く", () => {
    const visible = visibleEvents(
      [MEETING, OSAKA, WRITTEN_EVENT],
      [WRITTEN],
      [MEETING.id],
    );

    expect(visible.map((event) => event.id)).toStrictEqual([OSAKA.id]);
  });
});

describe("eventRowsOf", () => {
  test("trip の有無で行の状態が決まる", () => {
    expect(eventRowsOf([MEETING, OSAKA], [APPROVED])).toStrictEqual([
      { event: MEETING, state: { kind: "unarranged" } },
      { event: OSAKA, state: { kind: "arranged", status: "approved" } },
    ]);
  });
});

describe("stepperStateOf", () => {
  test("何も選んでいなければ idle", () => {
    expect(stepperStateOf(INITIAL_FLOW_STATE, [OSAKA], [])).toStrictEqual({
      kind: "idle",
    });
  });

  test("選んだ予定に trip が無ければ unarranged", () => {
    expect(stepperStateOf(selectedState(OSAKA.id), [OSAKA], [])).toStrictEqual({
      kind: "unarranged",
      event: OSAKA,
    });
  });

  test("選んだ予定に trip があれば arranged", () => {
    expect(
      stepperStateOf(selectedState(OSAKA.id), [OSAKA], [PROPOSED]),
    ).toStrictEqual({ kind: "arranged", event: OSAKA, trip: PROPOSED });
  });

  test("進行中で trip があれば busy に trip が付く", () => {
    expect(
      stepperStateOf(busyState("approve", OSAKA.id), [OSAKA], [PROPOSED]),
    ).toStrictEqual({
      kind: "busy",
      step: "approve",
      event: OSAKA,
      trip: PROPOSED,
    });
  });

  test("最初の提案では busy に trip が付かない", () => {
    expect(
      stepperStateOf(busyState("propose", OSAKA.id), [OSAKA], []),
    ).toStrictEqual({ kind: "busy", step: "propose", event: OSAKA });
  });

  test("失敗した 1 手は failed になる", () => {
    const failed = reduceFlow(busyState("propose", OSAKA.id), {
      type: "fail",
      failure: NETWORK_FAILURE,
    });

    expect(stepperStateOf(failed, [OSAKA], [])).toStrictEqual({
      kind: "failed",
      step: "propose",
      event: OSAKA,
      failure: NETWORK_FAILURE,
    });
  });
});

describe("stepIndexOf", () => {
  test("休止状態は status の添字、進行中は 1 手の添字になる", () => {
    expect(stepIndexOf({ kind: "idle" })).toBe(-1);
    expect(stepIndexOf({ kind: "unarranged", event: OSAKA })).toBe(-1);
    expect(
      stepIndexOf({ kind: "arranged", event: OSAKA, trip: PROPOSED }),
    ).toBe(0);
    expect(stepIndexOf({ kind: "busy", step: "pay", event: OSAKA })).toBe(2);
    expect(stepIndexOf({ kind: "arranged", event: OSAKA, trip: WRITTEN })).toBe(
      3,
    );
  });
});

describe("nextStepOf", () => {
  test("状態ごとに次の 1 手が決まり、written で終わる", () => {
    expect(nextStepOf("proposed")).toBe("approve");
    expect(nextStepOf("approved")).toBe("pay");
    expect(nextStepOf("paid")).toBe("writeBack");
    expect(nextStepOf("written")).toBeUndefined();
  });
});

describe("STATUS_ORDER", () => {
  test("domain の TripStatus を進む順に並べている", () => {
    expect(STATUS_ORDER).toStrictEqual([
      "proposed",
      "approved",
      "paid",
      "written",
    ]);
    expectTypeOf<(typeof STATUS_ORDER)[number]>().toEqualTypeOf<TripStatus>();
  });
});
