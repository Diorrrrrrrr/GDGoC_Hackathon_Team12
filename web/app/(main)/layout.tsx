import Header from '@/components/Header';
import TabNav from '@/components/TabNav';
import BottomNav from '@/components/BottomNav';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full flex flex-col">
      <Header />
      <div className="hidden sm:block">
        <TabNav />
      </div>
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 pb-24 sm:pb-6">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
