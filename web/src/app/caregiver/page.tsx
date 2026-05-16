import Link from "next/link";
import { redirect } from "next/navigation";

import { apiFetch, getCurrentUser } from "@/lib/api";

type PairingItem = {
  elder_id: string;
  elder_display_name: string | null;
  paired_at: string;
};

export default async function CaregiverDashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "caregiver") redirect("/elder");

  let pairings: PairingItem[] = [];
  let listError: string | null = null;
  try {
    const res = await apiFetch("/pairings");
    if (res.ok) {
      pairings = (await res.json()) as PairingItem[];
    } else {
      listError = `${res.status} ${res.statusText}`;
    }
  } catch (e) {
    listError = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <Link href="/" className="text-sm opacity-60 hover:opacity-100">
        ← 홈
      </Link>
      <h1 className="text-2xl font-bold mt-2 mb-1">보호자 대시보드</h1>
      <p className="text-sm opacity-70 mb-8">
        {user.display_name ?? user.username}
      </p>

      <Link
        href="/caregiver/scan"
        className="block rounded bg-emerald-600 text-white py-3 text-center hover:bg-emerald-700 transition mb-8"
      >
        QR 스캔으로 노인 추가
      </Link>

      <section>
        <h2 className="text-lg font-semibold mb-3">연동된 노인</h2>
        {listError ? (
          <p className="text-sm rounded border border-red-500/40 bg-red-500/10 px-3 py-2">
            목록을 불러오지 못했습니다: {listError}
          </p>
        ) : pairings.length === 0 ? (
          <p className="text-sm opacity-60">아직 연동된 노인이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {pairings.map((p) => (
              <li key={p.elder_id}>
                <Link
                  href={`/caregiver/elder/${p.elder_id}`}
                  className="rounded border p-3 flex justify-between items-center hover:bg-black/5 transition"
                >
                  <div>
                    <p className="font-medium">
                      {p.elder_display_name ?? p.elder_id.slice(0, 8)}
                    </p>
                    <p className="text-xs opacity-60 font-mono">{p.elder_id}</p>
                  </div>
                  <p className="text-xs opacity-60">
                    {new Date(p.paired_at).toLocaleString("ko-KR")}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
