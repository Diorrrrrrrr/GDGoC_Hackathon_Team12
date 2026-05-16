import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CareWatch — 실시간 건강 모니터링',
  description: '독거노인 실시간 건강 상태 모니터링 시스템',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" translate="no" className="h-full" style={{ fontFamily: "'GmarketSans', sans-serif" }}>
      <body className="min-h-full bg-[#F0F4FA]">
        {children}
      </body>
    </html>
  );
}
