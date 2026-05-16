"use client";

import Link from "next/link";
import { useState } from "react";
import { Scanner, type IDetectedBarcode } from "@yudiel/react-qr-scanner";

import { apiFetch } from "@/lib/api-client";

type CompleteResponse = {
  elder_id: string;
  elder_display_name?: string | null;
};

export default function CaregiverScanPage() {
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState<CompleteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleScan(detected: IDetectedBarcode[]) {
    if (paused) return;
    const value = detected[0]?.rawValue;
    if (!value) return;
    setPaused(true);
    setError(null);
    try {
      const data: CompleteResponse = await apiFetch("/pair/complete", {
        method: "POST",
        body: JSON.stringify({ token: value }),
      });
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPaused(false);
    }
  }

  return (
    <main className="flex-1 p-8 max-w-md mx-auto w-full">
      <Link href="/caregiver" className="text-sm opacity-60 hover:opacity-100">
        ← 대시보드
      </Link>
      <h1 className="text-2xl font-bold mt-2 mb-6">QR 스캔</h1>

      {result ? (
        <div className="rounded border border-emerald-500/40 bg-emerald-500/10 p-4 text-center space-y-2">
          <p className="font-bold text-lg">✓ 연동 완료</p>
          <p className="text-sm">
            노인:{" "}
            <span className="font-mono">
              {result.elder_display_name ?? result.elder_id}
            </span>
          </p>
          <Link
            href="/caregiver"
            className="inline-block mt-2 px-4 py-2 rounded bg-emerald-600 text-white"
          >
            대시보드로
          </Link>
        </div>
      ) : (
        <>
          <div className="rounded border overflow-hidden aspect-square bg-black">
            <Scanner
              onScan={handleScan}
              onError={(e) =>
                setError(e instanceof Error ? e.message : String(e))
              }
              paused={paused}
              constraints={{ facingMode: "environment" }}
            />
          </div>
          <p className="mt-3 text-sm opacity-70 text-center">
            노인 화면의 QR 코드를 카메라에 비추세요.
          </p>
          {error ? (
            <div className="mt-3 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm space-y-2">
              <p>{error}</p>
              <button
                onClick={() => {
                  setError(null);
                  setPaused(false);
                }}
                className="text-xs underline"
              >
                다시 시도
              </button>
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}
