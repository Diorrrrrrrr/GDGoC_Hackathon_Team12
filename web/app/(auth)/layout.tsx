export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#e0f2fe] via-[#f0f4fa] to-[#dcfce7] flex items-center justify-center px-4 py-8">
      {children}
    </div>
  );
}
