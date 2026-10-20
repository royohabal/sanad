import { type ReactNode, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Link, useLocation, useParams, Router as WouterRouter } from 'wouter';
import { QRCodeSVG } from 'qrcode.react';
import { applyDocumentLanguage } from './i18n';
import {
  useHealthCheck, getHealthCheckQueryKey,
  useListWorkers, getListWorkersQueryKey,
  useGetWorkerByPublicId, getGetWorkerByPublicIdQueryKey,
   getListTipsQueryKey, useListTips, useGetTipReceipt, getGetTipReceiptQueryKey,
  useListSettlements, getListSettlementsQueryKey,
  useListChildren, getListChildrenQueryKey,
  useGetChildDashboard, getGetChildDashboardQueryKey, useCreateChild, useUpdateChild,
  useCreateAllowance, useCreateSavingsGoal, useContributeToSavingsGoal,
  useCreateApprovalRequest, useUpdateApprovalRequest, useCreateCashOutRequest, useUpdateCashOutRequest,
   useGetPublicChildRecipient, getGetPublicChildRecipientQueryKey,
   useCreatePaymentCheckout, useGetPaymentCheckout, getGetPaymentCheckoutQueryKey,
   useCompleteSimulatedPayment, useVerifyStripeCheckout, useCancelPaymentCheckout,
   useGetWalletDashboard, getGetWalletDashboardQueryKey, useLookupWalletRecipient, getLookupWalletRecipientQueryKey,
   useCreateWalletTransfer, useCreateWalletMoneyRequest, useActOnWalletMoneyRequest,
   useGetSanadSession, getGetSanadSessionQueryKey, useBootstrapFirstAdmin,
   useGetAdminOverview, getGetAdminOverviewQueryKey,
   useGetMyWorkerProfile, getGetMyWorkerProfileQueryKey,
  useGetMyWorkerDashboard, getGetMyWorkerDashboardQueryKey,
  useCreateCompanySettlements, useUpdateCompanySettlement,
   useListAdminWorkerWithdrawals, getListAdminWorkerWithdrawalsQueryKey,
  useGetMyCompanyProfile, getGetMyCompanyProfileQueryKey, useCreateMyCompanyProfile,
  useGetMyCompanyDashboard, getGetMyCompanyDashboardQueryKey,
   useListPendingCompanies, getListPendingCompaniesQueryKey,
  useReviewCompany,
  useListCompanyWorkers, getListCompanyWorkersQueryKey, useCreateCompanyWorkerInvitation,
  useUpdateCompanyWorker, useResendCompanyWorkerInvitation, useRevokeCompanyWorkerInvitation,
  useDeactivateCompanyWorker, useGetMyWorkerInvitation, getGetMyWorkerInvitationQueryKey,
  useAcceptMyWorkerInvitation,
} from '@workspace/api-client-react';
import type { Tip, Child } from '@workspace/api-client-react';
import {
  ArrowRight, ArrowUpRight, BadgeCheck, Banknote, BriefcaseBusiness, CheckCircle2, CircleHelp,
  Clock3, Coffee, Copy, Download, Heart, Languages, Menu, Search,
  QrCode, ShieldAlert, Sparkles, Star, Users, Wallet, X, LockKeyhole, Plus, CircleDollarSign, ClipboardCheck,
} from 'lucide-react';

const queryClient = new QueryClient();
const KWD = (fils?: number | null) => `${((fils || 0) / 1000).toFixed(3)} KWD`;
const USD = (cents?: number | null) =>
  `$${((cents || 0) / 100).toFixed(2)} USD`;
function apiErrorText(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null) {
    const data = (error as { data?: unknown }).data;
    if (typeof data === "object" && data !== null) {
      const message = (data as { error?: unknown }).error;
      if (typeof message === "string" && message.trim()) return message;
    }
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}
const dateLabel = (date?: string) => date ? new Date(date).toLocaleDateString('en-KW', { day: 'numeric', month: 'short' }) : '—';
const shortDate = (date?: string) => date ? new Date(date).toLocaleDateString('en-KW', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

function Brand({ compact = false, tone = 'light' }: { compact?: boolean; tone?: 'light' | 'dark' }) {
  return <Link href="/" className={`inline-flex items-center gap-2.5 no-underline ${tone === 'dark' ? 'text-[#581C2B]' : 'text-white'}`} data-testid="link-brand">
    <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#EF805F] text-[#3B1720]"><Heart size={18} strokeWidth={2.5}/></span>
    <span className="leading-tight"><b className="block font-[Manrope] text-[17px] tracking-[.12em]">SANAD <span className="font-sans tracking-normal">سند</span></b>{!compact && <small className="block text-[10px] tracking-[.14em] text-[#f4cfb9]">Scan. Send. Done.</small>}</span>
  </Link>;
}
function Header({ demo = false, publicPage = false }: { demo?: boolean; publicPage?: boolean }) {
  const {isSignedIn}=useAuth();
  const {signOut}=useClerk();
  const [arabic, setArabic] = useState(() => {
    if (typeof window === 'undefined') return false;
    const queryLanguage = new URLSearchParams(window.location.search).get('lang');
    return queryLanguage === 'ar' || (queryLanguage !== 'en' && window.localStorage.getItem('sanad-language') === 'ar');
  });
  const [open, setOpen] = useState(false);
  const directTipHref = '/direct-tip';
  useEffect(() => { applyDocumentLanguage(arabic); }, [arabic]);
  return <>
    <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between bg-[#581C2B] px-5 text-white shadow-[0_5px_18px_rgba(59,23,32,.12)] md:px-9">
      <Brand/>
      {!publicPage&&<nav className="hidden items-center gap-1 lg:flex">
        {[['Direct tip','/direct-tip'],['Worker','/worker'],['Company','/company'],['Parent','/parent'],['Child','/parent'],['Individual','/individual']].map(([title, href],index) =>
          <Link key={title} href={href} className={`rounded-full px-3 py-2 transition hover:bg-white/10 hover:text-white ${index<3?'text-[13px] font-bold text-white':'text-[11px] text-[#f7e9dc]'}`}>{title}</Link>)}
      </nav>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => {const next = !arabic; setArabic(next); window.localStorage.setItem('sanad-language', next ? 'ar' : 'en'); const params = new URLSearchParams(window.location.search); params.delete('lang'); window.history.replaceState(null,'',`${window.location.pathname}${params.size?`?${params}`:''}${window.location.hash}`);}} className="flex items-center gap-1 rounded-full border border-white/20 px-2.5 py-2 text-[11px] md:px-3 md:text-xs" data-testid="button-language"><Languages size={14}/>{arabic?'EN':'عربي'}</button>
         {!publicPage&&<Link href={directTipHref} className="hidden rounded-full bg-[#EF805F] px-4 py-2 text-xs font-bold text-[#3B1720] md:block">Worker space <ArrowRight className="ml-1 inline" size={13}/></Link>}
        {!publicPage&&(isSignedIn?<button type="button" onClick={()=>signOut({redirectUrl:import.meta.env.BASE_URL.replace(/\/$/,'')||'/'})} className="hidden rounded-full border border-white/20 px-3 py-2 text-[11px] font-semibold text-[#f7e9dc] md:block">Sign out</button>:<Link href="/sign-in" className="hidden rounded-full border border-white/20 px-3 py-2 text-[11px] font-semibold text-[#f7e9dc] md:block">Sign in</Link>)}
        {demo && <span className="hidden rounded-full bg-white/10 px-3 py-2 text-[10px] text-[#ffd9be] md:block">DEMO MODE</span>}
        {!publicPage&&<button className="p-2 lg:hidden" onClick={()=>setOpen(!open)} aria-label="Toggle navigation" data-testid="button-menu">{open?<X size={20}/>:<Menu size={20}/>}</button>}
      </div>
    </header>
    {open && !publicPage && <nav className="absolute right-3 top-[62px] z-40 grid w-56 gap-1 rounded-2xl border border-[#eadbcc] bg-[#fffaf4] p-3 shadow-xl lg:hidden">{[['Direct tip','/direct-tip'],['Worker','/worker'],['Company','/company'],['Parent','/parent'],['Child wallet','/parent'],['Individual','/individual']].map(([t,h])=><Link key={t} onClick={()=>setOpen(false)} href={h} className="rounded-xl px-3 py-2 text-sm hover:bg-[#f5e8d8]">{t}</Link>)}</nav>}
  </>;
}
function DemoNotice() { return <div className="demo-banner flex items-start gap-2.5 rounded-xl px-4 py-3 text-xs leading-relaxed" data-testid="status-demo-mode"><ShieldAlert className="mt-0.5 shrink-0" size={15}/><span><b>Prototype demo only.</b> Actions record simulated activity; no money moves or payments are processed.</span></div>; }
function Shell({ children, demo = false, publicPage = false, pageClass = '' }: { children: ReactNode; demo?: boolean; publicPage?: boolean; pageClass?: string }) {
  return <div className={`app-shell grain ${pageClass}`}><Header demo={demo} publicPage={publicPage}/><main className="mx-auto max-w-[1220px] px-4 py-6 md:px-8 md:py-9">{demo && <div className="mb-6"><DemoNotice/></div>}{children}</main><footer className="mt-10 border-t border-[#eadbcc] bg-[#fff4e5] px-5 py-5 text-xs text-[#765b4e]"><div className="mx-auto flex max-w-[1220px] flex-wrap items-center justify-between gap-3"><Brand compact tone="dark"/><span>Kuwait’s community-first money prototype</span><span>Stripe tips use test mode. Wallet demos are simulated.</span></div></footer></div>;
}
function PageTitle({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div>{eyebrow&&<p className="mb-2 text-[10px] font-bold uppercase tracking-[.2em] text-[#b66e59]">{eyebrow}</p>}<h1 className="font-[Manrope] text-3xl font-extrabold tracking-[-.045em] text-[#3B1720] md:text-[40px]">{title}</h1>{description&&<p className="mt-2 max-w-2xl text-sm leading-6 text-[#765b4e]">{description}</p>}</div>{action}</div>;
}
function LoadingCards() { return <div className="grid gap-4 md:grid-cols-3"><div className="skeleton h-36"/><div className="skeleton h-36"/><div className="skeleton h-36"/></div>; }
function QueryError({ retry }: { retry: () => void }) { return <div className="card-warm rounded-2xl p-7 text-center"><CircleHelp className="mx-auto mb-2 text-[#EF805F]"/><p className="font-semibold">We couldn’t load this demo space.</p><p className="mt-1 text-sm text-[#765b4e]">Check the API server and try again.</p><button className="btn-primary mt-4" onClick={retry}>Try again</button></div>; }
function Empty({ title, detail }: { title: string; detail: string }) { return <div className="rounded-2xl border border-dashed border-[#d9c5b2] bg-[#fff9f2] px-6 py-10 text-center"><Sparkles className="mx-auto mb-2 text-[#EF805F]" size={20}/><p className="font-semibold">{title}</p><p className="mx-auto mt-1 max-w-sm text-sm text-[#80695b]">{detail}</p></div>; }
function Stat({ label, value, icon: Icon, detail }: { label: string; value: string; icon: typeof Wallet; detail?: string }) { return <div className="card-warm rounded-2xl p-5"><div className="flex items-center justify-between text-xs font-semibold text-[#80695b]"><span>{label}</span><span className="grid h-8 w-8 place-items-center rounded-xl bg-[#f8e8da] text-[#9c523e]"><Icon size={16}/></span></div><div className="mt-4 font-[Manrope] text-2xl font-extrabold tracking-tight text-[#581C2B]">{value}</div>{detail&&<p className="mt-1 text-xs text-[#907566]">{detail}</p>}</div>; }
function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) { return <label className="grid gap-1.5 text-xs font-semibold text-[#64483d]">{label}<input className="soft-input text-sm font-normal" {...props}/></label>; }
function SelectField({ label, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) { return <label className="grid gap-1.5 text-xs font-semibold text-[#64483d]">{label}<select className="soft-input text-sm font-normal" {...props}>{children}</select></label>; }
function Panel({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) { return <section className="card-warm rounded-2xl p-5 md:p-6"><div className="mb-5 flex items-center justify-between gap-3"><h2 className="font-[Manrope] text-lg font-extrabold tracking-tight">{title}</h2>{aside}</div>{children}</section>; }
function ListSkeleton() { return <div className="space-y-3">{[1,2,3].map(x=><div className="skeleton h-[58px]" key={x}/>)}</div>; }
function amountInKwd(value: string) { return Math.round(parseFloat(value || '0') * 1000); }
function publicUrlForPath(path: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return new URL(`${base}${path.startsWith('/') ? path : `/${path}`}`, window.location.origin).toString();
}

function Home() {
  const health = useHealthCheck({query:{queryKey:getHealthCheckQueryKey()}});
  const publicTipHref = '/direct-tip';
  const roles = [
    {name:'Worker', arabic:'موظف الخدمة', desc:'Your QR, appreciation, and monthly status.', icon:Coffee, href:'/worker', label:'WORKER SPACE'},
    {name:'Company', arabic:'الشركات والمنشآت', desc:'Your team, activity, and settlement records.', icon:BriefcaseBusiness, href:'/company', label:'FOR BUSINESSES'},
    {name:'Parent', arabic:'ولي الأمر', desc:'Guide allowances, savings, and spending.', icon:Users, href:'/parent', label:'FAMILY CARE'},
    {name:'Child', arabic:'الأبناء', desc:'A supervised wallet for goals and requests.', icon:Wallet, href:'/parent', label:'SUPERVISED WALLET'},
    {name:'Individual', arabic:'الأفراد', desc:'Send, request, and review demo activity.', icon:ArrowUpRight, href:'/individual', label:'EVERYDAY FINANCE'},
  ];
  return <Shell><div className="mx-auto max-w-[1120px] pt-4 text-left md:pt-8">
    <span className="inline-flex items-center gap-2 rounded-full bg-[#f7e8d8] px-4 py-2 text-[11px] font-semibold text-[#82583f]"><span className="h-2 w-2 rounded-full bg-[#EF805F]"/>{health.isLoading?'Connecting to demo environment':health.isError?'Demo API is unavailable':'Choose your SANAD journey'}</span>
    <div className="home-hero mt-7 grid items-center gap-8 lg:grid-cols-[1.05fr_.95fr]">
    <div>
    <p className="text-[11px] font-bold uppercase tracking-[.24em] text-[#b66955]">SANAD · سند / Made for everyday Kuwait</p>
    <h1 className="mt-3 max-w-[760px] font-[Manrope] text-[42px] font-extrabold leading-[1.04] tracking-[-.055em] text-[#3B1720] md:text-[66px]">A little thanks<br className="hidden md:block"/> goes a long way.</h1>
    <p className="mt-5 max-w-[570px] text-base leading-7 text-[#765b4e] md:text-lg">A local way to thank Kuwait’s service workers. No customer account needed.</p>
      <div className="mt-7 flex flex-wrap gap-3"><Link href={publicTipHref} className="btn-coral inline-flex items-center gap-2 text-sm">Direct tip <ArrowRight size={16}/></Link><Link href="/company" className="inline-flex items-center gap-2 rounded-full border border-[#ddc4b2] px-5 py-3 text-sm font-bold text-[#581C2B] hover:bg-[#fff5e9]">For Businesses <ArrowUpRight size={16}/></Link></div>
    <p className="mt-4 text-xs text-[#907566]"><span dir="rtl">شكراً بسيطاً يصنع فرقاً كبيراً</span><span className="mx-2">·</span>English and Arabic</p>
    </div>
    <div className="relative overflow-hidden rounded-[30px] bg-[#581C2B] p-6 text-[#fff4e5] shadow-[0_20px_50px_rgba(88,28,43,.14)] md:p-8">
      <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full border border-[#ef805f]/30"/><div className="absolute -right-5 -top-9 h-44 w-44 rounded-full border border-[#ef805f]/25"/>
      <div className="relative"><div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-[.22em] text-[#f1b99d]">Three easy steps</span><QrCode size={23} className="text-[#ef805f]"/></div>
      <div className="mt-7 space-y-4">{[['01','Scan the worker’s SANAD QR','No customer sign-up'],['02','Choose a thank-you amount','250 fils · 500 fils · 1 KWD'],['03','Send your appreciation','Stripe test checkout only. No live payments.']].map(([n,title,sub])=><div key={n} className="flex items-center gap-4 border-t border-white/15 pt-4"><span className="font-mono text-xs text-[#ef805f]">{n}</span><div><b className="block text-sm">{title}</b><span className="mt-1 block text-xs text-[#e7cbbc]">{sub}</span></div></div>)}</div>
      <div className="mt-5 rounded-xl bg-white/10 px-4 py-3 text-[11px] leading-5 text-[#f4d9c7]">Stripe test mode only. No live money moves.</div></div>
    </div></div>
  </div>
  <div className="mt-9 grid gap-4 md:grid-cols-2">
    {roles.slice(0,2).map(({name,arabic,desc,icon:Icon,href,label},i)=><Link key={name} href={href} className={`card-warm group flex min-h-[190px] flex-col rounded-[23px] p-6 text-left no-underline transition duration-200 hover:-translate-y-1 hover:shadow-[0_18px_38px_rgba(88,28,43,.12)] enter ${i===0?'border-l-[5px] border-l-[#EF805F]':''}`} style={{animationDelay:`${i*50}ms`}}>
      <div className="flex items-start justify-between"><span className={`grid h-11 w-11 place-items-center rounded-[15px] ${i===1?'bg-[#EF805F] text-[#3B1720]':'bg-[#581C2B] text-[#fff4e5]'}`}><Icon size={20}/></span><span className="rounded-full bg-[#f8e6dc] px-3 py-1 text-[9px] font-bold tracking-[.12em] text-[#874b3a]">{label}</span></div>
      <div className="mt-5 flex items-baseline justify-between gap-2"><h2 className="font-[Manrope] text-xl font-extrabold tracking-tight text-[#3B1720]">{name}</h2><span dir="rtl" className="text-xs font-semibold text-[#a75d4d]">{arabic}</span></div>
      <p className="mt-2 max-w-md text-sm leading-6 text-[#796257]">{desc}</p>
      <span className="mt-auto flex items-center justify-between pt-5 text-xs font-bold text-[#581C2B]"><span>Explore demo space</span><span className="grid h-8 w-8 place-items-center rounded-full bg-[#f5e8d8] transition group-hover:bg-[#EF805F]"><ArrowRight size={15}/></span></span>
    </Link>)}
  </div>
  <Link href="/admin" className="card-warm group mt-4 flex min-h-[190px] w-full max-w-[550px] flex-col rounded-[23px] p-6 text-left no-underline transition duration-200 hover:-translate-y-1 hover:shadow-[0_18px_38px_rgba(88,28,43,.12)] enter">
    <div className="flex items-start justify-between"><span className="grid h-11 w-11 place-items-center rounded-[15px] bg-[#581C2B] text-[#fff4e5]"><BadgeCheck size={20}/></span><span className="rounded-full bg-[#f8e6dc] px-3 py-1 text-[9px] font-bold tracking-[.12em] text-[#874b3a]">PLATFORM OPERATIONS</span></div>
    <div className="mt-5 flex items-baseline justify-between gap-2"><h2 className="font-[Manrope] text-xl font-extrabold tracking-tight text-[#3B1720]">Admin</h2><span dir="rtl" className="text-xs font-semibold text-[#a75d4d]">إدارة SANAD</span></div>
    <p className="mt-2 max-w-md text-sm leading-6 text-[#796257]">Review company access and demo activity. Admin tools require an authorized SANAD account.</p>
    <span className="mt-auto flex items-center justify-between pt-5 text-xs font-bold text-[#581C2B]"><span>Explore admin space</span><span className="grid h-8 w-8 place-items-center rounded-full bg-[#f5e8d8] transition group-hover:bg-[#EF805F]"><ArrowRight size={15}/></span></span>
  </Link>
  <div className="mt-5 grid gap-3 sm:grid-cols-3">{roles.slice(2).map(({name,arabic,desc,icon:Icon,href})=><Link key={name} href={href} className="group flex items-start gap-3 rounded-2xl border border-[#eadbcc] bg-[#f8efe5] p-4 transition hover:bg-[#fff9f2]"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#efdfd0] text-[#87523e]"><Icon size={17}/></span><span><b className="block text-sm">{name} <small dir="rtl" className="ml-1 font-normal text-[#a75d4d]">{arabic}</small></b><span className="mt-1 block text-xs leading-5 text-[#80695b]">{desc}</span></span></Link>)}</div>
  <div className="mt-8 flex flex-col items-center justify-between gap-4 rounded-[24px] bg-[#3B1720] px-6 py-6 text-[#fff4e5] md:flex-row md:px-9">
    <div className="flex items-center gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#EF805F] text-[#3B1720]"><Sparkles/></span><div><h2 className="font-[Manrope] text-lg font-bold">Just want to thank someone?</h2><p className="mt-1 text-xs text-[#ebd0bd]">No account required. Open a worker’s public demo tip page.</p></div></div>
      <Link href={publicTipHref} className="btn-coral flex items-center gap-2 text-sm">Choose a worker to tip <ArrowRight size={16}/></Link>
  </div>
  </Shell>;
}

function DirectTipPage() {
  const workers = useListWorkers({ query: { queryKey: getListWorkersQueryKey() } });
  const [search, setSearch] = useState('');
  const term = search.trim().toLocaleLowerCase();
  const matchingWorkers = workers.data?.filter((worker) =>
    [worker.name, worker.jobTitle, worker.workplace, worker.company]
      .join(' ')
      .toLocaleLowerCase()
      .includes(term),
  );

  return <Shell>
    <div className="mx-auto max-w-[980px] pt-3">
      <PageTitle
        eyebrow="Public tipping · إكرامية مباشرة"
        title="Direct tip"
        description="Find a worker and open their public tip page. No account needed."
      />
      <label className="mb-5 flex items-center gap-3 rounded-2xl border border-[#e7d5c2] bg-[#fffaf4] px-4 py-3 text-sm text-[#80695b] shadow-sm">
        <Search size={18} aria-hidden="true"/>
        <input
          className="min-w-0 flex-1 bg-transparent text-sm text-[#3B1720] outline-none"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Name, role, or workplace"
          aria-label="Search workers"
        />
      </label>
      {workers.isLoading ? <LoadingCards/> : workers.isError ? <QueryError retry={() => workers.refetch()}/> :
        !workers.data?.length ? <Empty title="No workers are listed yet" detail="Public worker tipping pages will appear here when available."/> :
        !matchingWorkers?.length ? <Empty title="No matching workers" detail="Try a different name, role, or workplace."/> :
        <div className="grid gap-4 sm:grid-cols-2">
          {matchingWorkers.map((worker) => <article key={worker.id} className="card-warm flex flex-col rounded-2xl p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#f3dfd2] font-bold text-[#581C2B]">
                {worker.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
              </span>
              <div className="min-w-0">
                <h2 className="truncate font-[Manrope] text-lg font-extrabold text-[#3B1720]">{worker.name}</h2>
                <p className="truncate text-xs text-[#80695b]">{worker.jobTitle} · {worker.workplace}</p>
              </div>
            </div>
            <p className="mt-4 text-xs text-[#80695b]">{worker.company}</p>
            <Link href={`/tip/${worker.publicId}`} className="btn-primary mt-4 inline-flex items-center justify-center gap-2 text-sm">
              Continue to tip <ArrowRight size={15}/>
            </Link>
          </article>)}
        </div>
      }
      <p className="mt-6 rounded-xl bg-[#fff0df] px-4 py-3 text-xs leading-5 text-[#76543d]">Provider and amount are shown before checkout.</p>
    </div>
  </Shell>;
}

function WorkerTipList({ tips, loading }: { tips?: Tip[]; loading?: boolean }) {
  if(loading) return <ListSkeleton/>;
  if(!tips?.length) return <Empty title="No appreciations yet" detail="Demo tips appear here after someone sends a simulated thank-you."/>; 
  return <div className="space-y-2">{tips.map(t=><div key={t.reference} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#fff5e9] px-4 py-3" data-testid={`row-tip-${t.reference}`}><div className="min-w-[160px]"><p className="text-sm font-semibold">{t.message||'A thank-you, shared'}</p><p className="mt-1 text-xs text-[#8a6e5e]">{t.customerName||'Anonymous'} · {dateLabel(t.createdAt)}{t.rating ? ` · ${t.rating}/5 rating` : ''} · {t.reference}</p></div><div className="ml-auto text-right"><p className="font-bold text-[#581C2B]">{KWD(t.amountFils)}</p><p className="text-[10px] text-[#8a6e5e]">simulated</p></div></div>)}</div>;
}
function WorkerPage() {
  const {isLoaded,isSignedIn}=useAuth();
  const profile=useGetMyWorkerProfile({query:{enabled:!!isSignedIn,queryKey:getGetMyWorkerProfileQueryKey(),retry:false}});
  const qc=useQueryClient();
  const dashboard=useGetMyWorkerDashboard({query:{enabled:!!isSignedIn&&profile.data?.accountStatus==='active',queryKey:getGetMyWorkerDashboardQueryKey()}});
  const [copied,setCopied]=useState(false);
  if(!isLoaded) return <Shell><LoadingCards/></Shell>;
  if(!isSignedIn) return <AuthPrompt title="Your worker space is private" detail="Sign in with the email address invited by your company to view your private worker space."/>;
  if(profile.isLoading) return <Shell><LoadingCards/></Shell>;
  if(profile.isError) return <Shell><QueryError retry={()=>profile.refetch()}/></Shell>;
  const state=profile.data;
  if(state?.accountStatus==='invited') return <Shell><PageTitle eyebrow="Company invitation · دعوة الشركة" title="Your SANAD space is ready." description="Accept your company invitation to activate your private worker dashboard and public appreciation QR."/><div className="mx-auto max-w-2xl"><WorkerInvitationCard/></div></Shell>;
  if(state?.accountStatus==='none'||!state?.worker) return <Shell><PageTitle eyebrow="Worker account · حساب العامل" title="Your worker space starts with an invitation." description="SANAD worker profiles are created and managed by verified companies. Ask your company to invite the email address you use to sign in."/><div className="card-warm max-w-2xl rounded-2xl p-6"><div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#f5e8d8] text-[#88523e]"><BriefcaseBusiness/></span><div><h2 className="font-[Manrope] text-lg font-extrabold">No worker profile is linked to this account</h2><p className="mt-2 text-sm leading-6 text-[#765b4e]">There is no self-registration or self-association flow. Once invited, return here to accept and view your own profile.</p></div></div></div></Shell>;
  if(state.accountStatus==='deactivated') return <Shell><PageTitle eyebrow="Worker account · حساب العامل" title="This worker account is inactive." description="Your company has deactivated this SANAD worker profile. Your private dashboard and public QR are unavailable."/><div className="card-warm max-w-2xl rounded-2xl p-6"><b>{state.worker.name}</b><p className="mt-1 text-sm text-[#80695b]">{state.worker.jobTitle} · {state.worker.workplace}</p><p className="mt-4 inline-flex rounded-full bg-[#fff0df] px-3 py-1.5 text-xs font-bold text-[#865532]">Deactivated</p></div></Shell>;
  const w=state.worker; const d=dashboard.data; const publicUrl=d?publicUrlForPath(d.qrUrl):'';
   return <Shell demo pageClass="worker-dashboard"><PageTitle eyebrow="Worker space" title={`${w.name.split(' ')[0]}'s dashboard`} description={`${w.jobTitle} · ${w.workplace}`}/>
     {dashboard.isLoading?<LoadingCards/>:dashboard.isError?<QueryError retry={()=>dashboard.refetch()}/>:d&&<>
     <div className="worker-metrics grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><Stat label="Available balance" value={KWD(d.wallet.availableFils)} icon={Wallet} detail="Recorded tips · demo ledger"/><Stat label="This month" value={KWD(d.monthlyFils)} icon={Banknote} detail="Test and demo tips"/><Stat label="Tip count" value={String(d.totalTips)} icon={Heart} detail="All recorded tips"/><Stat label="Rating" value={d.averageRating==null?'—':`${d.averageRating.toFixed(1)} / 5`} icon={Star} detail="Optional feedback"/><Stat label="Settlement" value={d.settlementStatus} icon={Clock3} detail="Status only"/></div>
     <div className="mt-5"><Panel title="Your tip QR" aside={<span className="rounded-full bg-[#f8e7db] px-3 py-1 text-[10px] font-semibold text-[#94523d]">Active</span>}>{!d?<Empty title="Your dashboard is being prepared" detail="Refresh shortly to see your QR and recent activity."/>:<div className="worker-qr-layout grid gap-5 sm:grid-cols-[1fr_160px] sm:items-center"><div><div className="flex items-center gap-3"><span className="grid h-14 w-14 place-items-center rounded-full bg-[#f3dfd2] font-bold text-[#581C2B]">{w.name.split(' ').map(x=>x[0]).slice(0,2).join('')}</span><div><h2 className="font-[Manrope] text-xl font-extrabold">{w.name}</h2><p className="text-xs text-[#80695b]">{w.jobTitle} · {w.workplace}</p></div></div><p className="mt-4 break-all rounded-xl bg-[#f7eadb] px-3 py-2 font-mono text-xs">{publicUrl}</p><div className="mt-3 flex flex-wrap gap-2"><Link className="btn-primary text-xs" href={`/tip/${w.publicId}`}>Open tip page <ArrowRight className="ml-1 inline" size={13}/></Link><button className="rounded-full border border-[#e0cdbb] px-3 py-2 text-xs font-bold" onClick={async()=>{try{await navigator.clipboard.writeText(publicUrl);setCopied(true);window.setTimeout(()=>setCopied(false),1800)}catch{setCopied(false)}}}>{copied?'Copied':'Copy link'}</button><button className="rounded-full border border-[#e0cdbb] px-3 py-2 text-xs font-bold" onClick={()=>window.print()}><Download className="mr-1 inline" size={13}/>Print QR</button></div></div><div className="mx-auto grid place-items-center rounded-2xl border-[7px] border-white bg-[#f6e7d5] p-3 shadow-inner"><QRCodeSVG value={publicUrl} size={132} fgColor="#581C2B" bgColor="#F6E7D5" title={`SANAD tip QR for ${w.name}`}/><span className="mt-1 text-[9px] font-bold text-[#765b4e]">SANAD QR</span></div></div>}</Panel></div>
       <div className="mt-5 grid gap-5 lg:grid-cols-2"><Panel title="Latest activity"><WorkerTipList tips={d?.recentTips}/></Panel><Panel title="Monthly statements" aside={<span className="text-[10px] text-[#8a6e5e]">Informational</span>}>{!d?.settlements.length?<Empty title="No statements yet" detail="Available monthly records will appear here."/>:<div className="space-y-3">{d.settlements.map(s=><div key={s.id} className="rounded-xl bg-[#fff5e9] px-4 py-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-semibold">{s.month}{s.isLegacy&&<span className="ml-2 rounded-full bg-[#f2e5d5] px-2 py-1 text-[9px] font-bold uppercase tracking-wide">Legacy</span>}</p><p className="text-[10px] text-[#80695b]">{s.periodStart||s.periodEnd?`${s.periodStart?shortDate(s.periodStart):'—'} – ${s.periodEnd?shortDate(s.periodEnd):'—'}`:s.month}</p></div><span className="text-xs font-semibold">{s.status}</span></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><span>Salary<b className="mt-1 block">{s.salaryFils==null?'Not recorded':KWD(s.salaryFils)}</b></span><span>Tips<b className="mt-1 block">{s.tipsFils==null?'Not recorded':KWD(s.tipsFils)}</b></span><span>Adjustments<b className="mt-1 block">{s.adjustmentsFils==null?'Not recorded':KWD(s.adjustmentsFils)}</b></span><span>Total<b className="mt-1 block text-[#581C2B]">{KWD(s.amountFils)}</b></span></div></div>)}</div>}<p className="mt-3 text-[10px] leading-4 text-[#80695b]">No cash-out is processed here.</p></Panel></div></>}
  </Shell>;
}

function WorkerInvitationCard() {
 const {isSignedIn}=useAuth(); const qc=useQueryClient(); const [,setLocation]=useLocation();
 const invitation=useGetMyWorkerInvitation({query:{enabled:!!isSignedIn,queryKey:getGetMyWorkerInvitationQueryKey(),retry:false}});
 const accept=useAcceptMyWorkerInvitation({mutation:{onSuccess:async()=>{await Promise.all([qc.invalidateQueries({queryKey:getGetMyWorkerProfileQueryKey()}),qc.invalidateQueries({queryKey:getGetMyWorkerInvitationQueryKey()}),qc.invalidateQueries({queryKey:getGetMyWorkerDashboardQueryKey()})]);setLocation('/worker')}}});
  if(!isSignedIn) {
   const returnUrl=`${window.location.origin}${basePath}/worker/invitation${window.location.search}`;
   const authQuery=new URLSearchParams(window.location.search);authQuery.set('redirect_url',returnUrl);
   const authSuffix=authQuery.toString();
   return <div className="card-warm rounded-2xl p-6"><h2 className="font-[Manrope] text-xl font-extrabold">Continue with your invited email</h2><p className="mt-2 text-sm leading-6 text-[#765b4e]">Already have a SANAD account? Sign in. New to SANAD? Create your account with the email address your company invited. Your Clerk invitation ticket will be kept for either path.</p><div className="mt-5 flex flex-wrap gap-3"><Link className="btn-primary inline-flex items-center" href={`/sign-up?${authSuffix}`}>Create account <ArrowRight className="ml-2" size={15}/></Link><Link className="inline-flex items-center rounded-full border border-[#ddc4b2] px-5 py-3 text-sm font-bold text-[#581C2B] hover:bg-[#fff5e9]" href={`/sign-in?${authSuffix}`}>Sign in</Link></div></div>;
 }
 if(invitation.isLoading)return <div className="card-warm rounded-2xl p-6"><div className="skeleton h-24"/></div>;
 if(invitation.isError)return <QueryError retry={()=>invitation.refetch()}/>;
 const info=invitation.data?.invitation;
 if(!info)return <div className="card-warm rounded-2xl p-6"><h2 className="font-[Manrope] text-xl font-extrabold">No invitation is waiting</h2><p className="mt-2 text-sm leading-6 text-[#765b4e]">This invitation may have expired or already been used. Ask your company to check its worker invitation status.</p></div>;
 return <div className="card-warm rounded-2xl p-6 md:p-8"><span className="inline-flex rounded-full bg-[#eaf0e3] px-3 py-1.5 text-[10px] font-bold text-[#527048]">Verified company invitation</span><h2 className="mt-4 font-[Manrope] text-2xl font-extrabold">{info.workerName}</h2><p className="mt-1 text-sm text-[#80695b]">{info.jobTitle} · {info.companyName}</p><p className="mt-4 text-xs text-[#80695b]">Invitation expires {shortDate(info.invitationExpiresAt)}. Accepting activates your private worker account.</p><button className="btn-primary mt-5" disabled={accept.isPending} onClick={()=>accept.mutate()}>{accept.isPending?'Activating your account…':'Accept invitation'}</button>{accept.isError&&<p className="mt-3 rounded-xl bg-[#fff0df] px-3 py-2 text-xs leading-5 text-[#8c3f32]">We could not accept this invitation. It may have expired or been revoked. Please ask your company to resend it.</p>}</div>;
}

function TipPage() {
  const {publicId=''}=useParams(); const qc=useQueryClient();
  const wq=useGetWorkerByPublicId(publicId,{query:{queryKey:getGetWorkerByPublicIdQueryKey(publicId)}});
  const create=useCreatePaymentCheckout(); const [,go]=useLocation();
  const [amount,setAmount]=useState(500); const [rating,setRating]=useState(0); const [message,setMessage]=useState(''),[customerName,setCustomerName]=useState('');
  const send=()=>create.mutate({data:{flow:'worker_tip',publicId,amountFils:amount,idempotencyKey:crypto.randomUUID(),customerName:customerName.trim()||null,rating:rating||null,message:message.trim()||null}}, {onSuccess:payment=>{qc.setQueryData(getGetPaymentCheckoutQueryKey(payment.paymentId),payment);go(`/checkout/${payment.paymentId}`);}});
  return <Shell><div className="customer-tip mx-auto max-w-[510px]">
    {wq.isLoading?<div className="card-warm rounded-[30px] p-7"><div className="skeleton h-20"/><div className="skeleton mt-4 h-36"/></div>:wq.isError?<QueryError retry={()=>wq.refetch()}/>:wq.data&&<div className="tip-card card-warm overflow-hidden rounded-[30px] p-5 sm:p-7">
      <div className="flex items-center justify-between"><Brand compact tone="dark"/><span className="rounded-full bg-[#f7e9dc] px-3 py-1.5 text-[10px] font-bold text-[#82583f]"><ShieldAlert size={12} className="mr-1 inline"/>SHARED CHECKOUT</span></div>
      <div className="mt-5 rounded-[22px] bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3"><div className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-[#f5e4d5] font-[Manrope] text-lg font-extrabold text-[#581C2B]">{wq.data.name.split(' ').map(x=>x[0]).slice(0,2).join('')}{wq.data.avatarUrl&&<img src={wq.data.avatarUrl} alt="" onError={e=>e.currentTarget.style.display='none'} className="absolute inset-0 h-full w-full object-cover"/>}</div><div className="min-w-0 flex-1"><span className="rounded-full bg-[#f8e5dd] px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-[#a25844]">{wq.data.jobTitle}</span><h1 className="mt-1 truncate font-[Manrope] text-lg font-extrabold">{wq.data.name}</h1><p className="truncate text-xs text-[#80695b]">{wq.data.workplace}</p></div><BadgeCheck className="text-[#EF805F]" size={20}/></div>
         <div className="mt-4 flex items-center justify-between rounded-full bg-[#fff5ea] px-3 py-2 text-xs"><span className="flex items-center gap-1 font-bold text-[#8f4837]"><Star fill="#EF805F" size={13} className="text-[#EF805F]"/> Thank a local hero</span><span className="text-[#876d5d]">Stripe test mode</span></div>
      </div>
       <div className="my-4 rounded-xl bg-[#fff0df] p-3 text-xs leading-5 text-[#76543d]"><b>No account needed.</b> Review provider and amount at checkout.</div>
      <div className="flex items-end justify-between"><h2 className="font-[Manrope] text-lg font-extrabold">Choose an amount</h2><span className="text-[10px] text-[#80695b]">KWD · fils</span></div>
      <div className="mt-3 grid grid-cols-3 gap-2">{[250,500,1000].map(n=><button key={n} onClick={()=>setAmount(n)} className={`rounded-2xl border px-2 py-3 transition ${amount===n?'border-[#EF805F] bg-[#fff0e7] text-[#581C2B] ring-1 ring-[#EF805F]':'border-[#eadbcc] bg-white'}`}><b className="block text-lg">{n===1000?'1.000':n}</b><span className="text-[10px] text-[#80695b]">{n===1000?'KWD':'fils'}</span></button>)}</div>
        <label className="mt-3 block text-xs font-semibold text-[#765b4e]">Your name (optional)<input className="soft-input mt-1.5" maxLength={80} value={customerName} onChange={e=>setCustomerName(e.target.value)} placeholder="Anonymous"/></label>
        <div className="mt-4 rounded-2xl bg-white p-4"><div className="flex items-center justify-between"><b className="text-xs">Leave a compliment (optional)</b><span className="text-[10px] text-[#8a6e5e]">Choose a rating</span></div><div className="mt-2 flex gap-1">{[1,2,3,4,5].map(x=><button key={x} aria-label={`Rate ${x} out of 5`} className={`p-1 ${rating>=x?'text-[#EF805F]':'text-[#d7c7b8]'}`} onClick={()=>setRating(rating===x?0:x)}><Star fill={rating>=x?'currentColor':'none'} size={19}/></button>)}</div><div className="mt-2 flex flex-wrap gap-2">{['Great service','Thank you','Made my day'].map(s=><button key={s} onClick={()=>setMessage(s)} className={`rounded-full px-3 py-1.5 text-[10px] ${message===s?'bg-[#581C2B] text-white':'bg-[#f7eadb] text-[#65473a]'}`}>{s}</button>)}</div><textarea className="soft-input mt-3 min-h-[68px] resize-y text-sm" maxLength={240} placeholder="Write a kind note, if you like…" value={message} onChange={e=>setMessage(e.target.value)}/></div>
          {create.isError&&<p role="alert" className="mt-3 rounded-xl bg-[#fff0df] p-3 text-xs leading-5 text-[#8c3f32]">{apiErrorText(create.error,"Stripe test checkout could not be started. No payment was made.")}</p>}
         <button className="btn-primary mt-4 flex w-full items-center justify-center gap-2 py-4 disabled:cursor-not-allowed disabled:opacity-50" disabled={create.isPending} onClick={send}>{create.isPending?'Preparing checkout…':`Continue · ${(amount/1000).toFixed(3)} KWD`}<ArrowRight size={17}/></button>
        <p className="mt-3 text-center text-[10px] leading-4 text-[#8b7566]">Stripe test checkout only. No live payments.</p>
    </div>}</div></Shell>;
}
function ReceiptPage() {
 const {reference=''}=useParams(); const q=useGetTipReceipt(reference,{query:{queryKey:getGetTipReceiptQueryKey(reference)}}); const tip=q.data;
 const paid=tip?.status==='paid';
 const demoCompleted=tip?.status==='demo_completed';
 return <Shell pageClass="receipt-page"><div className="mx-auto max-w-[580px]"><PageTitle eyebrow="Receipt" title="Thank-you recorded." description="Payment status and reference."/>
  {q.isLoading?<div className="card-warm rounded-3xl p-8"><div className="skeleton h-24"/><div className="skeleton mt-4 h-32"/></div>:q.isError?<QueryError retry={()=>q.refetch()}/>:tip&&<div className="card-warm rounded-3xl p-7 text-center sm:p-10"><span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#f8e8d9] text-[#8b4d3a]"><Clock3 size={26}/></span><p className="mt-4 text-[10px] font-bold uppercase tracking-[.2em] text-[#ad6955]">{paid?'Stripe test payment':demoCompleted?'Simulated demo receipt':'Checkout record'}</p><p className="mt-3 font-[Manrope] text-4xl font-extrabold text-[#581C2B]">{KWD(tip.amountFils)}</p><p className="mt-2 text-sm text-[#765b4e]">A thank-you for <b>{tip.workerName}</b></p><p className="mt-1 text-xs text-[#80695b]">From {tip.customerName||'Anonymous'}</p><p className="mt-3 rounded-xl bg-[#fff0df] px-4 py-3 text-xs font-semibold leading-5 text-[#754832]">{paid?'Stripe test status verified. No live money moved.':demoCompleted?'Simulated university demo completed. No live money moved.':'No live money movement is represented by this receipt.'}</p><div className="my-6 border-t border-dashed border-[#ddcbb8]"/><dl className="grid grid-cols-2 gap-y-4 text-left text-sm"><dt className="text-[#80695b]">Reference</dt><dd className="text-right font-mono text-xs">{tip.reference}</dd><dt className="text-[#80695b]">Status</dt><dd className="text-right font-semibold">{paid?'Paid · Stripe test':demoCompleted?'Demo completed · simulated':tip.status}</dd><dt className="text-[#80695b]">Date</dt><dd className="text-right">{shortDate(tip.createdAt)}</dd>{tip.rating&&<><dt className="text-[#80695b]">Rating</dt><dd className="text-right">{tip.rating} / 5</dd></>}{tip.message&&<><dt className="text-[#80695b]">Message</dt><dd className="text-right">{tip.message}</dd></>}</dl><Link href="/" className="btn-primary mt-7 inline-flex items-center gap-2">Back to SANAD <ArrowRight size={15}/></Link></div>}</div></Shell>;
}

function CompanyPage() {
 const {isLoaded,isSignedIn}=useAuth();const qc=useQueryClient();
 const profile=useGetMyCompanyProfile({query:{enabled:!!isSignedIn,queryKey:getGetMyCompanyProfileQueryKey(),retry:false}});
 const create=useCreateMyCompanyProfile({mutation:{onSuccess:()=>qc.invalidateQueries({queryKey:getGetMyCompanyProfileQueryKey()})}});
 const dashboard=useGetMyCompanyDashboard({query:{enabled:!!isSignedIn&&profile.data?.company?.status==='approved',queryKey:getGetMyCompanyDashboardQueryKey()}});
 const [companyName,setCompanyName]=useState('');
 if(!isLoaded)return <Shell><LoadingCards/></Shell>;
 if(!isSignedIn)return <AuthPrompt title="Company accounts are private" detail="Sign in to apply for company verification or manage only the workers who requested to join your approved company."/>;
 if(profile.isLoading)return <Shell><LoadingCards/></Shell>;
 if(profile.isError)return <Shell><QueryError retry={()=>profile.refetch()}/></Shell>;
 const company=profile.data?.company;
  if(!company)return <Shell pageClass="company-entry"><PageTitle eyebrow="Company account" title="A space for your team." description="Apply for review to manage company workers."/><div className="grid gap-5 lg:grid-cols-[1fr_.8fr]"><Panel title="Company details"><form className="grid gap-3" onSubmit={e=>{e.preventDefault();create.mutate({data:{name:companyName.trim()}})}}><Field label="Registered company name" value={companyName} onChange={e=>setCompanyName(e.target.value)} placeholder="Business name"/><p className="text-xs leading-5 text-[#80695b]">Access opens after administrator review.</p><button className="btn-primary" disabled={create.isPending||companyName.trim().length<2}>{create.isPending?'Submitting application…':'Submit for review'}</button>{create.isError&&<p className="text-xs text-red-700">Application could not be submitted. Try again.</p>}</form></Panel><div className="rounded-[26px] bg-[#581C2B] p-7 text-[#fff4e5]"><BriefcaseBusiness size={24} className="text-[#ef805f]"/><h2 className="mt-5 font-[Manrope] text-2xl font-extrabold">Reviewed access.</h2><p className="mt-3 text-sm leading-6 text-[#ecd4c5]">Approval does not connect payments or enable payouts.</p></div></div></Shell>;
 if(company.status!=='approved')return <Shell demo><PageTitle eyebrow="Company verification" title={company.status==='pending'?'Application received.':'A review update is available.'} description={company.name}/><div className={`card-warm rounded-[26px] p-7 ${company.status==='pending'?'border-l-4 border-l-[#d8a752]':'border-l-4 border-l-[#bd765f]'}`}><div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#f5e8d8] text-[#88523e]"><Clock3/></span><div><h2 className="font-[Manrope] text-xl font-extrabold">{company.status==='pending'?'Waiting for administrator review':'Application not approved'}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[#765b4e]">{company.status==='pending'?'Your company profile is in the SANAD review queue. The dashboard unlocks after approval.':'Your company access remains closed. Contact SANAD support if you need clarification.'}</p><p className="mt-4 text-xs text-[#80695b]">Submitted {shortDate(company.createdAt)} · Status: <b>{company.status}</b></p></div></div></div></Shell>;
   return <Shell demo pageClass="company-dashboard"><PageTitle eyebrow="Company workspace" title={company.name} description="Team activity and monthly statements." action={<span className="rounded-full bg-[#e7efdf] px-3 py-2 text-[10px] font-bold text-[#527048]"><BadgeCheck className="mr-1 inline" size={13}/>Verified</span>}/><p className="mb-5 rounded-xl bg-[#fff0df] px-4 py-3 text-xs leading-5 text-[#754832]">Recorded activity only. No payments or payouts are processed.</p>{dashboard.isLoading?<LoadingCards/>:dashboard.isError?<QueryError retry={()=>dashboard.refetch()}/>:dashboard.data&&<><div className="company-metrics grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Workers" value={String(dashboard.data.workers.length)} icon={Users} detail="In this company"/><Stat label="Tips this month" value={KWD(dashboard.data.monthFils)} icon={Banknote} detail={`${dashboard.data.totalTips} recorded tips`}/><Stat label="Last month" value={KWD(dashboard.data.previousMonthFils)} icon={Clock3} detail="Company tip total"/><Stat label="Monthly statement" value={dashboard.data.settlements.find(s=>s.month===dashboard.data.settlementMonth)?.status||'No record'} icon={ClipboardCheck} detail={dashboard.data.settlementMonth}/></div><CompanyWorkerManagement onRefresh={()=>{qc.invalidateQueries({queryKey:getListCompanyWorkersQueryKey()});qc.invalidateQueries({queryKey:getGetMyCompanyDashboardQueryKey()})}}/><CompanySettlementTools dashboard={dashboard.data} onRefresh={()=>{qc.invalidateQueries({queryKey:getGetMyCompanyDashboardQueryKey()});qc.invalidateQueries({queryKey:getListSettlementsQueryKey()})}}/><div className="mt-5"><Panel title="Worker activity"><div className="space-y-3">{dashboard.data.workers.length===0?<Empty title="No worker activity" detail="Activity will appear after your invited workers accept."/>:dashboard.data.workers.map(item=><div key={item.worker.publicId} className="rounded-2xl bg-[#fff5e9] p-4"><div className="flex items-start justify-between gap-3"><div><b>{item.worker.name}</b><p className="mt-1 text-xs text-[#80695b]">{item.worker.jobTitle} · {item.worker.workplace}</p></div><span className="text-right"><b className="block text-sm">{KWD(item.monthFils)}</b><small className="text-[10px] text-[#80695b]">this month</small></span></div><div className="mt-3 flex items-center justify-between border-t border-[#eadbcc] pt-3 text-xs text-[#80695b]"><span>{item.totalTips} tips · {item.averageRating==null?'No rating':`${item.averageRating.toFixed(1)} / 5`}</span><span>{item.settlements.length} statements</span></div>{item.settlements.length>0&&<div className="mt-2 space-y-1">{item.settlements.map(s=><div key={s.id} className="flex justify-between text-[10px] text-[#80695b]"><span>{s.month} · {s.status}</span><span>{KWD(s.amountFils)}</span></div>)}</div>}</div>)}</div></Panel></div></>}</Shell>;
}

function CompanyWorkerManagement({onRefresh}:{onRefresh:()=>void}) {
 const qc=useQueryClient();
 const workers=useListCompanyWorkers({query:{queryKey:getListCompanyWorkersQueryKey()}});
 const refresh=()=>{onRefresh();qc.invalidateQueries({queryKey:getListCompanyWorkersQueryKey()})};
 const invite=useCreateCompanyWorkerInvitation({mutation:{onSuccess:refresh}});
 const update=useUpdateCompanyWorker({mutation:{onSuccess:refresh}});
 const resend=useResendCompanyWorkerInvitation({mutation:{onSuccess:refresh}});
 const revoke=useRevokeCompanyWorkerInvitation({mutation:{onSuccess:refresh}});
 const deactivate=useDeactivateCompanyWorker({mutation:{onSuccess:refresh}});
 const [name,setName]=useState(''),[email,setEmail]=useState(''),[jobTitle,setJobTitle]=useState(''),[department,setDepartment]=useState('');
 const redirectPath=`${import.meta.env.BASE_URL.replace(/\/$/,'')}/worker/invitation`;
 const sendInvite=(event:React.FormEvent)=>{event.preventDefault();invite.mutate({data:{name:name.trim(),emailAddress:email.trim(),jobTitle:jobTitle.trim()||null,department:department.trim()||null,redirectPath}},{onSuccess:()=>{setName('');setEmail('');setJobTitle('');setDepartment('')}})};
 return <div className="mt-5 grid gap-5 lg:grid-cols-[.82fr_1.18fr]">
  <Panel title="Invite a worker" aside={<span className="text-[10px] text-[#8a6e5e]">Verified company only</span>}><form className="grid gap-3" onSubmit={sendInvite}><Field label="Worker name" value={name} onChange={e=>setName(e.target.value)} placeholder="Name as it should appear"/><Field label="Clerk email address" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/><Field label="Job title" value={jobTitle} onChange={e=>setJobTitle(e.target.value)} placeholder="Optional"/><Field label="Department" value={department} onChange={e=>setDepartment(e.target.value)} placeholder="Optional"/><p className="text-[11px] leading-5 text-[#80695b]">The invitation goes to this verified email. A public worker QR appears only after the worker accepts.</p><button className="btn-primary" disabled={invite.isPending||name.trim().length<2||!email.includes('@')}>{invite.isPending?'Sending invitation…':'Send invitation'}</button></form>{invite.isError&&<p className="mt-3 rounded-xl bg-[#fff0df] px-3 py-2 text-xs leading-5 text-[#8c3f32]">{mutationMessage(invite.error,'The invitation could not be sent. Clerk did not confirm delivery; review the server message and try again.')}</p>}</Panel>
  <Panel title="Company-managed workers" aside={<span className="text-[10px] text-[#8a6e5e]">{workers.data?.length||0} records</span>}>{workers.isLoading?<ListSkeleton/>:workers.isError?<QueryError retry={()=>workers.refetch()}/>:!workers.data?.length?<Empty title="No workers invited yet" detail="Workers invited by your company will appear here with their invitation and account status."/>:<div className="space-y-3">{workers.data.map(worker=><CompanyWorkerRow key={worker.workerId} worker={worker} update={update} resend={resend} revoke={revoke} deactivate={deactivate} redirectPath={redirectPath}/>)}</div>}{[update,resend,revoke,deactivate].some(m=>m.isError)&&<p className="mt-3 rounded-xl bg-[#fff0df] px-3 py-2 text-xs leading-5 text-[#8c3f32]">The worker record could not be updated. {mutationMessage([update,resend,revoke,deactivate].find(m=>m.isError)?.error,'Please try again.')}</p>}</Panel>
 </div>;
}

function mutationMessage(error:unknown,fallback:string) {
 if(error&&typeof error==='object'&&'message'in error&&typeof error.message==='string')return error.message;
 return fallback;
}

function CompanyWorkerRow({worker,update,resend,revoke,deactivate,redirectPath}:{worker:import('@workspace/api-client-react').CompanyManagedWorker;update:ReturnType<typeof useUpdateCompanyWorker>;resend:ReturnType<typeof useResendCompanyWorkerInvitation>;revoke:ReturnType<typeof useRevokeCompanyWorkerInvitation>;deactivate:ReturnType<typeof useDeactivateCompanyWorker>;redirectPath:string}) {
 const [name,setName]=useState(worker.name),[jobTitle,setJobTitle]=useState(worker.jobTitle),[department,setDepartment]=useState(worker.department||'');
 const statusClass=worker.status==='active'?'bg-[#eaf0e3] text-[#527048]':worker.status==='deactivated'?'bg-[#f6e2dc] text-[#984d3b]':'bg-[#fff0df] text-[#865532]';
 return <article className="rounded-2xl bg-[#fff5e9] p-4" data-testid={`company-worker-${worker.workerId}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><b>{worker.name}</b><p className="mt-1 text-xs text-[#80695b]">{worker.emailAddress||'Email not available'} · {worker.jobTitle||'Role not set'}{worker.department?` · ${worker.department}`:''}</p><p className="mt-1 text-[10px] text-[#917666]">{worker.invitationStatus?`Invitation ${worker.invitationStatus}`:'Legacy worker'}{worker.invitationExpiresAt?` · expires ${shortDate(worker.invitationExpiresAt)}`:''}</p></div><span className={`rounded-full px-3 py-1.5 text-[10px] font-bold ${statusClass}`}>{worker.status}</span></div>
  <details className="mt-3 border-t border-[#eadbcc] pt-3"><summary className="cursor-pointer text-xs font-bold text-[#581C2B]">Edit worker details</summary><div className="mt-3 grid gap-2 sm:grid-cols-3"><Field label="Name" value={name} onChange={e=>setName(e.target.value)}/><Field label="Job title" value={jobTitle} onChange={e=>setJobTitle(e.target.value)}/><Field label="Department" value={department} onChange={e=>setDepartment(e.target.value)}/></div><button className="mt-3 rounded-full border border-[#ddc4b2] px-4 py-2 text-xs font-bold text-[#581C2B]" disabled={update.isPending||name.trim().length<2} onClick={()=>update.mutate({workerId:worker.workerId,data:{name:name.trim(),jobTitle:jobTitle.trim()||null,department:department.trim()||null}})}>Save details</button></details>
  <div className="mt-3 flex flex-wrap gap-2">{worker.status==='invited'&&<><button className="rounded-full border border-[#ddc4b2] px-3 py-2 text-xs font-bold" disabled={resend.isPending||!worker.emailAddress} onClick={()=>resend.mutate({workerId:worker.workerId,data:{redirectPath}})}>{worker.invitationStatus==='revoked'?'Send replacement invitation':'Resend invitation'}</button>{worker.invitationStatus!=='revoked'&&<button className="rounded-full border border-[#dcbab0] px-3 py-2 text-xs font-bold text-[#984d3b]" disabled={revoke.isPending} onClick={()=>{if(window.confirm(`Revoke the pending invitation for ${worker.name}?`))revoke.mutate({workerId:worker.workerId})}}>Revoke</button>}</>}{worker.status==='active'&&<button className="rounded-full border border-[#dcbab0] px-3 py-2 text-xs font-bold text-[#984d3b]" disabled={deactivate.isPending} onClick={()=>{if(window.confirm(`Deactivate ${worker.name}? Their private dashboard and public QR will be disabled.`))deactivate.mutate({workerId:worker.workerId})}}>Deactivate worker</button>}</div>
 </article>;
}

function WorkerInvitationPage() {
 return <Shell pageClass="invitation-page"><PageTitle eyebrow="Worker invitation" title="Your team invited you." description="Sign in with the invited email to review and accept."/><div className="mx-auto max-w-2xl"><WorkerInvitationCard/></div></Shell>;
}

function CompanySettlementTools({dashboard,onRefresh}:{dashboard:import('@workspace/api-client-react').CompanyDashboard;onRefresh:()=>void}) {
 const month=dashboard.settlementMonth;
 const [salary,setSalary]=useState<Record<number,string>>({});
 const [adjustments,setAdjustments]=useState<Record<number,string>>({});
 const create=useCreateCompanySettlements({mutation:{onSuccess:onRefresh}});
 const update=useUpdateCompanySettlement({mutation:{onSuccess:onRefresh}});
 const candidates=dashboard.settlementCandidates;
 const submit=()=>create.mutate({data:{month,workers:candidates.map(c=>({workerId:c.workerId,salaryFils:Math.max(0,amountInKwd(salary[c.workerId]||'0')),adjustmentsFils:amountInKwd(adjustments[c.workerId]||'0')}))}});
 const actions=(s:import('@workspace/api-client-react').Settlement)=>{
   if(s.status==='pending')return [{label:'Approve',status:'approved' as const},{label:'Reject',status:'rejected' as const}];
   if(s.status==='approved')return [{label:'Mark processing',status:'processing' as const},{label:'Reject',status:'rejected' as const}];
   if(s.status==='processing')return [{label:'Mark paid',status:'paid' as const},{label:'Reject',status:'rejected' as const}];
   return [];
 };
 return <div className="mt-5 grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
  <Panel title="Create monthly statements" aside={<span className="text-[10px] text-[#8a6e5e]">Company scope only</span>}>
   <p className="mb-4 text-xs leading-5 text-[#80695b]">Eligible tip amounts are supplied by SANAD. Enter salary and adjustments per worker. The company remains responsible for actual payroll; creating a statement does not pay anyone.</p>
   <div className="mb-4 max-w-[210px]"><Field label="Completed statement month" type="month" value={month} readOnly disabled/></div>
   {candidates.length===0?<Empty title="No eligible settlement candidates" detail="Unsettled company tips will appear here when available."/>:<div className="space-y-3">{candidates.map(candidate=><div key={candidate.workerId} className="rounded-2xl bg-[#fff5e9] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><b>{candidate.worker.name}</b><p className="mt-1 text-xs text-[#80695b]">{candidate.worker.jobTitle} · {candidate.worker.workplace}</p></div><div className="text-right"><b className="text-sm">{KWD(candidate.tipsFils)}</b><p className="text-[10px] text-[#80695b]">{candidate.tipCount} eligible tips</p></div></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Salary (KWD)" type="number" min="0" step=".001" value={salary[candidate.workerId]??'0.000'} onChange={e=>setSalary(v=>({...v,[candidate.workerId]:e.target.value}))}/><Field label="Adjustment (KWD, plus or minus)" type="number" step=".001" value={adjustments[candidate.workerId]??'0.000'} onChange={e=>setAdjustments(v=>({...v,[candidate.workerId]:e.target.value}))}/></div></div>)}</div>}
   <button className="btn-primary mt-4" disabled={create.isPending||!candidates.length||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)} onClick={submit}>{create.isPending?'Creating statements…':'Create statements for eligible workers'}</button>{create.isError&&<p className="mt-2 text-xs text-red-700">Statements could not be created. Check the entered amounts, then retry.</p>}
   <p className="mt-3 rounded-xl bg-[#fff0df] px-3 py-2 text-[11px] leading-5 text-[#754832]">Demo only: no money moves. The company remains responsible for actual payroll.</p>
  </Panel>
  <Panel title="Company statements" aside={<span className="text-[10px] text-[#8a6e5e]">Current and historical</span>}>{dashboard.settlements.length===0?<Empty title="No statements yet" detail="Created monthly statements will appear here for company-scoped review."/>:<div className="space-y-3">{dashboard.settlements.map(s=><div key={s.id} className="rounded-2xl bg-[#fff5e9] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><b>{s.workerName}</b><p className="mt-1 text-xs text-[#80695b]">{s.month} · {s.companyName||dashboard.company.name}</p></div><span className="rounded-full bg-[#f2e5d5] px-3 py-1 text-[10px] font-bold uppercase tracking-wide">{s.status}</span></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><span>Salary <b className="block">{KWD(s.salaryFils)}</b></span><span>Tips <b className="block">{KWD(s.tipsFils)}</b></span><span>Adjustments <b className="block">{KWD(s.adjustmentsFils)}</b></span><span>Total <b className="block text-[#581C2B]">{KWD(s.amountFils)}</b></span></div><p className="mt-2 text-[10px] text-[#80695b]">{s.tipCount??0} tips included · status only, not a payment</p>{actions(s).length>0&&<div className="mt-3 flex flex-wrap gap-2">{actions(s).map(action=><button key={action.status} className={`rounded-full px-3 py-2 text-xs font-bold ${action.status==='rejected'?'bg-[#f6e2dc] text-[#984d3b]':'bg-[#e5efdf] text-[#456c42]'}`} disabled={update.isPending} onClick={()=>update.mutate({id:s.id,data:{status:action.status}})}>{action.label}</button>)}</div>}</div>)}</div>}{update.isError&&<p className="mt-3 text-xs text-red-700">Could not update statement status. Refresh and retry.</p>}<p className="mt-3 text-[10px] leading-4 text-[#80695b]">Review status choices are approved, processing, paid, or rejected; no status update initiates a payment.</p></Panel>
 </div>;
}

function ChildSelect({ children, onChange, value }: { children?: Child[]; onChange:(e:React.ChangeEvent<HTMLSelectElement>)=>void; value:string }) { return <SelectField label="Child profile" value={value} onChange={onChange}><option value="">Choose profile</option>{children?.map(c=><option key={c.id} value={c.id}>{c.name} · age {c.age}</option>)}</SelectField>; }
function ChildQrCard({ child }: { child: Child }) {
 const [copied,setCopied]=useState(false);
 const firstName=child.name.trim().split(/\s+/)[0]||'Child';
 const url=publicUrlForPath(`/give/${child.publicId}`);
 const copyLink=async()=>{try{await navigator.clipboard.writeText(url);setCopied(true)}catch{setCopied(false)}};
 return <div className="flex flex-col gap-4 rounded-2xl bg-[#fff5e9] p-4 sm:flex-row sm:items-center">
  <div className="grid shrink-0 place-items-center rounded-2xl border-[5px] border-white bg-[#f6e7d5] p-2 shadow-inner"><QRCodeSVG value={url} size={104} level="M" fgColor="#581C2B" bgColor="#F6E7D5" title={`SANAD direct transfer QR for ${firstName}`}/></div>
   <div className="min-w-0 flex-1"><p className="font-[Manrope] text-lg font-extrabold">{firstName}</p><p className="mt-1 text-xs leading-5 text-[#80695b]">Checkout is either Stripe test or explicitly simulated. Neither option moves live money.</p><p className="mt-2 break-all font-mono text-[10px] text-[#8a6e5e]">{url}</p><div className="mt-3 flex flex-wrap gap-2"><Link className="btn-primary text-xs" href={`/give/${child.publicId}`}>Open transfer page <ArrowRight className="ml-1 inline" size={13}/></Link><button className="flex items-center gap-1 rounded-full border border-[#e0cdbb] px-3 py-2 text-xs font-bold" onClick={copyLink}><Copy size={13}/>{copied?'Copied':'Copy QR link'}</button></div></div>
 </div>;
}
function FamilyPage() {
  const qc=useQueryClient();
  const [,go]=useLocation();
  const childrenQ=useListChildren({query:{queryKey:getListChildrenQueryKey()}});
  const [selected,setSelected]=useState(''); const current=selected||String(childrenQ.data?.[0]?.id||'');
  const childId=Number(current||0);
  const dash=useGetChildDashboard(childId,{query:{enabled:!!childId,queryKey:getGetChildDashboardQueryKey(childId)}});
  const createChild=useCreateChild({mutation:{onSuccess:()=>qc.invalidateQueries({queryKey:getListChildrenQueryKey()})}});
  const allowance=useCreateAllowance({mutation:{onSuccess:()=>qc.invalidateQueries({queryKey:getGetChildDashboardQueryKey(childId)})}});
  const updateChild=useUpdateChild({mutation:{onSuccess:()=>{qc.invalidateQueries({queryKey:getGetChildDashboardQueryKey(childId)});qc.invalidateQueries({queryKey:getListChildrenQueryKey()})}}});
  const goal=useCreateSavingsGoal({mutation:{onSuccess:()=>qc.invalidateQueries({queryKey:getGetChildDashboardQueryKey(childId)})}});
  const contribute=useContributeToSavingsGoal({mutation:{onSuccess:()=>qc.invalidateQueries({queryKey:getGetChildDashboardQueryKey(childId)})}});
  const topup=useCreatePaymentCheckout();
  const updateApproval=useUpdateApprovalRequest({mutation:{onSuccess:()=>qc.invalidateQueries({queryKey:getGetChildDashboardQueryKey(childId)})}});
  const updateCashOut=useUpdateCashOutRequest({mutation:{onSuccess:()=>qc.invalidateQueries({queryKey:getGetChildDashboardQueryKey(childId)})}});
  const [childName,setChildName]=useState(''),[childAge,setChildAge]=useState('10'),[limit,setLimit]=useState('10.000');
  const [allowanceAmount,setAllowanceAmount]=useState('5.000'),[allowanceKind,setAllowanceKind]=useState<'allowance'|'eidiyah'>('allowance');
  const [goalName,setGoalName]=useState(''),[goalTarget,setGoalTarget]=useState('20.000'),[contribution,setContribution]=useState('1.000');
  const submitChild=()=>createChild.mutate({data:{name:childName.trim(),age:Number(childAge),spendingLimitFils:amountInKwd(limit)}},{onSuccess:c=>{setChildName('');setSelected(String(c.id));}});
  const d=dash.data;
  return <Shell demo pageClass="family-dashboard"><PageTitle eyebrow="Family wallet" title="Guide their next step." description="Allowance, savings goals, and spending approvals." action={<span className="rounded-full bg-[#f8e7db] px-3 py-2 text-[10px] font-semibold text-[#94523d]">Parent space</span>}/>
   <div className="mb-5 rounded-xl bg-[#fff0df] px-4 py-3 text-xs leading-5 text-[#754832]">Demo only. Approvals and cash-out requests do not move money.</div>
   {d&&<div className="family-overview mb-5 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center rounded-[24px] bg-[#581C2B] px-5 py-5 text-[#fff4e5] md:px-7"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#f1b99d]">Selected wallet · {d.child.name}</p><p className="mt-2 font-[Manrope] text-3xl font-extrabold">{KWD(d.availableBalanceFils)}</p><p className="mt-1 text-xs text-[#ead0bd]">Available demo balance</p></div><div className="flex gap-5 sm:gap-8"><div><b className="block text-xl">{d.goals.length}</b><span className="text-[10px] text-[#ead0bd]">Goals</span></div><div><b className="block text-xl">{d.approvals.filter(a=>a.status==='pending').length}</b><span className="text-[10px] text-[#ead0bd]">To review</span></div><div><b className="block text-xl">{d.activity.length}</b><span className="text-[10px] text-[#ead0bd]">Activity</span></div></div></div>}
   <div className="mb-5 grid gap-5 lg:grid-cols-[.7fr_1.3fr]">
    <Panel title="Add a child"><div className="grid gap-3"><Field label="Child’s name" value={childName} onChange={e=>setChildName(e.target.value)} placeholder="First and last name"/><div className="grid grid-cols-2 gap-3"><Field label="Age" type="number" min="5" max="17" value={childAge} onChange={e=>setChildAge(e.target.value)}/><Field label="Monthly limit (KWD)" type="number" min="0" step=".001" value={limit} onChange={e=>setLimit(e.target.value)}/></div><button className="btn-primary flex items-center justify-center gap-2 text-sm" disabled={createChild.isPending||childName.trim().length<2} onClick={submitChild}>{createChild.isPending?'Creating profile…':<><Plus size={15}/> Create profile</>}</button>{createChild.isError&&<p className="text-xs text-red-700">Could not create this profile. Try again.</p>}</div></Panel>
     <Panel title="Your family profiles" aside={<span className="text-[10px] text-[#8a6e5e]">Private to your parent account</span>}>{childrenQ.isLoading?<ListSkeleton/>:childrenQ.isError?<QueryError retry={()=>childrenQ.refetch()}/>:childrenQ.data?.length?<><div className="mb-4 max-w-xs"><ChildSelect children={childrenQ.data} value={current} onChange={e=>setSelected(e.target.value)}/></div><div className="grid gap-3 sm:grid-cols-2">{childrenQ.data.map(child=><div key={child.id} className="rounded-2xl bg-[#fff5e9] p-4"><div className="flex items-center justify-between gap-3"><div><b>{child.name}</b><p className="text-xs text-[#80695b]">Age {child.age} · {KWD(child.balanceFils)} balance</p></div><Link href={`/child/${child.id}`} className="rounded-full bg-[#581C2B] px-3 py-2 text-[10px] font-bold text-white">Supervised view</Link></div><div className="mt-3 border-t border-[#eadbcc] pt-3"><button className="btn-coral flex w-full items-center justify-center gap-2 py-2.5 text-xs disabled:opacity-50" disabled={topup.isPending} onClick={()=>topup.mutate({data:{flow:'child_topup',childId:child.id,amountFils:5000,idempotencyKey:crypto.randomUUID()}},{onSuccess:payment=>{qc.setQueryData(getGetPaymentCheckoutQueryKey(payment.paymentId),payment);go(`/checkout/${payment.paymentId}`)}})}><Plus size={14}/> Add 5.000 KWD</button></div></div>)}</div>{topup.isError&&<p className="mt-3 text-xs text-red-700">Could not prepare the child top-up checkout. Try again.</p>}</>:<Empty title="Start your family wallet" detail="Create a child profile to set up allowances, QR links, and savings goals."/>}</Panel>
   </div>
    {childrenQ.data&&childrenQ.data.length>0&&<div className="mb-5"><Panel title="Child QR codes" aside={<span className="text-[10px] text-[#8a6e5e]">Public send links</span>}><p className="mb-4 text-xs leading-5 text-[#80695b]">Checkout identifies Stripe test or simulated flow. No live money moves.</p><div className="grid gap-3 lg:grid-cols-2">{childrenQ.data.map(child=><ChildQrCard key={child.id} child={child}/>)}</div></Panel></div>}
    {dash.isLoading?<LoadingCards/>:dash.isError?<QueryError retry={()=>dash.refetch()}/>:null}
    {d&&<><div className="grid gap-4 sm:grid-cols-3"><Stat label="Wallet balance" value={KWD(d.child.balanceFils)} icon={Wallet} detail="Simulated wallet only"/><Stat label="Spending limit" value={KWD(d.child.spendingLimitFils)} icon={Banknote} detail="Monthly guidance"/><Stat label="Savings goals" value={String(d.goals.length)} icon={Sparkles} detail="Keep a small goal in sight"/></div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <Panel title="Allowance & Eidiyah"><div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><SelectField label="Record type" value={allowanceKind} onChange={e=>setAllowanceKind(e.target.value as 'allowance'|'eidiyah')}><option value="allowance">Allowance</option><option value="eidiyah">Eidiyah</option></SelectField><Field label="Amount (KWD)" type="number" min=".001" step=".001" value={allowanceAmount} onChange={e=>setAllowanceAmount(e.target.value)}/><button className="btn-primary text-xs" disabled={allowance.isPending||amountInKwd(allowanceAmount)<1} onClick={()=>allowance.mutate({id:childId,data:{kind:allowanceKind,amountFils:amountInKwd(allowanceAmount)}})}>Add to wallet</button></div><div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"><Field label="Monthly spending limit (KWD)" type="number" min="0" step=".001" value={limit} onChange={e=>setLimit(e.target.value)}/><button className="rounded-full border border-[#ddc4b2] px-4 py-2.5 text-xs font-bold" disabled={updateChild.isPending} onClick={()=>updateChild.mutate({id:childId,data:{spendingLimitFils:amountInKwd(limit)}})}>Save limit</button></div>{(allowance.isError||updateChild.isError)&&<p className="mt-2 text-xs text-red-700">Could not save this change. Try again.</p>}</Panel>
      <Panel title="Savings goals"><form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={e=>{e.preventDefault();goal.mutate({id:childId,data:{name:goalName.trim(),targetFils:amountInKwd(goalTarget)}},{onSuccess:()=>setGoalName('')})}}><Field label="Goal name" value={goalName} onChange={e=>setGoalName(e.target.value)} placeholder="A bicycle"/><Field label="Target (KWD)" type="number" min=".001" step=".001" value={goalTarget} onChange={e=>setGoalTarget(e.target.value)}/><button className="btn-primary text-xs" disabled={goal.isPending||goalName.trim().length<2}>Create goal</button></form>{d.goals.length===0?<div className="mt-4"><Empty title="No savings goals yet" detail="Create a small, specific goal to make saving tangible."/></div>:<div className="mt-4 space-y-2">{d.goals.map(g=><div key={g.id} className="grid gap-3 rounded-xl bg-[#fff5e9] p-3 sm:grid-cols-[1fr_140px_auto] sm:items-end"><GoalRow name={g.name} saved={g.savedFils} target={g.targetFils}/><Field label="Add (KWD)" type="number" min=".001" step=".001" value={contribution} onChange={e=>setContribution(e.target.value)}/><button className="rounded-full border border-[#ddc4b2] px-3 py-2 text-xs font-bold" disabled={contribute.isPending} onClick={()=>contribute.mutate({id:childId,goalId:g.id,data:{amountFils:amountInKwd(contribution)}})}>Contribute</button></div>)}</div>}</Panel>
      <Panel title="Purchase requests"><p className="mb-3 text-xs text-[#80695b]">The child can send a request from their supervised wallet page.</p>{d.approvals.length===0?<Empty title="All caught up" detail="No purchase requests are waiting for a parent decision."/>:<div className="space-y-2">{d.approvals.map(a=><div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#fff5e9] px-4 py-3"><div><b className="text-sm">{a.item}</b><p className="text-xs text-[#80695b]">{KWD(a.amountFils)} · {a.status}</p></div>{a.status==='pending'&&<div className="flex gap-2"><button className="rounded-full bg-[#e5efdf] px-3 py-2 text-xs font-bold text-[#456c42]" onClick={()=>updateApproval.mutate({id:a.id,data:{status:'approved'}})}>Approve</button><button className="rounded-full bg-[#f6e2dc] px-3 py-2 text-xs font-bold text-[#984d3b]" onClick={()=>updateApproval.mutate({id:a.id,data:{status:'rejected'}})}>Reject</button></div>}</div>)}</div>}</Panel>
      <Panel title="Cash-out requests" aside={<span className="text-[10px] text-[#8a6e5e]">Simulated only</span>}>{d.cashOutRequests.length===0?<Empty title="No cash-out requests" detail="Requests from the supervised child wallet will appear here."/>:<div className="space-y-2">{d.cashOutRequests.map(r=><div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#fff5e9] px-4 py-3"><div><b className="text-sm">{KWD(r.amountFils)} · {r.reason}</b><p className="text-xs text-[#80695b]">{r.status} · {dateLabel(r.createdAt)}</p></div>{r.status==='pending'&&<div className="flex gap-2"><button className="rounded-full bg-[#e5efdf] px-3 py-2 text-xs font-bold text-[#456c42]" onClick={()=>updateCashOut.mutate({id:r.id,data:{status:'approved'}})}>Approve</button><button className="rounded-full bg-[#f6e2dc] px-3 py-2 text-xs font-bold text-[#984d3b]" onClick={()=>updateCashOut.mutate({id:r.id,data:{status:'rejected'}})}>Reject</button></div>}</div>)}</div>}<p className="mt-3 text-[11px] leading-5 text-[#80695b]">Cash-outs are simulated. Approval does not pay funds; no payout has been made.</p></Panel>
    </div><div className="mt-5"><Panel title="Recent family activity">{d.activity.length===0?<Empty title="No activity yet" detail="Allowance, Eidiyah, savings, and simulated transfers will appear here."/>:<div className="divide-y divide-[#f0e2d4]">{d.activity.map(a=><div key={a.id} className="flex items-center justify-between py-3"><div><p className="text-sm font-semibold">{a.title}</p><p className="text-xs text-[#80695b]">{a.kind} · {dateLabel(a.createdAt)}</p></div><b>{KWD(a.amountFils)}</b></div>)}</div>}</Panel></div></>}
  </Shell>;
}
function GoalRow({name,saved,target}:{name:string;saved:number;target:number}) {
 const pct=target?Math.min(100,Math.round(saved/target*100)):0;
 return <div className="rounded-xl bg-[#fff5e9] px-4 py-3"><div className="flex items-center justify-between gap-2"><div><p className="text-sm font-semibold">{name}</p><p className="text-[10px] text-[#80695b]">{KWD(saved)} saved of {KWD(target)}</p></div><span className="text-[10px] text-[#8a6e5e]">Read-only</span></div><div className="mt-2 h-1.5 rounded-full bg-[#eadbcc]"><div className="h-1.5 rounded-full bg-[#EF805F]" style={{width:`${pct}%`}}/></div></div>;
}
function ChildPage() {
 const {id=''}=useParams(); const childId=Number(id);
 const qc=useQueryClient();
 const dashboard=useGetChildDashboard(childId,{query:{enabled:Number.isFinite(childId)&&childId>0,queryKey:getGetChildDashboardQueryKey(childId)}});
 const makeApproval=useCreateApprovalRequest({mutation:{onSuccess:()=>qc.invalidateQueries({queryKey:getGetChildDashboardQueryKey(childId)})}});
 const cashOut=useCreateCashOutRequest({mutation:{onSuccess:()=>qc.invalidateQueries({queryKey:getGetChildDashboardQueryKey(childId)})}});
 const [item,setItem]=useState(''),[purchaseAmount,setPurchaseAmount]=useState(''),[cashAmount,setCashAmount]=useState(''),[reason,setReason]=useState('');
 const d=dashboard.data;
 return <Shell demo pageClass="child-dashboard"><PageTitle eyebrow="Supervised wallet" title={d?`${d.child.name}’s wallet.`:'Child wallet'} description="Goals, spending requests, and family activity."/>
  <div className="mb-5 rounded-xl bg-[#fff0df] px-4 py-3 text-xs leading-5 text-[#754832]">Demo wallet only. Requests are reviewed by a parent; no payout is made.</div>
 {dashboard.isLoading?<LoadingCards/>:dashboard.isError?<QueryError retry={()=>dashboard.refetch()}/>:d&&<><div className="child-wallet-hero rounded-[28px] bg-[#581C2B] p-6 text-[#fff4e5] md:p-9"><div className="flex flex-wrap items-start justify-between gap-4"><div><span className="text-[10px] font-bold uppercase tracking-[.2em] text-[#efbda3]">Available to spend</span><p className="mt-3 font-[Manrope] text-4xl font-extrabold">{KWD(d.availableBalanceFils)}</p><p className="mt-2 text-xs text-[#ead0bd]">Reserved requests are not available</p></div><div className="text-right"><span className="text-[10px] text-[#e6c6ae]">Savings goals</span><p className="mt-2 font-[Manrope] text-3xl font-extrabold">{d.goals.length}</p></div></div><div className="mt-6 flex flex-wrap gap-2">{d.goals.map(g=><span key={g.id} className="rounded-full bg-white/10 px-3 py-2 text-xs">{g.name} · {KWD(g.savedFils)} / {KWD(g.targetFils)}</span>)}</div></div>
  <div className="mt-5 grid gap-5 lg:grid-cols-2">
   <Panel title="Ask parent"><form className="grid gap-3" onSubmit={e=>{e.preventDefault();makeApproval.mutate({id:childId,data:{item:item.trim(),amountFils:amountInKwd(purchaseAmount)}},{onSuccess:()=>{setItem('');setPurchaseAmount('')}})}}><Field label="What would you like?" value={item} onChange={e=>setItem(e.target.value)} placeholder="A book"/><Field label="Amount (KWD)" type="number" min=".001" step=".001" value={purchaseAmount} onChange={e=>setPurchaseAmount(e.target.value)}/><button className="btn-primary flex items-center justify-center gap-2 text-sm" disabled={makeApproval.isPending||item.trim().length<2||amountInKwd(purchaseAmount)<1}><ClipboardCheck size={15}/> Send for approval</button></form>{makeApproval.isError&&<p className="mt-2 text-xs text-red-700">Could not submit request. Try again.</p>}</Panel>
   <Panel title="Request simulated cash-out"><form className="grid gap-3" onSubmit={e=>{e.preventDefault();cashOut.mutate({id:childId,data:{amountFils:amountInKwd(cashAmount),reason:reason.trim()}},{onSuccess:()=>{setCashAmount('');setReason('')}})}}><Field label="Amount (KWD)" type="number" min=".001" step=".001" value={cashAmount} onChange={e=>setCashAmount(e.target.value)}/><Field label="Why do you need it?" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Tell your parent what it is for"/><button className="btn-primary flex items-center justify-center gap-2 text-sm" disabled={cashOut.isPending||amountInKwd(cashAmount)<1||reason.trim().length<4}><CircleDollarSign size={15}/> Request review</button></form>{cashOut.isError&&<p className="mt-2 text-xs text-red-700">Could not create request. Check available balance and try again.</p>}</Panel>
   <Panel title="Purchase request status">{d.approvals.length?<div className="space-y-2">{d.approvals.map(a=><div key={a.id} className="flex items-center justify-between rounded-xl bg-[#fff5e9] px-4 py-3"><div><b className="text-sm">{a.item}</b><p className="text-xs text-[#80695b]">{KWD(a.amountFils)} · {dateLabel(a.createdAt)}</p></div><span className={`rounded-full px-3 py-1 text-[10px] font-bold ${a.status==='approved'?'bg-[#e3f0df] text-[#456c42]':a.status==='rejected'?'bg-[#f6e2dc] text-[#984d3b]':'bg-[#f7ebd8] text-[#835e32]'}`}>{a.status}</span></div>)}</div>:<Empty title="No purchase requests" detail="Your requests and your parent’s decision will appear here."/>}</Panel>
   <Panel title="Cash-out request status" aside={<span className="text-[10px] text-[#8a6e5e]">Simulated only</span>}>{d.cashOutRequests.length?<div className="space-y-2">{d.cashOutRequests.map(r=><div key={r.id} className="flex items-center justify-between rounded-xl bg-[#fff5e9] px-4 py-3"><div><b className="text-sm">{KWD(r.amountFils)} · {r.reason}</b><p className="text-xs text-[#80695b]">{dateLabel(r.updatedAt)}</p></div><span className={`rounded-full px-3 py-1 text-[10px] font-bold ${r.status==='approved'?'bg-[#e3f0df] text-[#456c42]':r.status==='rejected'?'bg-[#f6e2dc] text-[#984d3b]':'bg-[#f7ebd8] text-[#835e32]'}`}>{r.status}</span></div>)}</div>:<Empty title="No cash-out requests" detail="Your request and parent review status will show here."/>}<p className="mt-3 text-[11px] leading-5 text-[#80695b]">Cash-outs are simulated. Pending and approved amounts stay reserved. Approval does not pay funds; no payout was made.</p></Panel>
   <div className="lg:col-span-2"><Panel title="Activity history"><div className="space-y-1">{d.activity.length?d.activity.map(a=><div key={a.id} className="flex items-center justify-between border-b border-[#f0e2d4] py-3"><div><p className="text-sm font-semibold">{a.title}</p><p className="text-xs text-[#80695b]">{a.kind} · {dateLabel(a.createdAt)}</p></div><b className="text-sm">{KWD(a.amountFils)}</b></div>):<Empty title="Your story starts here" detail="Allowance, Eidiyah, savings, and purchases will show here."/ >}</div></Panel></div>
  </div></>}
 </Shell>;
}

function ChildTransferPage() {
 const {publicId=''}=useParams();
 const recipient=useGetPublicChildRecipient(publicId,{query:{queryKey:getGetPublicChildRecipientQueryKey(publicId)}});
  const create=useCreatePaymentCheckout(); const [,go]=useLocation(); const qc=useQueryClient();
 const [amount,setAmount]=useState('0.500');
 const rawAmount=Number(amount)*1000;
 const amountFils=Math.round(rawAmount);
 const validAmount=Number.isFinite(rawAmount)&&Math.abs(rawAmount-amountFils)<0.0001&&amountFils>=250&&amountFils<=1_000_000;
  const send=()=>create.mutate({data:{flow:'child_qr_transfer',publicId,amountFils,idempotencyKey:crypto.randomUUID()}},{onSuccess:payment=>{qc.setQueryData(getGetPaymentCheckoutQueryKey(payment.paymentId),payment);go(`/checkout/${payment.paymentId}`)}});

 return <Shell demo publicPage><div className="mx-auto max-w-[540px]">
  {recipient.isLoading?<div className="card-warm rounded-[30px] p-7"><div className="skeleton h-24"/><div className="skeleton mt-4 h-48"/></div>:recipient.isError?<div className="card-warm rounded-[30px] p-7 text-center"><QrCode className="mx-auto mb-3 text-[#EF805F]" size={28}/><h1 className="font-[Manrope] text-xl font-extrabold">This child QR is not available</h1><p className="mt-2 text-sm text-[#765b4e]">Ask the family to share a current QR code.</p><Link href="/" className="btn-primary mt-5 inline-flex">Return to SANAD</Link></div>:recipient.data&&<div className="card-warm overflow-hidden rounded-[30px] p-5 sm:p-7">
   <div className="flex items-center justify-between"><Brand compact tone="dark"/><span className="rounded-full bg-[#f7e9dc] px-3 py-1.5 text-[10px] font-bold text-[#82583f]"><ShieldAlert size={12} className="mr-1 inline"/>TEST / DEMO</span></div>
    <>
     <div className="mt-5 rounded-[22px] bg-white p-4 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#b66e59]">Recipient</p><h1 className="mt-1 font-[Manrope] text-2xl font-extrabold text-[#3B1720]">{recipient.data.firstName}</h1><p className="mt-1 text-xs text-[#80695b]">SANAD child wallet</p></div>
     <div className="my-4 rounded-xl bg-[#fff0df] p-3 text-xs leading-5 text-[#76543d]"><b>No SANAD account needed.</b> Checkout will identify Stripe test or an explicitly simulated option. Neither moves live money.</div>
    <h2 className="font-[Manrope] text-lg font-extrabold">Choose an amount</h2>
    <div className="mt-3 grid grid-cols-3 gap-2">{[250,500,1000].map(fils=>{const value=(fils/1000).toFixed(3);return <button key={fils} type="button" onClick={()=>setAmount(value)} className={`rounded-2xl border px-2 py-3 transition ${amount===value?'border-[#EF805F] bg-[#fff0e7] text-[#581C2B] ring-1 ring-[#EF805F]':'border-[#eadbcc] bg-white'}`}><b className="block text-lg">{value}</b><span className="text-[10px] text-[#80695b]">KWD</span></button>})}</div>
    <Field label="Custom amount in KWD" type="number" min=".250" max="1000" step=".001" value={amount} onChange={e=>setAmount(e.target.value)}/>
    {!validAmount&&<p className="mt-1 text-[10px] text-[#a34d3d]">Choose at least 0.250 KWD and no more than 1,000 KWD.</p>}
     {create.isError&&<p className="mt-3 text-xs text-red-700">Could not prepare checkout. Please try again.</p>}
     <button className="btn-primary mt-4 flex w-full items-center justify-center gap-2 py-4 disabled:cursor-not-allowed disabled:opacity-50" disabled={create.isPending||!validAmount} onClick={send}>{create.isPending?'Preparing checkout…':`Continue to checkout · ${validAmount?(amountFils/1000).toFixed(3):'0.000'} KWD`}<ArrowRight size={17}/></button>
     <p className="mt-3 text-center text-[10px] leading-4 text-[#8b7566]">Only the child’s first name is shown publicly. No payment is confirmed until the checkout flow reports its final server status.</p>
    </>
  </div>}
 </div></Shell>;
}

function IndividualPage() {
 const {isLoaded,isSignedIn}=useAuth(); const qc=useQueryClient(); const [,go]=useLocation();
 const dashboard=useGetWalletDashboard({query:{enabled:!!isSignedIn,queryKey:getGetWalletDashboardQueryKey(),refetchOnMount:'always'}});
 const transfer=useCreateWalletTransfer({mutation:{onSuccess:()=>qc.invalidateQueries({queryKey:getGetWalletDashboardQueryKey()})}});
 const request=useCreateWalletMoneyRequest({mutation:{onSuccess:()=>qc.invalidateQueries({queryKey:getGetWalletDashboardQueryKey()})}});
 const act=useActOnWalletMoneyRequest({mutation:{onSuccess:()=>qc.invalidateQueries({queryKey:getGetWalletDashboardQueryKey()})}});
 const topup=useCreatePaymentCheckout({mutation:{onSuccess:payment=>{qc.setQueryData(getGetPaymentCheckoutQueryKey(payment.paymentId),payment);go(`/checkout/${payment.paymentId}`)}}});
  const [recipientEmail,setRecipientEmail]=useState('');
  const exactRecipientEmail=recipientEmail.trim();
  const validRecipientEmail=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(exactRecipientEmail);
  const recipient=useLookupWalletRecipient({email:exactRecipientEmail},{query:{enabled:!!isSignedIn&&validRecipientEmail,queryKey:getLookupWalletRecipientQueryKey({email:exactRecipientEmail}),retry:false}});
  const [mode,setMode]=useState<'send'|'request'>('send'); const [amount,setAmount]=useState('1.000'); const [note,setNote]=useState('');
 const amountFils=amountInKwd(amount); const validAmount=Number.isInteger(amountFils)&&amountFils>=1&&amountFils<=1_000_000;
 const submit=()=>{if(!recipient.data||!validAmount)return;const data={recipientUserId:recipient.data.userId,amountFils,idempotencyKey:crypto.randomUUID(),note:note.trim()||null};const done=()=>{setAmount('1.000');setNote('')};if(mode==='send')transfer.mutate({data},{onSuccess:done});else request.mutate({data},{onSuccess:done})};
 if(!isLoaded)return <Shell><LoadingCards/></Shell>;
 if(!isSignedIn)return <AuthPrompt title="Your individual wallet is private" detail="Sign in to view your wallet, resolve a recipient by exact account email, and use private SANAD transfers and requests."/>;
 if(dashboard.isLoading)return <Shell><LoadingCards/></Shell>;
 if(dashboard.isError)return <Shell><QueryError retry={()=>dashboard.refetch()}/></Shell>;
 const d=dashboard.data;
 return <Shell pageClass="individual-wallet"><PageTitle eyebrow="Individual wallet" title="Send. Request. Keep track." description="Your private wallet activity." action={<button className="btn-coral inline-flex items-center gap-2 text-sm" disabled={topup.isPending} onClick={()=>topup.mutate({data:{flow:'personal_topup',amountFils:5000,idempotencyKey:crypto.randomUUID()}})}><Plus size={15}/>{topup.isPending?'Preparing…':'Add demo funds'}</button>}/>
 <div className="mb-5"><DemoNotice/></div>{topup.isError&&<p className="mb-4 text-xs text-red-700">Could not start the demo top-up checkout. Try again.</p>}
 <div className="grid gap-5 lg:grid-cols-[.72fr_1.28fr]"><section className="rounded-[26px] bg-[#581C2B] p-6 text-[#fff4e5] shadow-[0_16px_38px_rgba(88,28,43,.12)] md:p-8"><div className="flex items-start justify-between"><div><span className="text-[10px] font-bold uppercase tracking-[.2em] text-[#f1b99d]">Available balance</span><p className="mt-4 font-[Manrope] text-4xl font-extrabold tracking-tight">{KWD(d?.balanceFils)}</p></div><span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-[#ef805f]"><Wallet size={21}/></span></div><p className="mt-5 border-t border-white/15 pt-4 text-xs leading-5 text-[#ecd4c5]">Personal wallet actions require sign-in. The explicit top-up above is a university demo and does not represent a real payment.</p></section>
  <Panel title="Send or request"><div className="mb-5 flex rounded-full bg-[#f4e8dc] p-1"><button className={`flex-1 rounded-full py-2 text-xs font-bold ${mode==='send'?'bg-[#581C2B] text-white':''}`} onClick={()=>setMode('send')}>Send</button><button className={`flex-1 rounded-full py-2 text-xs font-bold ${mode==='request'?'bg-[#581C2B] text-white':''}`} onClick={()=>setMode('request')}>Request</button></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Recipient’s account email" type="email" autoComplete="off" value={recipientEmail} onChange={e=>setRecipientEmail(e.target.value)} placeholder="name@example.com"/><div className="flex items-end"><div className="w-full rounded-xl bg-[#fff5e9] px-3 py-3 text-xs">{!exactRecipientEmail?'Enter the exact account email.':!validRecipientEmail?<span className="text-[#9a4939]">Enter a valid email address.</span>:recipient.isLoading?'Finding account…':recipient.isError?<span className="text-[#9a4939]">No eligible account found. Check the email.</span>:recipient.data?<><span className="block text-[10px] uppercase tracking-wide text-[#80695b]">Matched account</span><b className="mt-1 block">{recipient.data.displayName}</b></>:'Looking up the account…'}</div></div></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Amount (KWD)" type="number" min=".001" max="1000" step=".001" value={amount} onChange={e=>setAmount(e.target.value)}/><Field label="Note (optional)" value={note} maxLength={240} onChange={e=>setNote(e.target.value)} placeholder="Add a private note"/></div><button className="btn-primary mt-4 w-full disabled:opacity-50" disabled={!recipient.data||!validAmount||transfer.isPending||request.isPending} onClick={submit}>{transfer.isPending||request.isPending?'Submitting…':mode==='send'?'Send transfer':'Send request'} <ArrowRight className="ml-1 inline" size={14}/></button>{(transfer.isError||request.isError)&&<p role="alert" className="mt-2 text-xs text-[#8f2b3b]">Could not complete this wallet action. Check your balance and try again.</p>}<p className="mt-3 text-[10px] leading-4 text-[#80695b]">Only the safe display name is shown after exact-email lookup.</p></Panel></div>
 <div className="mt-5 grid gap-5 lg:grid-cols-2"><Panel title="Activity">{!d?.transactions.length?<Empty title="No activity yet" detail="Top-ups and wallet transfers will appear here."/>:<div className="divide-y divide-[#f0e2d4]">{d.transactions.map(t=><div key={t.reference} className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid={`row-wallet-transaction-${t.reference}`}><div><p className="text-sm font-semibold">{t.description}</p><p className="mt-1 text-[10px] text-[#80695b]">{t.peerLabel||t.kind.replaceAll('_',' ')} · {shortDate(t.createdAt)} · {t.status}</p></div><b className={t.kind==='sent'?'text-[#984d3b]':'text-[#527048]'}>{t.kind==='sent'?'−':'+'}{KWD(t.amountFils)}</b></div>)}</div>}</Panel>
 <Panel title="Money requests" aside={<span className="text-[10px] text-[#8a6e5e]">Private · server managed</span>}>{!d?.requests.length?<Empty title="No requests yet" detail="Requests you send and receive will appear here with clear actions for each pending item."/>:<div className="space-y-2">{d.requests.map(r=><div key={r.id} className="rounded-xl bg-[#fff5e9] p-4" data-testid={`row-wallet-request-${r.id}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><b className="text-sm">{r.direction==='received'?'From':'To'} {r.counterparty}</b><p className="mt-1 text-xs text-[#80695b]">{KWD(r.amountFils)} · {r.status} · {dateLabel(r.createdAt)}</p>{r.note&&<p className="mt-2 text-xs text-[#765b4e]">{r.note}</p>}</div><span className="rounded-full bg-[#f2e5d5] px-3 py-1 text-[10px] font-bold uppercase">{r.direction}</span></div>{r.status==='pending'&&<div className="mt-3 flex flex-wrap gap-2">{r.direction==='received'&&<><button className="rounded-full bg-[#e5efdf] px-3 py-2 text-xs font-bold text-[#456c42]" disabled={act.isPending} onClick={()=>act.mutate({requestId:r.id,data:{action:'pay'}})}>Pay request</button><button className="rounded-full bg-[#f6e2dc] px-3 py-2 text-xs font-bold text-[#984d3b]" disabled={act.isPending} onClick={()=>act.mutate({requestId:r.id,data:{action:'decline'}})}>Decline</button></>}{r.direction==='sent'&&<button className="rounded-full border border-[#ddc4b2] px-3 py-2 text-xs font-bold" disabled={act.isPending} onClick={()=>act.mutate({requestId:r.id,data:{action:'cancel'}})}>Cancel request</button>}</div>}</div>)}</div>}{act.isError&&<p className="mt-3 text-xs text-red-700">Could not update this request. Refresh and retry.</p>}</Panel></div></Shell>;
}

function CheckoutPage() {
 const {paymentId=''}=useParams(); const [,go]=useLocation(); const qc=useQueryClient();
 const checkout=useGetPaymentCheckout(paymentId,{query:{queryKey:getGetPaymentCheckoutQueryKey(paymentId),enabled:!!paymentId,refetchOnWindowFocus:true}});
 const complete=useCompleteSimulatedPayment({mutation:{onSuccess:p=>{qc.setQueryData(getGetPaymentCheckoutQueryKey(p.paymentId),p);qc.invalidateQueries({queryKey:getGetWalletDashboardQueryKey()});qc.invalidateQueries({queryKey:getListChildrenQueryKey()});qc.invalidateQueries({predicate:q=>typeof q.queryKey[0]==='string'&&q.queryKey[0].startsWith('/api/children/')&&q.queryKey[0].endsWith('/dashboard')})}}});
 const p=checkout.data;
 const openStripeCheckout=()=>{if(p?.checkoutUrl)window.location.assign(p.checkoutUrl)};
 return <Shell publicPage><div className="checkout-page mx-auto max-w-[620px] py-3">{checkout.isLoading?<div className="card-warm rounded-[30px] p-7"><div className="skeleton h-24"/><div className="skeleton mt-4 h-44"/></div>:checkout.isError?<QueryError retry={()=>checkout.refetch()}/>:p&&<div className="checkout-card card-warm overflow-hidden rounded-[30px]">
  <div className="bg-[#581C2B] px-6 py-5 text-white"><Brand compact/><p className="mt-5 text-[10px] font-bold uppercase tracking-[.22em] text-[#efb99d]">Shared SANAD checkout</p><h1 className="mt-2 font-[Manrope] text-2xl font-extrabold">Review your checkout</h1><p className="mt-1 text-sm text-[#ecd4c5]">{p.label}</p></div>
  <div className="p-6 sm:p-8"><div className="flex items-end justify-between border-b border-dashed border-[#ddcbb8] pb-5"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#ad6955]">Total</p><p className="mt-2 font-[Manrope] text-4xl font-extrabold text-[#581C2B]">{KWD(p.amountFils)}</p></div><span className="rounded-full bg-[#f7e9dc] px-3 py-1.5 text-[10px] font-bold uppercase text-[#82583f]">{p.status.replaceAll('_',' ')}</span></div>
   <dl className="grid grid-cols-2 gap-y-3 py-5 text-sm"><dt className="text-[#80695b]">Payment route</dt><dd className="text-right font-semibold">{p.provider==='stripe_test'?'Stripe test checkout':'Simulated university demo'}</dd><dt className="text-[#80695b]">Reference</dt><dd className="text-right font-mono text-xs">{p.reference||p.paymentId}</dd><dt className="text-[#80695b]">Created</dt><dd className="text-right">{shortDate(p.createdAt)}</dd></dl>
   {p.flow==='worker_tip'&&p.provider==='stripe_test'&&<div className="mb-5 rounded-2xl border border-[#eadbcc] bg-white p-4">
    <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#ad6955]">Stripe test amount</p>
    <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm"><dt className="text-[#80695b]">Tip recorded in SANAD</dt><dd className="text-right font-bold">{KWD(p.amountFils)}</dd><dt className="text-[#80695b]">Stripe test charge</dt><dd className="text-right font-bold">{p.usdCurrency==='USD'?USD(p.usdChargeCents):'Unavailable'}</dd><dt className="text-[#80695b]">Exchange rate</dt><dd className="text-right font-semibold">{p.usdPerKwd!=null?`1 KWD = ${p.usdPerKwd.toFixed(6)} USD`:'Unavailable'}</dd><dt className="text-[#80695b]">Rate updated</dt><dd className="text-right text-xs">{p.rateUpdatedAt?new Date(p.rateUpdatedAt).toLocaleString():'Unavailable'}</dd></dl>
    <p className="mt-3 text-xs leading-5 text-[#765b4e]">Converted using the rate shown and rounded to the nearest USD cent. Test mode only; no live payment will be made.</p>
    <a className="mt-2 inline-flex text-[10px] font-semibold text-[#7b302f] underline" href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">Rates by ExchangeRate-API</a>
   </div>}
  {p.provider==='simulated'&&<div className="mb-4 rounded-xl border border-[#f0d6b8] bg-[#fff0df] p-4 text-xs leading-5 text-[#754832]"><b>Simulated university demo.</b> This action records a demo payment state only. No money moves, and no Stripe payment is being made.</div>}
  {p.notice&&<p className="mb-4 text-xs leading-5 text-[#80695b]">{p.notice}</p>}
    {p.status==='demo_completed'||p.status==='paid'?<div className="rounded-xl bg-[#eaf0e3] p-4 text-sm font-semibold text-[#527048]">{p.status==='paid'?'Payment verified as paid by SANAD.':'Demo payment completed. No money moved.'}{p.flow==='worker_tip'&&p.reference&&<Link className="mt-3 inline-flex items-center gap-2 underline" href={`/receipt/${encodeURIComponent(p.reference)}`}>View worker tip receipt <ArrowRight size={14}/></Link>}</div>:p.status!=='pending'?<div className="rounded-xl bg-[#fff0df] p-4 text-sm text-[#754832]">This checkout is {p.status}. Start a new checkout to continue.</div>:p.provider==='stripe_test'?<div className="rounded-xl bg-[#f7eadb] p-4 text-sm leading-6 text-[#765b4e]">{p.flow==='worker_tip'&&(!p.usdChargeCents||p.usdCurrency!=='USD'||p.usdPerKwd==null)?<p role="alert">The conversion snapshot is incomplete. No Stripe redirect is available; start a new tip checkout.</p>:<><p>{p.flow==='worker_tip'?'Review the KWD tip and USD test charge above before continuing.':'Continue to the Stripe test checkout when ready.'}</p><button className="btn-primary mt-4 w-full" disabled={!p.checkoutUrl} onClick={openStripeCheckout}>{p.checkoutUrl?'Continue to Stripe test checkout':'Stripe test checkout URL is unavailable'}</button></>}<button className="mt-3 block text-xs font-bold underline" onClick={()=>checkout.refetch()}>Refresh checkout status</button></div>:p.flow==='worker_tip'?<div role="alert" className="rounded-xl bg-[#fff0df] p-4 text-sm leading-6 text-[#754832]">Simulated checkout is disabled for customer tips. No tip has been credited. Start a new Stripe test checkout.</div>:<><button className="btn-primary flex w-full items-center justify-center gap-2 py-4" disabled={complete.isPending} onClick={()=>complete.mutate({paymentId:p.paymentId})}>{complete.isPending?'Completing demo…':'Complete demo payment'}<ArrowRight size={16}/></button>{complete.isError&&<p className="mt-3 text-xs text-red-700">The demo checkout could not be completed. Try again.</p>}<p className="mt-3 text-center text-[10px] leading-4 text-[#8b7566]">Explicit confirmation is required. This will not charge a card or use Stripe.</p></>}
  <div className="mt-6 border-t border-[#eadbcc] pt-4 text-center"><Link className="text-xs font-semibold text-[#7b302f]" href="/">Return to SANAD</Link></div></div></div>}</div></Shell>;
}

function CheckoutReturnPage() {
 const [,go]=useLocation(); const qc=useQueryClient(); const params=new URLSearchParams(window.location.search);
 const paymentId=params.get('paymentId')||''; const sessionId=params.get('session_id')||'';
 const verify=useVerifyStripeCheckout({mutation:{onSuccess:p=>{qc.setQueryData(getGetPaymentCheckoutQueryKey(p.paymentId),p);qc.invalidateQueries({queryKey:getGetWalletDashboardQueryKey()});qc.invalidateQueries({queryKey:getListChildrenQueryKey()});qc.invalidateQueries({predicate:q=>typeof q.queryKey[0]==='string'&&q.queryKey[0].startsWith('/api/children/')&&q.queryKey[0].endsWith('/dashboard')})}}});
 const started=useRef('');
 useEffect(()=>{const key=`${paymentId}:${sessionId}`;if(paymentId&&sessionId&&started.current!==key){started.current=key;verify.mutate({paymentId,data:{sessionId}})}},[paymentId,sessionId,verify.mutate]);
 const paid=verify.data?.status==='paid';
 return <Shell publicPage pageClass="payment-status-page"><div className="mx-auto max-w-[580px] py-6"><div className="status-card card-warm rounded-[30px] p-7 text-center sm:p-10">{paid?<><CheckCircle2 className="mx-auto text-[#53764b]" size={44}/><p className="mt-4 text-[10px] font-bold uppercase tracking-[.2em] text-[#527048]">Server verified · Stripe test</p><h1 className="mt-2 font-[Manrope] text-2xl font-extrabold">Test payment confirmed</h1><p className="mt-3 text-sm leading-6 text-[#765b4e]">Verified by SANAD. No live money moved.</p><p className="mt-5 font-[Manrope] text-3xl font-extrabold text-[#581C2B]">{KWD(verify.data?.amountFils)}</p></>:verify.isPending?<><div className="skeleton mx-auto h-14 w-14 rounded-full"/><h1 className="mt-5 font-[Manrope] text-2xl font-extrabold">Verifying payment</h1><p className="mt-2 text-sm text-[#765b4e]">A return from Stripe is not confirmation. Waiting for server verification.</p></>:verify.isError?<><CircleHelp className="mx-auto text-[#EF805F]" size={36}/><h1 className="mt-4 font-[Manrope] text-2xl font-extrabold">Could not verify</h1><p className="mt-2 text-sm leading-6 text-[#765b4e]">Payment remains unconfirmed.</p><button className="btn-primary mt-5" onClick={()=>{if(paymentId&&sessionId)verify.mutate({paymentId,data:{sessionId}})}} disabled={!paymentId||!sessionId}>Retry verification</button></>:<><Clock3 className="mx-auto text-[#EF805F]" size={38}/><h1 className="mt-4 font-[Manrope] text-2xl font-extrabold">Payment not confirmed</h1><p className="mt-2 text-sm leading-6 text-[#765b4e]">{!paymentId||!sessionId?'Payment or session reference is missing.':'No paid status was returned by the server.'}</p>{paymentId&&sessionId&&<button className="btn-primary mt-5" onClick={()=>verify.mutate({paymentId,data:{sessionId}})}>Check status again</button>}</>}<button className="mt-6 block w-full text-xs font-semibold text-[#7b302f] underline" onClick={()=>go('/')}>Return to SANAD</button></div></div></Shell>;
}

function CheckoutCancelPage() {
 const params=new URLSearchParams(window.location.search); const paymentId=params.get('paymentId')||''; const cancel=useCancelPaymentCheckout(); const started=useRef('');
 useEffect(()=>{if(paymentId&&started.current!==paymentId){started.current=paymentId;cancel.mutate({paymentId})}},[paymentId,cancel.mutate]);
 return <Shell publicPage pageClass="payment-status-page"><div className="mx-auto max-w-[580px] py-6"><div className="status-card card-warm rounded-[30px] p-7 text-center sm:p-10"><Clock3 className="mx-auto text-[#b66955]" size={40}/><p className="mt-4 text-[10px] font-bold uppercase tracking-[.2em] text-[#ad6955]">Checkout status</p><h1 className="mt-2 font-[Manrope] text-2xl font-extrabold">{cancel.data?.status==='paid'?'Payment needs verification':'Checkout not completed'}</h1><p className="mt-3 text-sm leading-6 text-[#765b4e]">{cancel.isPending?'Confirming cancellation with SANAD…':cancel.isError?'Cancellation remains unconfirmed.':cancel.data?.status==='paid'?'Server reports paid; this page does not confirm payment. Return verification is required.':paymentId?`Status: ${cancel.data?.status||'requested'}.`:'No payment reference was included; no cancellation request was sent.'}</p>{cancel.isError&&<button className="btn-primary mt-5" onClick={()=>paymentId&&cancel.mutate({paymentId})}>Retry cancellation</button>}<Link className="mt-6 inline-flex text-xs font-semibold text-[#7b302f] underline" href="/">Return to SANAD</Link></div></div></Shell>;
}

function AuthPrompt({ title='Sign in to continue', detail='SANAD keeps family and management actions behind a secure parent account.' }: {title?:string;detail?:string}) {
 return <Shell><div className="mx-auto max-w-[540px] py-10"><div className="card-warm rounded-[28px] p-7 text-center sm:p-10"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#f4e4d7] text-[#7d3f38]"><LockKeyhole size={23}/></span><p className="mt-5 text-[10px] font-bold uppercase tracking-[.2em] text-[#ad6955]">Private by design</p><h1 className="mt-2 font-[Manrope] text-2xl font-extrabold">{title}</h1><p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#765b4e]">{detail}</p><div className="mt-6 flex justify-center gap-3"><Link className="btn-primary" href="/sign-in">Sign in</Link><Link className="rounded-full border border-[#ddc4b2] px-5 py-3 text-sm font-bold" href="/sign-up">Create account</Link></div></div></div></Shell>;
}
function ParentGate({ children }: {children:ReactNode}) {
 const {isLoaded,isSignedIn}=useAuth();
 const session=useGetSanadSession({query:{enabled:!!isSignedIn,queryKey:getGetSanadSessionQueryKey(),retry:false}});
 if(!isLoaded||isSignedIn&&session.isLoading) return <Shell><div className="mx-auto max-w-3xl"><LoadingCards/></div></Shell>;
 if(!isSignedIn) return <AuthPrompt/>;
 if(session.isError||!session.data) return <AuthPrompt title="Parent account needed" detail="Sign in with the parent account connected to these family profiles. Your family data is not available without a SANAD parent role."/>;
  if(session.data.role!=='parent'&&session.data.role!=='admin') return <AuthPrompt title="Parent access required" detail="This supervised family area is available to signed-in parent or administrator accounts only."/>;
 return <>{children}</>;
}
function AdminPage() {
 const qc=useQueryClient();
 const session=useGetSanadSession({query:{queryKey:getGetSanadSessionQueryKey(),retry:false}});
 const bootstrap=useBootstrapFirstAdmin({mutation:{onSuccess:()=>qc.invalidateQueries({queryKey:getGetSanadSessionQueryKey()})}});
 const isAdmin=session.data?.role==='admin';
 const overview=useGetAdminOverview({query:{enabled:isAdmin,queryKey:getGetAdminOverviewQueryKey()}});
 const tips=useListTips(undefined,{query:{enabled:isAdmin,queryKey:getListTipsQueryKey()}});
  const settlements=useListSettlements({query:{enabled:isAdmin,queryKey:getListSettlementsQueryKey()}});
  const pendingCompanies=useListPendingCompanies({query:{enabled:isAdmin,queryKey:getListPendingCompaniesQueryKey()}});
  const companyReview=useReviewCompany({mutation:{onSuccess:()=>qc.invalidateQueries({queryKey:getListPendingCompaniesQueryKey()})}});
  const workerWithdrawals=useListAdminWorkerWithdrawals({query:{enabled:isAdmin,queryKey:getListAdminWorkerWithdrawalsQueryKey()}});
 const {isLoaded,isSignedIn}=useAuth();
 if(!isLoaded||isSignedIn&&session.isLoading) return <Shell><LoadingCards/></Shell>;
 if(!isSignedIn) return <AuthPrompt title="Admin sign-in required" detail="Sign in to SANAD. Only the backend allowlisted account can claim the first admin role."/>;
 if(!isAdmin) return <Shell><div className="mx-auto max-w-[650px] py-10"><div className="card-warm rounded-[28px] p-7 sm:p-10"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#f4e4d7] text-[#7d3f38]"><LockKeyhole/></span><p className="mt-5 text-[10px] font-bold uppercase tracking-[.2em] text-[#ad6955]">Restricted access</p><h1 className="mt-2 font-[Manrope] text-3xl font-extrabold">Admin workspace</h1><p className="mt-3 text-sm leading-6 text-[#765b4e]">Worker and demo activity management is limited to SANAD administrators. If this account is allowlisted, you may request the first admin role below.</p><button className="btn-primary mt-5" disabled={bootstrap.isPending} onClick={()=>bootstrap.mutate()}>{bootstrap.isPending?'Checking allowlist…':'Check admin eligibility'}</button>{bootstrap.isError&&<p className="mt-3 rounded-xl bg-[#fff0df] p-3 text-xs leading-5 text-[#754832]">Admin bootstrap is unavailable. The server may not have SANAD_ADMIN_EMAIL configured, or this account is not allowlisted. No role was granted.</p>}{session.isError&&<p className="mt-3 text-xs text-[#80695b]">Could not load this account’s SANAD role. Sign in again and retry.</p>}</div></div></Shell>;
   return <Shell demo pageClass="admin-dashboard"><PageTitle eyebrow="Restricted administration" title="Platform overview" description="Company reviews and recorded activity."/>
   <div className="admin-metrics mb-5 grid gap-4 sm:grid-cols-3">{overview.isLoading?<LoadingCards/>:<><Stat label="Workers" value={String(overview.data?.workerCount||0)} icon={Users} detail="Managed profiles"/><Stat label="Tips" value={String(overview.data?.tipCount||0)} icon={Heart} detail="Test and simulated"/><Stat label="Recorded total" value={KWD(overview.data?.totalFils)} icon={Banknote} detail="No live funds moved"/></>}</div>
    <div className="mb-5"><Panel title="Company verification queue" aside={<span className="text-[10px] text-[#8a6e5e]">Administrator review</span>}>{pendingCompanies.isLoading?<ListSkeleton/>:pendingCompanies.isError?<QueryError retry={()=>pendingCompanies.refetch()}/>:!pendingCompanies.data?.length?<Empty title="No company applications pending" detail="New company profiles awaiting review will appear here."/>:<div className="space-y-2">{pendingCompanies.data.map(c=><div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#fff5e9] px-4 py-3"><div><b>{c.name}</b><p className="text-xs text-[#80695b]">Applied {shortDate(c.createdAt)} · pending</p></div><div className="flex gap-2"><button className="rounded-full bg-[#e5efdf] px-4 py-2 text-xs font-bold text-[#456c42]" disabled={companyReview.isPending} onClick={()=>companyReview.mutate({id:c.id,data:{status:'approved'}})}>Approve</button><button className="rounded-full bg-[#f6e2dc] px-4 py-2 text-xs font-bold text-[#984d3b]" disabled={companyReview.isPending} onClick={()=>companyReview.mutate({id:c.id,data:{status:'rejected'}})}>Reject</button></div></div>)}</div>}{companyReview.isError&&<p className="mt-3 text-xs text-red-700">Could not update company review. Try again.</p>}</Panel></div>
     <div className="mt-5"><Panel title="Historical worker withdrawal records" aside={<span className="rounded-full bg-[#f7ebd8] px-3 py-1.5 text-[10px] font-bold text-[#835e32]">Read only · demo</span>}>{workerWithdrawals.isLoading?<ListSkeleton/>:workerWithdrawals.isError?<QueryError retry={()=>workerWithdrawals.refetch()}/>:!workerWithdrawals.data?.length?<Empty title="No historical withdrawal records" detail="Recorded demo withdrawal history will appear here."/>:<div className="space-y-3">{workerWithdrawals.data.map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#fff5e9] p-4"><div><b>{item.workerName}</b><p className="mt-1 text-xs text-[#80695b]">{KWD(item.amountFils)} · {item.demoBankName} · {item.accountLabel}</p><p className="mt-1 text-[10px] text-[#80695b]">{item.status} · requested {shortDate(item.createdAt)}</p></div><span className="rounded-full bg-[#f2e5d5] px-3 py-1.5 text-[10px] font-bold">Historical record</span></div>)}</div>}<p className="mt-3 text-[11px] leading-5 text-[#80695b]">Historical status is shown as recorded. No review or payment action is available here.</p></Panel></div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2"><Panel title="Demo tip activity" aside={<span className="text-[10px] text-[#8a6e5e]">Admin ledger</span>}>{tips.isLoading?<ListSkeleton/>:tips.isError?<QueryError retry={()=>tips.refetch()}/>:tips.data?.length?<WorkerTipList tips={tips.data}/>:<Empty title="No demo tips yet" detail="Public simulated thank-yous will appear here."/>}</Panel><Panel title="Legacy settlement history" aside={<span className="text-[10px] text-[#8a6e5e]">Read only</span>}>{settlements.isLoading?<ListSkeleton/>:settlements.isError?<QueryError retry={()=>settlements.refetch()}/>:!settlements.data?.some(s=>s.isLegacy)?<Empty title="No legacy settlements" detail="Historical legacy settlement records will appear here."/>:<div className="space-y-2">{settlements.data.filter(s=>s.isLegacy).map(s=><div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#fff5e9] px-4 py-3"><div><b className="text-sm">{s.workerName}</b><p className="text-xs text-[#80695b]">{s.month} · Legacy record · {s.status}</p></div><b>{KWD(s.amountFils)}</b></div>)}</div>}<p className="mt-3 text-[10px] leading-4 text-[#80695b]">Historical entries are shown for reference and cannot be changed here.</p></Panel></div>
  </Shell>;
}

function ParentPage() { return <ParentGate><FamilyPage/></ParentGate>; }
function ChildWalletRoute() { return <ParentGate><ChildPage/></ParentGate>; }
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
function stripBase(path: string) { return basePath && path.startsWith(basePath) ? path.slice(basePath.length)||'/' : path; }
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL ||
 (import.meta.env.PROD ? `${window.location.origin}/api/__clerk` : undefined);
const clerkAppearance = {
 theme:shadcn, cssLayerName:'clerk', options:{logoPlacement:'inside' as const,logoLinkUrl:basePath||'/',logoImageUrl:`${window.location.origin}${basePath}/logo.svg`},
 variables:{colorPrimary:'#581C2B',colorForeground:'#3B1720',colorMutedForeground:'#80695b',colorDanger:'#a34d3d',colorBackground:'#fffaf4',colorInput:'#fffaf4',colorInputForeground:'#3B1720',colorNeutral:'#ddcbb9',fontFamily:'DM Sans, Noto Sans Arabic, sans-serif',borderRadius:'0.8rem'},
 elements:{rootBox:'w-full flex justify-center',cardBox:'bg-[#fffaf4] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-[0_18px_50px_rgba(88,28,43,.12)]',card:'!shadow-none !border-0 !bg-transparent !rounded-none',footer:'!shadow-none !border-0 !bg-transparent !rounded-none',headerTitle:'text-[#3B1720] font-bold',headerSubtitle:'text-[#80695b]',socialButtonsBlockButtonText:'text-[#3B1720]',formFieldLabel:'text-[#64483d]',footerActionLink:'text-[#7b302f]',footerActionText:'text-[#80695b]',dividerText:'text-[#80695b]',identityPreviewEditButton:'text-[#7b302f]',formFieldSuccessText:'text-[#456c42]',alertText:'text-[#3B1720]',logoBox:'rounded-xl',logoImage:'rounded-lg',socialButtonsBlockButton:'border-[#ddcbb9] bg-[#fff5e9]',formButtonPrimary:'bg-[#581C2B] text-[#fff4e5] hover:bg-[#3B1720]',formFieldInput:'border-[#ddcbb9] bg-[#fffaf4] text-[#3B1720]',footerAction:'text-[#80695b]',dividerLine:'bg-[#eadbcc]',alert:'bg-[#fff0df] border-[#f0d6b8]',otpCodeFieldInput:'border-[#ddcbb9] bg-[#fffaf4] text-[#3B1720]',formFieldRow:'text-[#3B1720]',main:'text-[#3B1720]'}
};
function SignInPage() {
 const redirectUrl=new URLSearchParams(window.location.search).get('redirect_url')||undefined;
 const search=window.location.search;
 return <div className="auth-page grain flex min-h-[100dvh] flex-col items-center justify-center bg-[#f5e8d8] px-4 py-8"><div className="mb-5 text-center"><Link href="/" className="inline-flex items-center gap-2 text-[#581C2B]"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#EF805F] text-[#3B1720]"><Heart size={18}/></span><b className="font-[Manrope] tracking-[.12em]">SANAD <span dir="rtl">سند</span></b></Link><p className="mt-3 text-xs text-[#80695b]">Your private SANAD space.</p></div><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up${search}`} forceRedirectUrl={redirectUrl}/><Link className="mt-5 text-xs font-semibold text-[#7b302f]" href="/">Back to SANAD</Link></div>;
}
function SignUpPage() {
 const redirectUrl=new URLSearchParams(window.location.search).get('redirect_url')||undefined;
 const search=window.location.search;
 return <div className="auth-page grain flex min-h-[100dvh] flex-col items-center justify-center bg-[#f5e8d8] px-4 py-8"><div className="mb-5 text-center"><Link href="/" className="inline-flex items-center gap-2 text-[#581C2B]"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#EF805F] text-[#3B1720]"><Heart size={18}/></span><b className="font-[Manrope] tracking-[.12em]">SANAD <span dir="rtl">سند</span></b></Link><p className="mt-3 max-w-sm text-xs leading-5 text-[#80695b]">One account for your family, worker, or company space.</p></div><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in${search}`} forceRedirectUrl={redirectUrl}/><Link className="mt-5 text-xs font-semibold text-[#7b302f]" href="/">Back to SANAD</Link></div>;
}
function AuthQueryScope({children}:{children:ReactNode}) {
 const {userId}=useAuth();const previous=useState<string|null|undefined>(undefined);
 useEffect(()=>{if(previous[0]!==undefined&&previous[0]!==userId)queryClient.clear();previous[1](userId)},[userId]);
 return <>{children}</>;
}
function AppRouter() {
 const [location]=useLocation();
 return <ErrorBoundary resetKey={location}><Switch>
   <Route path="/" component={Home}/><Route path="/direct-tip" component={DirectTipPage}/><Route path="/tip/:publicId" component={TipPage}/><Route path="/receipt/:reference" component={ReceiptPage}/>
   <Route path="/checkout/return" component={CheckoutReturnPage}/><Route path="/checkout/cancel" component={CheckoutCancelPage}/><Route path="/checkout/:paymentId" component={CheckoutPage}/>
  <Route path="/worker" component={WorkerPage}/><Route path="/worker/invitation" component={WorkerInvitationPage}/><Route path="/company" component={CompanyPage}/><Route path="/parent" component={ParentPage}/>
   <Route path="/child/:id" component={ChildWalletRoute}/><Route path="/give/:publicId" component={ChildTransferPage}/><Route path="/individual" component={IndividualPage}/><Route path="/admin" component={AdminPage}/>
   <Route path="/sign-in/*?" component={SignInPage}/><Route path="/sign-up/*?" component={SignUpPage}/>
  <Route component={NotFound}/>
 </Switch></ErrorBoundary>;
}
function ClerkApp() {
 const [,setLocation]=useLocation();
 return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={{signIn:{start:{title:'Welcome back',subtitle:'Sign in to your SANAD family, worker, or company space'}},signUp:{start:{title:'Create your SANAD account',subtitle:'For parents, workers, and verified company teams'}}}} routerPush={to=>setLocation(stripBase(to))} routerReplace={to=>setLocation(stripBase(to),{replace:true})}>
   <QueryClientProvider client={queryClient}><AuthQueryScope><TooltipProvider><AppRouter/><Toaster/></TooltipProvider></AuthQueryScope></QueryClientProvider>
 </ClerkProvider>;
}
function App() {
 return <WouterRouter base={basePath}><ClerkApp/></WouterRouter>;
}
export default App;
