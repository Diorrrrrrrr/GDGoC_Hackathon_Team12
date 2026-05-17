import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CareWatch',
  description: 'Real-time health monitoring system for seniors living alone',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html translate="no" className="h-full" style={{ fontFamily: "'GmarketSans', sans-serif" }}>
      <body className="min-h-full bg-[#F0F4FA]">
        {children}
      </body>
    </html>
  );
}
