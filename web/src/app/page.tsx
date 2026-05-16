import Link from "next/link";

import { getCurrentUser } from "@/lib/api";
import { logout } from "./auth/actions";

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <main className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md w-full space-y-8 text-center">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">실시간 어르신 안전 모니터링</h1>
          <p className="text-sm opacity-70">
            홈캠 영상으로 전조증상을 감지하고 보호자에게 알립니다.
          </p>
        </header>

        {user ? (
          <div className="space-y-3">
            <p className="text-sm">
              로그인됨:{" "}
              <span className="font-mono">
                {user.display_name ?? user.username}
              </span>{" "}
              <span className="opacity-60">({user.role})</span>
            </p>
            <Link
              href={user.role === "elder" ? "/elder" : "/caregiver"}
              className="block rounded bg-blue-600 text-white py-3 hover:bg-blue-700 transition"
            >
              {user.role === "elder" ? "노인 대시보드" : "보호자 대시보드"}
            </Link>
            <form action={logout}>
              <button className="w-full rounded border py-2 text-sm opacity-70 hover:opacity-100">
                로그아웃
              </button>
            </form>
          </div>
        ) : (
          <div className="space-y-3">
            <Link
              href="/login"
              className="block rounded bg-blue-600 text-white py-3 hover:bg-blue-700 transition"
            >
              로그인
            </Link>
            <Link
              href="/signup"
              className="block rounded border py-3 hover:bg-black/5 transition"
            >
              회원가입
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
