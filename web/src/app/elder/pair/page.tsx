"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

import { apiFetch } from "@/lib/api-client";

type TokenResponse = { token: string; expires_at: string };
type StatusResponse = {
  status: "pending" | "expired" | "used";
  caregiver_id?: string | null;
  caregiver_display_name?: string | null;
  paired_at?: string | null;
};

export default function ElderPairPage() {
  const [token, setToken] = useState<TokenResponse | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function startPairing() {
    setError(null);
    setBusy(true);
    try {
      const data: TokenResponse = await apiFetch("/pair/initiate", {
        method: "POST",
      });
      setToken(data);
      setStatus({ status: "pending" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!token || status?.status !== "pending") return;
    let stopped = false;

    const poll = async () => {
      try {
        const data: StatusResponse = await apiFetch(
          `/pair/status?token=${encodeURIComponent(token.token)}`,
        );
        if (stopped) return;
        setStatus(data);
      } catch (e) {
        if (!stopped) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    };

    const id = setInterval(poll, 2000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [token, status?.status]);

  const expiresIn = token
    ? Math.max(
        0,
        Math.round(
          (new Date(token.expires_at).getTime() - Date.now()) / 1000,
        ),
      )
    : 0;

  return (
    <main className="flex-1 p-8 max-w-md mx-auto w-full">
      <Link href="/elder" className="text-sm opacity-60 hover:opacity-100">
        ← 대시보드
      </Link>
      <h1 className="text-2xl font-bold mt-2 mb-6">보호자 연동</h1>

      {!token ? (
        <button
          onClick={startPairing}
          disabled={busy}
          className="w-full bg-blue-600 text-white py-3 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "QR 코드 생성 중..." : "QR 코드 생성"}
        </button>
      ) : (
        <div className="space-y-4">
          {status?.status === "pending" ? (
            <>
              <div className="bg-white p-4 rounded border flex justify-center">
                <QRCodeSVG value={token.token} size={240} level="M" />
              </div>
              <p className="text-center text-sm opacity-70">
                보호자가 이 QR을 스캔하면 자동으로 연동됩니다.
              </p>
              <p className="text-center text-xs opacity-50">
                만료까지 약 {expiresIn}초
              </p>
            </>
          ) : null}

          {status?.status === "used" ? (
            <div className="rounded border border-emerald-500/40 bg-emerald-500/10 p-4 text-center space-y-2">
              <p className="font-bold text-lg">✓ 연동 완료</p>
              <p className="text-sm">
                보호자:{" "}
                <span className="font-mono">
                  {status.caregiver_display_name ?? status.caregiver_id}
                </span>
              </p>
              <Link
                href="/elder"
                className="inline-block mt-2 px-4 py-2 rounded bg-emerald-600 text-white"
              >
                대시보드로
              </Link>
            </div>
          ) : null}

          {status?.status === "expired" ? (
            <div className="rounded border border-amber-500/40 bg-amber-500/10 p-4 text-center space-y-2">
              <p>QR 코드가 만료되었습니다.</p>
              <button
                onClick={() => {
                  setToken(null);
                  setStatus(null);
                  void startPairing();
                }}
                className="px-4 py-2 rounded bg-blue-600 text-white"
              >
                새 코드 생성
              </button>
            </div>
          ) : null}
        </div>
      )}

      {error ? (
        <p className="mt-4 text-sm rounded border border-red-500/40 bg-red-500/10 px-3 py-2">
          {error}
        </p>
      ) : null}
    </main>
  );
}
