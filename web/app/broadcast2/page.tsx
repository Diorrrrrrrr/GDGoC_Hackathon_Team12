'use client';

import dynamic from 'next/dynamic';

const BroadcastBodyClient = dynamic(() => import('./BroadcastBodyClient'), { ssr: false });

export default function BroadcastBodyPage() {
  return <BroadcastBodyClient />;
}
