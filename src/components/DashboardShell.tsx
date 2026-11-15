'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Activity, BarChart3, Megaphone, Wrench, ChartNoAxesCombined, LayoutDashboard, LogOut, Server, Settings, Smartphone, Users, Menu, X, ChevronLeft, ChevronRight } from 'lucide-react';

const links = [
  ['/dashboard', 'Overview', LayoutDashboard],
  ['/dashboard/servers', 'VPN Servers', Server],
  ['/dashboard/analytics', 'Analytics', ChartNoAxesCombined],
  ['/dashboard/connections', 'Connections', Activity],
  ['/dashboard/users', 'Users & Devices', Users],
  ['/dashboard/monetization', 'GAMOB AdX', BarChart3],
  ['/dashboard/ad-management', 'Ad Management', Megaphone],
  ['/dashboard/app', 'App Control', Smartphone],
  ['/dashboard/maintenance', 'Maintenance', Wrench],
  ['/dashboard/settings', 'Settings', Settings],
] as const;

export default function DashboardShell({ children, username }: { children: React.ReactNode; username: string }) {
  const path = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  useEffect(() => { setMobileOpen(false); }, [path]);
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.assign('/login');
  }
  const navigation = (
    <nav aria-label="Main navigation" className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
      {links.map(([href, label, Icon]) => {
        const active = path === href || (href !== '/dashboard' && path.startsWith(href + '/'));
        return <Link key={href} href={href} title={collapsed ? label : undefined}
          aria-current={active ? 'page' : undefined}
          className={`ui-nav-link flex items-center gap-3 min-h-10 w-full rounded-lg px-3 py-2 text-[13px] font-medium ${active ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'} ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}>
          <Icon size={19} className="shrink-0" />
          <span className={collapsed ? 'lg:hidden' : ''}>{label}</span>
        </Link>;
      })}
    </nav>
  );
  return <div className="min-h-screen bg-[#f7f8fb]">
    {mobileOpen && <button aria-label="Close navigation" className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={() => setMobileOpen(false)} />}
    <aside className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-slate-200 bg-white transition-all duration-200 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 ${collapsed ? 'w-[76px]' : 'w-[258px]'}`}>
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-4">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
          {logoFailed ? <span className="text-xl font-extrabold tracking-tight text-slate-900">T2VPN</span> : <img src="/t2vpn_original.png" alt="T2VPN" onError={() => setLogoFailed(true)} width={126} height={42} className={`h-10 shrink-0 object-contain object-left ${collapsed ? "lg:w-12" : "w-[126px]"}`} />}
          
        </Link>
        <button aria-label="Close menu" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-slate-500 lg:hidden" onClick={() => setMobileOpen(false)}><X size={20}/></button>
      </div>
      {navigation}
      <div className="shrink-0 border-t border-slate-100 p-3">
        <div className={`mb-2 truncate rounded-xl bg-slate-50 px-3 py-3 text-xs text-slate-500 ${collapsed ? 'lg:hidden' : ''}`}>Signed in as <strong className="text-slate-800">{username}</strong></div>
        <button onClick={logout} title="Sign out" className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-100 ${collapsed ? 'lg:justify-center' : ''}`}><LogOut size={19}/><span className={collapsed ? 'lg:hidden' : ''}>Sign out</span></button>
      </div>
    </aside>
    <div className={`min-h-screen transition-[margin] duration-200 ${collapsed ? 'lg:ml-[76px]' : 'lg:ml-[258px]'}`}>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:px-7">
        <div className="flex items-center gap-3">
          <button aria-label="Open menu" className="ui-header-icon lg:hidden" onClick={() => setMobileOpen(true)}><Menu size={22}/></button>
          <button aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="ui-header-icon hidden lg:inline-flex" onClick={() => setCollapsed(v => !v)}>{collapsed ? <ChevronRight size={19}/> : <ChevronLeft size={19}/>}</button>
          <span className="text-sm font-semibold text-slate-800">{links.find(([href]) => path === href || (href !== '/dashboard' && path.startsWith(href + '/')))?.[1] || 'Dashboard'}</span>
        </div>
        <span className="hidden text-xs font-medium text-slate-500 sm:inline">T2VPN Admin Portal</span>
      </header>
      <main key={path} className="ui-page-enter mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-7">{children}</main>
    </div>
  </div>;
}
