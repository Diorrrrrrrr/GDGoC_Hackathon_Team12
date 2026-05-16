import Link from "next/link";
import { redirect } from "next/navigation";

import { apiFetch, getCurrentUser } from "@/lib/api";

type EventItem = {
  id: number;
  elder_id: string;
  ts: string;
  alert_type: string;
  overall_severity: "low" | "medium" | "high";
  risk_score: number;
  features: Record<string, unknown>;
};

const severityColor: Record<EventItem["overall_severity"], string> = {
  low: "border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900",
  medium: "border-amber-400/60 bg-amber-50 dark:bg-amber-500/10",
  high: "border-red-500/60 bg-red-50 dark:bg-red-500/10",
};

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ElderEventsPage({ params }: PageProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let events: EventItem[] = [];
  let listError: string | null = null;
  try {
    const res = await apiFetch(`/events?elder_id=${encodeURIComponent(id)}`);
    if (res.ok) {
      events = (await res.json()) as EventItem[];
    } else {
      const text = await res.text().catch(() => "");
      listError = `${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`;
    }
  } catch (e) {
    listError = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <Link
        href="/caregiver"
        className="text-sm opacity-60 hover:opacity-100"
      >
        ← 보호자 대시보드
      </Link>
      <h1 className="text-2xl font-bold mt-2 mb-1">노인 이벤트</h1>
      <p className="text-xs opacity-60 font-mono mb-8">{id}</p>

      <form>
        <button className="mb-6 text-sm rounded border px-3 py-1 hover:bg-black/5">
          새로고침
        </button>
      </form>

      {listError ? (
        <p className="text-sm rounded border border-red-500/40 bg-red-500/10 px-3 py-2">
          {listError}
        </p>
      ) : events.length === 0 ? (
        <p className="text-sm opacity-60">아직 기록된 이벤트가 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => (
            <li
              key={e.id}
              className={`rounded border p-3 ${severityColor[e.overall_severity]}`}
            >
              <div className="flex justify-between items-baseline">
                <p className="font-semibold">
                  {e.alert_type}{" "}
                  <span className="text-xs uppercase opacity-70">
                    [{e.overall_severity}]
                  </span>
                </p>
                <p className="text-xs opacity-60">
                  {new Date(e.ts).toLocaleString("ko-KR")}
                </p>
              </div>
              <p className="text-xs opacity-70 mt-1">
                risk_score: {e.risk_score.toFixed(2)}
              </p>
              {Object.keys(e.features).length > 0 ? (
                <ul className="text-xs opacity-80 mt-2 flex flex-wrap gap-2">
                  {Object.entries(e.features)
                    .filter(([, v]) => v === true)
                    .map(([k]) => (
                      <li
                        key={k}
                        className="rounded-full bg-black/10 dark:bg-white/10 px-2 py-0.5"
                      >
                        {k}
                      </li>
                    ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
