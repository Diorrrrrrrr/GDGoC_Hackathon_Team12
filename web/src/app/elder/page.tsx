import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/api";

export default async function ElderDashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "elder") redirect("/caregiver");

  return (
    <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
      <Link href="/" className="text-sm opacity-60 hover:opacity-100">
        ← 홈
      </Link>
      <h1 className="text-2xl font-bold mt-2 mb-1">노인 대시보드</h1>
      <p className="text-sm opacity-70 mb-8">
        {user.display_name ?? user.username}
      </p>

      <Link
        href="/elder/pair"
        className="block rounded bg-blue-600 text-white py-3 text-center hover:bg-blue-700 transition"
      >
        보호자 연동 (QR 생성)
      </Link>

      <p className="mt-8 text-sm opacity-60">
        실시간 자세 상태 표시는 다음 단계에서 추가됩니다.
      </p>
    </main>
  );
}
