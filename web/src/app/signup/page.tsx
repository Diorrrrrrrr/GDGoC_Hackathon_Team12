import Link from "next/link";

import { signup } from "@/app/auth/actions";
import { USERNAME_PATTERN } from "@/lib/username";

type SignupPageProps = {
  searchParams: Promise<{ error?: string }>;
};

const ERROR_MESSAGES: Record<string, string> = {
  "invalid-username": "아이디는 영문/숫자/_만, 3~20자입니다.",
  "invalid-role": "역할을 선택해주세요.",
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const { error } = await searchParams;
  const errorMsg = error ? ERROR_MESSAGES[error] ?? error : null;

  return (
    <main className="flex-1 flex items-center justify-center p-8">
      <form action={signup} className="max-w-sm w-full space-y-4">
        <h1 className="text-2xl font-bold">회원가입</h1>

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
          placeholder="아이디 (영문/숫자/_, 3~20자)"
          autoComplete="username"
          className="w-full border rounded px-3 py-2"
        />
        <input
          name="password"
          type="password"
          required
          minLength={6}
          placeholder="비밀번호 (최소 6자)"
          autoComplete="new-password"
          className="w-full border rounded px-3 py-2"
        />
        <input
          name="display_name"
          type="text"
          placeholder="표시 이름 (선택, 비우면 아이디 사용)"
          className="w-full border rounded px-3 py-2"
        />

        <fieldset className="space-y-2 rounded border p-3">
          <legend className="text-sm font-medium px-1">역할</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="role" value="elder" defaultChecked />
            <span>노인 (홈캠 모니터링 대상)</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="role" value="caregiver" />
            <span>보호자</span>
          </label>
        </fieldset>

        <button className="w-full bg-emerald-600 text-white py-2 rounded hover:bg-emerald-700 transition">
          회원가입
        </button>
        <p className="text-sm text-center opacity-70">
          이미 계정이 있어요?{" "}
          <Link href="/login" className="underline">
            로그인
          </Link>
        </p>
      </form>
    </main>
  );
}
