import Link from "next/link";

import { login } from "@/app/auth/actions";
import { USERNAME_PATTERN } from "@/lib/username";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

const ERROR_MESSAGES: Record<string, string> = {
  "invalid-username": "아이디는 영문/숫자/_만, 3~20자입니다.",
  "confirm-email-disabled-required":
    "Supabase의 'Confirm email' 옵션을 꺼주세요 (회원가입 후 자동 로그인되도록).",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error, notice } = await searchParams;
  const errorMsg = error ? ERROR_MESSAGES[error] ?? error : null;

  return (
    <main className="flex-1 flex items-center justify-center p-8">
      <form action={login} className="max-w-sm w-full space-y-4">
        <h1 className="text-2xl font-bold">로그인</h1>

        {notice ? (
          <p className="text-sm rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2">
            {notice}
          </p>
        ) : null}
        {errorMsg ? (
          <p className="text-sm rounded border border-red-500/40 bg-red-500/10 px-3 py-2">
            {errorMsg}
          </p>
        ) : null}

        <input
          name="username"
          type="text"
          required
          pattern={USERNAME_PATTERN}
          placeholder="아이디"
          autoComplete="username"
          className="w-full border rounded px-3 py-2"
        />
        <input
          name="password"
          type="password"
          required
          placeholder="비밀번호"
          autoComplete="current-password"
          className="w-full border rounded px-3 py-2"
        />
        <button className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition">
          로그인
        </button>
        <p className="text-sm text-center opacity-70">
          계정이 없으신가요?{" "}
          <Link href="/signup" className="underline">
            회원가입
          </Link>
        </p>
      </form>
    </main>
  );
}
