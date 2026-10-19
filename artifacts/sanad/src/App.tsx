import { type ReactNode, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
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
  useGetWorkerByPublicId, getGetWorkerByPublicIdQueryKey, useGetWorkerDashboard, getGetWorkerDashboardQueryKey,
  getListTipsQueryKey, useCreateDemoTip, useGetTipReceipt, getGetTipReceiptQueryKey,
  useGetCompanySummary, getGetCompanySummaryQueryKey, useListSettlements, getListSettlementsQueryKey,
  useListChildren, getListChildrenQueryKey,
  useGetChildDashboard, getGetChildDashboardQueryKey,
  useListDemoTransfers, getListDemoTransfersQueryKey, useCreateDemoTransfer,
  useGetPublicChildRecipient, getGetPublicChildRecipientQueryKey, useCreatePublicChildTransfer,
} from '@workspace/api-client-react';
import type { Tip, Child, WorkerDashboard } from '@workspace/api-client-react';
import {
  ArrowRight, ArrowUpRight, BadgeCheck, Banknote, BriefcaseBusiness, CheckCircle2, CircleHelp,
  Clock3, Coffee, Copy, Download, Heart, Languages, Menu, Search,
  QrCode, ShieldAlert, Sparkles, Star, Users, Wallet, X,
} from 'lucide-react';

const queryClient = new QueryClient();
const KWD = (fils?: number | null) => `${((fils || 0) / 1000).toFixed(3)} KWD`;
const dateLabel = (date?: string) => date ? new Date(date).toLocaleDateString('en-KW', { day: 'numeric', month: 'short' }) : '—';
const shortDate = (date?: string) => date ? new Date(date).toLocaleDateString('en-KW', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

function Brand({ compact = false }: { compact?: boolean }) {
  return <Link href="/" className="inline-flex items-center gap-2.5 text-white no-underline" data-testid="link-brand">
    <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#EF805F] text-[#3B1720]"><Heart size={18} strokeWidth={2.5}/></span>
    <span className="leading-tight"><b className="block font-[Manrope] text-[17px] tracking-[.12em]">SANAD <span className="font-sans tracking-normal">سند</span></b>{!compact && <small className="block text-[10px] tracking-[.14em] text-[#f4cfb9]">Scan. Send. Done.</small>}</span>
  </Link>;
}
function Header({ demo = false, publicPage = false }: { demo?: boolean; publicPage?: boolean }) {
  const [arabic, setArabic] = useState(() => {
    if (typeof window === 'undefined') return false;
    const queryLanguage = new URLSearchParams(window.location.search).get('lang');
    return queryLanguage === 'ar' || (queryLanguage !== 'en' && window.localStorage.getItem('sanad-language') === 'ar');
  });
  const [open, setOpen] = useState(false);
  const workers = useListWorkers({query:{queryKey:getListWorkersQueryKey(),enabled:!publicPage}});
  const directTipHref = workers.data?.[0] ? `/tip/${workers.data[0].publicId}` : '/worker';
  useEffect(() => { applyDocumentLanguage(arabic); }, [arabic]);
  return <>
    <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between bg-[#581C2B] px-5 text-white shadow-[0_5px_18px_rgba(59,23,32,.12)] md:px-9">
      <Brand/>
      {!publicPage&&<nav className="hidden items-center gap-1 lg:flex">
        {[['Roles','/'],['Individual','/individual'],['Parent','/parent'],['Child','/child/1'],['Company','/company'],['Worker','/worker']].map(([title, href]) =>
          <Link key={title} href={href} className="rounded-full px-3 py-2 text-[12px] text-[#f7e9dc] transition hover:bg-white/10 hover:text-white">{title}</Link>)}
      </nav>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => {const next = !arabic; setArabic(next); window.localStorage.setItem('sanad-language', next ? 'ar' : 'en'); const params = new URLSearchParams(window.location.search); params.delete('lang'); window.history.replaceState(null,'',`${window.location.pathname}${params.size?`?${params}`:''}${window.location.hash}`);}} className="flex items-center gap-1 rounded-full border border-white/20 px-2.5 py-2 text-[11px] md:px-3 md:text-xs" data-testid="button-language"><Languages size={14}/>{arabic?'EN':'عربي'}</button>
        {!publicPage&&<Link href={directTipHref} className="hidden rounded-full bg-[#EF805F] px-4 py-2 text-xs font-bold text-[#3B1720] md:block">Direct tip <ArrowRight className="ml-1 inline" size={13}/></Link>}
        {demo && <span className="hidden rounded-full bg-white/10 px-3 py-2 text-[10px] text-[#ffd9be] md:block">DEMO MODE</span>}
        {!publicPage&&<button className="p-2 lg:hidden" onClick={()=>setOpen(!open)} aria-label="Toggle navigation" data-testid="button-menu">{open?<X size={20}/>:<Menu size={20}/>}</button>}
      </div>
    </header>
    {open && !publicPage && <nav className="absolute right-3 top-[62px] z-40 grid w-56 gap-1 rounded-2xl border border-[#eadbcc] bg-[#fffaf4] p-3 shadow-xl lg:hidden">{[['Role selection','/'],['Individual','/individual'],['Parent','/parent'],['Child wallet','/child/1'],['Company','/company'],['Worker','/worker']].map(([t,h])=><Link key={t} onClick={()=>setOpen(false)} href={h} className="rounded-xl px-3 py-2 text-sm hover:bg-[#f5e8d8]">{t}</Link>)}</nav>}
  </>;
}
function DemoNotice() { return <div className="demo-banner flex items-start gap-2.5 rounded-xl px-4 py-3 text-xs leading-relaxed" data-testid="status-demo-mode"><ShieldAlert className="mt-0.5 shrink-0" size={15}/><span><b>Prototype demo only.</b> No money moves, no payment processing, and no secure account authentication is provided.</span></div>; }
function Shell({ children, demo = false, publicPage = false }: { children: ReactNode; demo?: boolean; publicPage?: boolean }) {
  return <div className="app-shell grain"><Header demo={demo} publicPage={publicPage}/><main className="mx-auto max-w-[1220px] px-4 py-6 md:px-8 md:py-9">{demo && <div className="mb-6"><DemoNotice/></div>}{children}</main><footer className="mt-10 border-t border-[#eadbcc] bg-[#fff4e5] px-5 py-5 text-xs text-[#765b4e]"><div className="mx-auto flex max-w-[1220px] flex-wrap items-center justify-between gap-3"><Brand compact/><span>Kuwait’s community-first money prototype</span><span>All money movement shown is simulated.</span></div></footer></div>;
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
  const workerList = useListWorkers({query:{queryKey:getListWorkersQueryKey()}});
  const publicTipHref = workerList.data?.[0] ? `/tip/${workerList.data[0].publicId}` : '/worker';
  const roles = [
    {name:'Parent', arabic:'ولي الأمر', desc:'Give allowances and Eidiyah, set savings goals, and guide thoughtful spending.', icon:Users, href:'/parent', label:'FAMILY CARE'},
    {name:'Child', arabic:'الأبناء', desc:'See your wallet, follow goals, and ask for approval before a purchase.', icon:Wallet, href:'/child/1', label:'GROW WITH CONFIDENCE'},
    {name:'Individual', arabic:'الأفراد', desc:'Send or request a simulated transfer and keep a clear activity history.', icon:ArrowUpRight, href:'/individual', label:'EVERYDAY FINANCE'},
    {name:'Worker', arabic:'موظف الخدمة', desc:'View appreciation, tips, your personal QR, and monthly settlement status.', icon:Coffee, href:'/worker', label:'CO-OP WORKERS'},
    {name:'Company & Hospitality', arabic:'الشركات والمنشآت', desc:'Review worker totals and existing monthly settlement records.', icon:BriefcaseBusiness, href:'/company', label:'BUSINESS PORTAL'},
  ];
  return <Shell><div className="mx-auto max-w-[980px] pt-4 text-center md:pt-8">
    <span className="inline-flex items-center gap-2 rounded-full bg-[#f7e8d8] px-4 py-2 text-[11px] font-semibold text-[#82583f]"><span className="h-2 w-2 rounded-full bg-[#EF805F]"/>{health.isLoading?'Connecting to demo environment':health.isError?'Demo API is unavailable':'Choose your SANAD journey'}</span>
    <p className="mt-6 text-[11px] font-bold uppercase tracking-[.24em] text-[#b66955]">A little thanks goes a long way</p>
    <h1 className="mt-3 font-[Manrope] text-4xl font-extrabold tracking-[-.055em] text-[#3B1720] md:text-[54px]">Welcome to SANAD <span className="text-[#EF805F]">·</span> <span dir="rtl">مرحبا بك في سند</span></h1>
    <p className="mx-auto mt-4 max-w-[650px] text-sm leading-6 text-[#765b4e] md:text-base">A warm, local way to thank the people who help your day go well — with simple demo spaces for families and teams.</p>
    <p className="mt-2 font-[Manrope] text-sm font-bold tracking-[.12em] text-[#581C2B]">Scan. Send. Done.</p>
  </div>
  <div className="mt-9 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    {roles.map(({name,arabic,desc,icon:Icon,href,label},i)=><Link key={name} href={href} className={`card-warm group flex min-h-[248px] flex-col rounded-[23px] p-6 text-left no-underline transition duration-200 hover:-translate-y-1 hover:shadow-[0_18px_38px_rgba(88,28,43,.12)] enter ${i===4?'xl:col-span-2':''}`} style={{animationDelay:`${i*50}ms`}}>
      <div className="flex items-start justify-between"><span className={`grid h-11 w-11 place-items-center rounded-[15px] ${i===1?'bg-[#EF805F] text-[#3B1720]':'bg-[#581C2B] text-[#fff4e5]'}`}><Icon size={20}/></span><span className="rounded-full bg-[#f8e6dc] px-3 py-1 text-[9px] font-bold tracking-[.12em] text-[#874b3a]">{label}</span></div>
      <div className="mt-5 flex items-baseline justify-between gap-2"><h2 className="font-[Manrope] text-xl font-extrabold tracking-tight text-[#3B1720]">{name}</h2><span dir="rtl" className="text-xs font-semibold text-[#a75d4d]">{arabic}</span></div>
      <p className="mt-2 max-w-md text-sm leading-6 text-[#796257]">{desc}</p>
      <span className="mt-auto flex items-center justify-between pt-5 text-xs font-bold text-[#581C2B]"><span>Explore demo space</span><span className="grid h-8 w-8 place-items-center rounded-full bg-[#f5e8d8] transition group-hover:bg-[#EF805F]"><ArrowRight size={15}/></span></span>
    </Link>)}
  </div>
  <div className="mt-8 flex flex-col items-center justify-between gap-4 rounded-[24px] bg-[#3B1720] px-6 py-6 text-[#fff4e5] md:flex-row md:px-9">
    <div className="flex items-center gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#EF805F] text-[#3B1720]"><Sparkles/></span><div><h2 className="font-[Manrope] text-lg font-bold">Just want to thank someone?</h2><p className="mt-1 text-xs text-[#ebd0bd]">No account required. Open a worker’s public demo tip page.</p></div></div>
    <Link href={publicTipHref} className="btn-coral flex items-center gap-2 text-sm">Open public tip demo <ArrowRight size={16}/></Link>
  </div>
  </Shell>;
}

function WorkerTipList({ tips, loading }: { tips?: Tip[]; loading?: boolean }) {
  if(loading) return <ListSkeleton/>;
  if(!tips?.length) return <Empty title="No appreciations yet" detail="Demo tips appear here after someone sends a simulated thank-you."/>; 
  return <div className="space-y-2">{tips.map(t=><div key={t.reference} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#fff5e9] px-4 py-3" data-testid={`row-tip-${t.reference}`}><div className="min-w-[160px]"><p className="text-sm font-semibold">{t.message||'A thank-you, shared'}</p><p className="mt-1 text-xs text-[#8a6e5e]">{dateLabel(t.createdAt)}{t.rating ? ` · ${t.rating}/5 rating` : ''} · {t.reference}</p></div><div className="ml-auto text-right"><p className="font-bold text-[#581C2B]">{KWD(t.amountFils)}</p><p className="text-[10px] text-[#8a6e5e]">simulated</p></div></div>)}</div>;
}
function WorkerPage() {
  const workersQ=useListWorkers({query:{queryKey:getListWorkersQueryKey()}});
  const workers=workersQ.data||[]; const [selected,setSelected]=useState(''); const workerId=selected||workers[0]?.publicId||'';
  const dashboardQ=useGetWorkerDashboard(workerId,{query:{enabled:!!workerId,queryKey:getGetWorkerDashboardQueryKey(workerId)}});
  const d=dashboardQ.data as WorkerDashboard|undefined;
  const publicUrl = d ? new URL(d.qrUrl, window.location.origin).toString() : '';
  return <Shell demo><PageTitle eyebrow="SANAD worker space" title="Your appreciation, in view." description="A clear look at demo tips, your public QR destination, and monthly settlement status." action={<SelectField label="Demo worker" value={workerId} onChange={e=>setSelected(e.target.value)}><option value="">Choose worker</option>{workers.map(w=><option key={w.id} value={w.publicId}>{w.name} · {w.workplace}</option>)}</SelectField>}/>
    <div className="mb-5 rounded-xl bg-[#fff0df] px-4 py-3 text-xs leading-5 text-[#754832]">Worker registration is disabled until secure sign-in is configured. Existing worker QR pages remain available.</div>
    {workersQ.isLoading?<LoadingCards/>:workersQ.isError?<QueryError retry={()=>workersQ.refetch()}/>:!workers.length?<Panel title="Set up a sample worker"><p className="text-sm text-[#765b4e]">Register a fictional worker profile to create the first QR tipping page.</p></Panel>:dashboardQ.isLoading?<LoadingCards/>:dashboardQ.isError?<QueryError retry={()=>dashboardQ.refetch()}/>:d&&<>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="This month" value={KWD(d.monthlyFils)} icon={Banknote} detail="Simulated tips"/><Stat label="Appreciations" value={String(d.totalTips)} icon={Heart} detail="Demo records"/><Stat label="Average rating" value={d.averageRating?`${d.averageRating.toFixed(1)} / 5`:'—'} icon={Star} detail="Optional feedback only"/><Stat label="Settlement preview" value={d.settlementStatus} icon={Clock3} detail="No payout is made"/></div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[.88fr_1.12fr]"><Panel title="Your public tip QR" aside={<span className="rounded-full bg-[#f8e7db] px-3 py-1 text-[10px] font-semibold text-[#94523d]">No account required</span>}>
        <div className="grid gap-4 sm:grid-cols-[1fr_168px] sm:items-center"><div className="flex items-center gap-3"><div className="relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-[#f5e4d5] font-bold text-[#581C2B]">{d.worker.name.split(' ').map(x=>x[0]).slice(0,2).join('')}{d.worker.avatarUrl&&<img src={d.worker.avatarUrl} alt="" onError={e=>e.currentTarget.style.display='none'} className="absolute inset-0 h-full w-full object-cover"/>}</div><div><p className="font-[Manrope] text-2xl font-extrabold">{d.worker.name}</p><p className="mt-1 text-sm text-[#765b4e]">{d.worker.jobTitle} · {d.worker.workplace}</p></div></div><div><p className="mt-3 break-all rounded-xl bg-[#f7eadb] px-3 py-2 font-mono text-xs text-[#795a49]">{publicUrl}</p><div className="mt-4 flex flex-wrap gap-2"><Link className="btn-primary text-xs" href={`/tip/${d.worker.publicId}`}>Preview tip page <ArrowRight className="ml-1 inline" size={13}/></Link><button className="rounded-full border border-[#e0cdbb] px-4 py-2 text-xs font-bold" onClick={()=>navigator.clipboard?.writeText(publicUrl)}>Copy QR link</button><button className="rounded-full border border-[#e0cdbb] px-4 py-2 text-xs font-bold" onClick={()=>window.print()}><Download className="mr-1 inline" size={13}/>Print badge</button></div></div><div className="grid place-items-center rounded-2xl border-[7px] border-[#fff] bg-[#f6e7d5] p-3 shadow-inner sm:col-start-2 sm:row-start-1"><QRCodeSVG value={publicUrl} size={132} level="M" fgColor="#581C2B" bgColor="#F6E7D5" title={`SANAD tip QR for ${d.worker.name}`}/><span className="mt-1 text-center text-[9px] font-bold text-[#765b4e]">SANAD DEMO QR</span></div></div>
        <div className="print-badge"><div><b>SANAD · سند</b><p>{d.worker.name}</p><small>{d.worker.jobTitle} · {d.worker.workplace}</small><small>Scan. Send. Done.</small></div><QRCodeSVG value={publicUrl} size={150} level="M" fgColor="#581C2B" bgColor="#ffffff"/></div></Panel>
        <Panel title="Recent appreciation" aside={<span className="text-[10px] text-[#8a6e5e]">Demo ledger</span>}><WorkerTipList tips={d.recentTips} loading={dashboardQ.isLoading}/></Panel></div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2"><Panel title="Settlement history" aside={<span className="text-[10px] text-[#8a6e5e]">Simulated only</span>}>{d.settlements.length===0?<Empty title="No settlement history" detail="Existing monthly settlement records will appear here."/>:<div className="space-y-2">{d.settlements.map(s=><div key={s.id} className="flex items-center justify-between rounded-xl bg-[#fff5e9] px-4 py-3"><div><p className="text-sm font-semibold">{s.month}</p><p className="text-xs text-[#8a6e5e]">{s.status}</p></div><b>{KWD(s.amountFils)}</b></div>)}</div>}</Panel><div className="rounded-2xl border border-[#f0d6b8] bg-[#fff0df] p-5 text-sm leading-6 text-[#754832]"><b>About monthly settlements.</b> This is a visual preview for the prototype. No bank, KNET, wallet, or other payment connection is active.</div></div>
    </>}</Shell>;
}

function TipPage() {
  const {publicId=''}=useParams(); const qc=useQueryClient();
  const wq=useGetWorkerByPublicId(publicId,{query:{queryKey:getGetWorkerByPublicIdQueryKey(publicId)}});
  const create=useCreateDemoTip(); const [,go]=useLocation();
  const [amount,setAmount]=useState(500); const [custom,setCustom]=useState(''); const [rating,setRating]=useState(0); const [message,setMessage]=useState('');
  const actual=custom?amountInKwd(custom):amount;
  const supportedAmount=actual===250||actual===500||actual===1000;
  const send=()=>create.mutate({data:{publicId,amountFils:actual as 250|500|1000,rating:rating||null,message:message.trim()||null}}, {onSuccess:tip=>{qc.invalidateQueries({queryKey:getGetWorkerDashboardQueryKey(publicId)});qc.invalidateQueries({queryKey:getListTipsQueryKey({publicId})});qc.setQueryData(getGetTipReceiptQueryKey(tip.reference),tip);go(`/receipt/${tip.reference}`);}});
  return <Shell><div className="mx-auto max-w-[510px]">
    {wq.isLoading?<div className="card-warm rounded-[30px] p-7"><div className="skeleton h-20"/><div className="skeleton mt-4 h-36"/></div>:wq.isError?<QueryError retry={()=>wq.refetch()}/>:wq.data&&<div className="card-warm overflow-hidden rounded-[30px] p-5 sm:p-7">
      <div className="flex items-center justify-between"><Brand compact/><span className="rounded-full bg-[#f7e9dc] px-3 py-1.5 text-[10px] font-bold text-[#82583f]"><ShieldAlert size={12} className="mr-1 inline"/>DEMO ONLY</span></div>
      <div className="mt-5 rounded-[22px] bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3"><div className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-[#f5e4d5] font-[Manrope] text-lg font-extrabold text-[#581C2B]">{wq.data.name.split(' ').map(x=>x[0]).slice(0,2).join('')}{wq.data.avatarUrl&&<img src={wq.data.avatarUrl} alt="" onError={e=>e.currentTarget.style.display='none'} className="absolute inset-0 h-full w-full object-cover"/>}</div><div className="min-w-0 flex-1"><span className="rounded-full bg-[#f8e5dd] px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-[#a25844]">{wq.data.jobTitle}</span><h1 className="mt-1 truncate font-[Manrope] text-lg font-extrabold">{wq.data.name}</h1><p className="truncate text-xs text-[#80695b]">{wq.data.workplace}</p></div><BadgeCheck className="text-[#EF805F]" size={20}/></div>
        <div className="mt-4 flex items-center justify-between rounded-full bg-[#fff5ea] px-3 py-2 text-xs"><span className="flex items-center gap-1 font-bold text-[#8f4837]"><Star fill="#EF805F" size={13} className="text-[#EF805F]"/> Thank a local hero</span><span className="text-[#876d5d]">Public demo</span></div>
      </div>
      <div className="my-4 rounded-xl bg-[#fff0df] p-3 text-xs leading-5 text-[#76543d]"><b>No SANAD account needed.</b> This flow records a simulated thank-you only. It does not process a payment.</div>
      <div className="flex items-end justify-between"><h2 className="font-[Manrope] text-lg font-extrabold">Choose a tip amount</h2><span className="text-[10px] text-[#80695b]">Kuwaiti fils · KWD</span></div>
      <div className="mt-3 grid grid-cols-3 gap-2">{[250,500,1000].map(n=><button key={n} onClick={()=>{setAmount(n);setCustom('')}} className={`rounded-2xl border px-2 py-3 transition ${!custom&&amount===n?'border-[#EF805F] bg-[#fff0e7] text-[#581C2B] ring-1 ring-[#EF805F]':'border-[#eadbcc] bg-white'}`}><b className="block text-lg">{n===1000?'1.000':n}</b><span className="text-[10px] text-[#80695b]">{n===1000?'KWD':'fils'}</span></button>)}</div>
      <label className="mt-3 block text-xs font-semibold text-[#765b4e]">Custom amount in KWD <input type="number" min="0.001" step=".001" placeholder="e.g. 0.500" value={custom} onChange={e=>setCustom(e.target.value)} className="soft-input mt-1.5"/>{custom&&!supportedAmount&&<span className="mt-1 block text-[10px] font-normal text-[#a34d3d]">For this prototype, choose 0.250, 0.500, or 1.000 KWD.</span>}</label>
      <div className="mt-4 rounded-2xl bg-white p-4"><div className="flex items-center justify-between"><b className="text-xs">Leave a compliment (optional)</b><span className="text-[10px] text-[#8a6e5e]">Choose a rating</span></div><div className="mt-2 flex gap-1">{[1,2,3,4,5].map(x=><button key={x} aria-label={`Rate ${x} out of 5`} className={`p-1 ${rating>=x?'text-[#EF805F]':'text-[#d7c7b8]'}`} onClick={()=>setRating(rating===x?0:x)}><Star fill={rating>=x?'currentColor':'none'} size={19}/></button>)}</div><div className="mt-2 flex flex-wrap gap-2">{['Great service','Thank you','Made my day'].map(s=><button key={s} onClick={()=>setMessage(s)} className={`rounded-full px-3 py-1.5 text-[10px] ${message===s?'bg-[#581C2B] text-white':'bg-[#f7eadb] text-[#65473a]'}`}>{s}</button>)}</div><textarea className="soft-input mt-3 min-h-[68px] resize-y text-sm" maxLength={240} placeholder="Write a kind note, if you like…" value={message} onChange={e=>setMessage(e.target.value)}/></div>
      <button className="btn-primary mt-4 flex w-full items-center justify-center gap-2 py-4 disabled:cursor-not-allowed disabled:opacity-50" disabled={create.isPending||!supportedAmount} onClick={send}>{create.isPending?'Saving demo thank-you…':`Record simulated thank-you · ${actual>0?(actual/1000).toFixed(3):'0.000'} KWD`}<ArrowRight size={17}/></button>
      <p className="mt-3 text-center text-[10px] leading-4 text-[#8b7566]">No payment is made. This prototype stores a demo record for demonstration purposes only.</p>
    </div>}</div></Shell>;
}
function ReceiptPage() {
 const {reference=''}=useParams(); const q=useGetTipReceipt(reference,{query:{queryKey:getGetTipReceiptQueryKey(reference)}}); const tip=q.data;
 return <Shell><div className="mx-auto max-w-[580px]"><PageTitle eyebrow="Demo receipt" title="A thank-you, recorded." description="This receipt confirms a prototype entry only. It is not a payment confirmation."/>
 {q.isLoading?<div className="card-warm rounded-3xl p-8"><div className="skeleton h-24"/><div className="skeleton mt-4 h-32"/></div>:q.isError?<QueryError retry={()=>q.refetch()}/>:tip&&<div className="card-warm rounded-3xl p-7 text-center sm:p-10"><span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#f8e8d9] text-[#8b4d3a]"><Clock3 size={26}/></span><p className="mt-4 text-[10px] font-bold uppercase tracking-[.2em] text-[#ad6955]">Simulated · no money moved</p><p className="mt-3 font-[Manrope] text-4xl font-extrabold text-[#581C2B]">{KWD(tip.amountFils)}</p><p className="mt-2 text-sm text-[#765b4e]">A thank-you for <b>{tip.workerName}</b></p><div className="my-6 border-t border-dashed border-[#ddcbb8]"/><dl className="grid grid-cols-2 gap-y-4 text-left text-sm"><dt className="text-[#80695b]">Reference</dt><dd className="text-right font-mono text-xs">{tip.reference}</dd><dt className="text-[#80695b]">Status</dt><dd className="text-right font-semibold">{tip.status==='demo_completed'?'Demo record complete':'Pending demo'}</dd><dt className="text-[#80695b]">Date</dt><dd className="text-right">{shortDate(tip.createdAt)}</dd>{tip.rating&&<><dt className="text-[#80695b]">Rating</dt><dd className="text-right">{tip.rating} / 5</dd></>}{tip.message&&<><dt className="text-[#80695b]">Message</dt><dd className="text-right">{tip.message}</dd></>}</dl><Link href="/" className="btn-primary mt-7 inline-flex items-center gap-2">Back to SANAD <ArrowRight size={15}/></Link></div>}</div></Shell>;
}

function CompanyPage() {
 const summary=useGetCompanySummary({query:{queryKey:getGetCompanySummaryQueryKey()}}); const settlements=useListSettlements({query:{queryKey:getListSettlementsQueryKey()}});
 return <Shell demo><PageTitle eyebrow="Company & hospitality" title="A clearer view of appreciation." description="Review simulated worker totals and existing settlement previews." action={<span className="rounded-full bg-[#f8e7db] px-3 py-2 text-[10px] font-semibold text-[#94523d]">Read-only</span>}/>
 <div className="mb-5 rounded-xl bg-[#fff0df] px-4 py-3 text-xs leading-5 text-[#754832]">Settlement creation and status changes are disabled until secure sign-in is configured. Existing previews remain visible.</div>
  {summary.isLoading||settlements.isLoading?<LoadingCards/>:summary.isError?<QueryError retry={()=>summary.refetch()}/>:<><div className="grid gap-4 sm:grid-cols-3"><Stat label="Workers" value={String(summary.data?.workers.length||0)} icon={Users} detail="In this demo company"/><Stat label="This month" value={KWD(summary.data?.monthFils)} icon={Banknote} detail="Simulated total"/><Stat label="Tip records" value={String(summary.data?.totalTips||0)} icon={Heart} detail="No live money movement"/></div><div className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><Panel title="Worker appreciation"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-[10px] uppercase tracking-wider text-[#8a6e5e]"><tr><th className="pb-3">Worker</th><th className="pb-3">Tips</th><th className="pb-3">Rating</th><th className="pb-3 text-right">Amount</th></tr></thead><tbody>{summary.data?.workers.map(item=><tr key={item.worker.id} className="border-t border-[#f0e2d4]"><td className="py-3"><b className="block">{item.worker.name}</b><span className="text-xs text-[#8a6e5e]">{item.worker.workplace}</span></td><td className="py-3">{item.totalTips}</td><td className="py-3">{item.averageRating?`${item.averageRating.toFixed(1)} / 5`:'—'}</td><td className="py-3 text-right font-bold">{KWD(item.monthFils)}</td></tr>)}</tbody></table>{!summary.data?.workers.length&&<Empty title="No worker activity yet" detail="Worker totals appear after demo tips are recorded."/ >}</div></Panel><Panel title="Monthly settlement preview" aside={<span className="text-[10px] text-[#8a6e5e]">Simulated statuses</span>}>{!settlements.data?.length?<Empty title="No settlement previews" detail="Settlement previews are read-only until secure sign-in is configured."/>:<div className="space-y-2">{settlements.data.map(s=><div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#fff5e9] px-4 py-3"><div><p className="text-sm font-semibold">{s.workerName}</p><p className="text-xs text-[#8a6e5e]">{s.month} · {s.status}</p></div><div className="flex items-center gap-3"><b>{KWD(s.amountFils)}</b><span className="text-[10px] text-[#8a6e5e]">Read-only</span></div></div>)}</div>}</Panel></div></>}</Shell>;
}

function ChildSelect({ children, onChange, value }: { children?: Child[]; onChange:(e:React.ChangeEvent<HTMLSelectElement>)=>void; value:string }) { return <SelectField label="Child profile" value={value} onChange={onChange}><option value="">Choose profile</option>{children?.map(c=><option key={c.id} value={c.id}>{c.name} · age {c.age}</option>)}</SelectField>; }
function ChildQrCard({ child }: { child: Child }) {
 const [copied,setCopied]=useState(false);
 const firstName=child.name.trim().split(/\s+/)[0]||'Child';
 const url=publicUrlForPath(`/give/${child.publicId}`);
 const copyLink=async()=>{try{await navigator.clipboard.writeText(url);setCopied(true)}catch{setCopied(false)}};
 return <div className="flex flex-col gap-4 rounded-2xl bg-[#fff5e9] p-4 sm:flex-row sm:items-center">
  <div className="grid shrink-0 place-items-center rounded-2xl border-[5px] border-white bg-[#f6e7d5] p-2 shadow-inner"><QRCodeSVG value={url} size={104} level="M" fgColor="#581C2B" bgColor="#F6E7D5" title={`SANAD direct transfer QR for ${firstName}`}/></div>
  <div className="min-w-0 flex-1"><p className="font-[Manrope] text-lg font-extrabold">{firstName}</p><p className="mt-1 text-xs leading-5 text-[#80695b]">Scan to send a simulated transfer directly to this child. No account needed.</p><p className="mt-2 break-all font-mono text-[10px] text-[#8a6e5e]">{url}</p><div className="mt-3 flex flex-wrap gap-2"><Link className="btn-primary text-xs" href={`/give/${child.publicId}`}>Open transfer page <ArrowRight className="ml-1 inline" size={13}/></Link><button className="flex items-center gap-1 rounded-full border border-[#e0cdbb] px-3 py-2 text-xs font-bold" onClick={copyLink}><Copy size={13}/>{copied?'Copied':'Copy QR link'}</button></div></div>
 </div>;
}
function FamilyPage() {
  const childrenQ=useListChildren({query:{queryKey:getListChildrenQueryKey()}});
 const [selected,setSelected]=useState(''); const current=selected||String(childrenQ.data?.[0]?.id||'');
 const dash=useGetChildDashboard(Number(current||0),{query:{enabled:!!current,queryKey:getGetChildDashboardQueryKey(Number(current||0))}});
  return <Shell demo><PageTitle eyebrow="Family & Eidiyah" title="Give them room to grow." description="A demo family space for allowance, Eidiyah, savings goals, and purchase approvals." action={<span className="rounded-full bg-[#f8e7db] px-3 py-2 text-[10px] font-semibold text-[#94523d]">Read-only</span>}/>
  <div className="mb-5 rounded-xl bg-[#fff0df] px-4 py-3 text-xs leading-5 text-[#754832]">Family account changes and approvals are disabled until secure sign-in is configured. Existing profiles, activity, goals, and child QR links remain visible.</div>
  {childrenQ.isLoading?<div className="mt-5"><LoadingCards/></div>:childrenQ.isError?<div className="mt-5"><QueryError retry={()=>childrenQ.refetch()}/></div>:!childrenQ.data?.length?<div className="mt-5"><Empty title="No child profiles" detail="Profile creation is disabled until secure sign-in is configured."/></div>:<>
   <div className="mb-5 max-w-xs"><ChildSelect children={childrenQ.data} value={current} onChange={e=>setSelected(e.target.value)}/></div>
   <div className="mb-5"><Panel title="Child transfer QR codes" aside={<span className="text-[10px] text-[#8a6e5e]">Demo transfers · no account needed</span>}><p className="mb-4 text-xs leading-5 text-[#80695b]">Each QR opens a public send page. Anyone with the code can record a simulated transfer; no real money moves.</p><div className="grid gap-3 lg:grid-cols-2">{childrenQ.data.map(child=><ChildQrCard key={child.id} child={child}/>)}</div></Panel></div>
 {dash.isLoading?<LoadingCards/>:dash.isError?<QueryError retry={()=>dash.refetch()}/>:dash.data&&<><div className="grid gap-4 sm:grid-cols-3"><Stat label="Wallet balance" value={KWD(dash.data.child.balanceFils)} icon={Wallet} detail="Simulated wallet only"/><Stat label="Spending limit" value={KWD(dash.data.child.spendingLimitFils)} icon={Banknote} detail="Monthly guidance"/><Stat label="Savings goals" value={String(dash.data.goals.length)} icon={Sparkles} detail="Keep a small goal in sight"/></div>
 <div className="mt-5 grid gap-5 lg:grid-cols-2">
    <Panel title="Allowance & Eidiyah"><p className="text-sm leading-6 text-[#80695b]">Allowance records and spending-limit changes are disabled until secure sign-in is configured. Existing balance and activity remain available above.</p></Panel>
   <Panel title="Savings goals · read-only">{dash.data.goals.length===0?<Empty title="No savings goals" detail="Goal creation is disabled until secure sign-in is configured."/>:<div className="space-y-2">{dash.data.goals.map(g=><GoalRow key={g.id} name={g.name} saved={g.savedFils} target={g.targetFils}/>)}</div>}</Panel>
   <Panel title="Requests to review">{dash.data.approvals.length===0?<Empty title="All caught up" detail="No purchase requests are waiting for a parent decision."/>:<div className="space-y-2">{dash.data.approvals.map(a=><div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#fff5e9] px-4 py-3"><div><b className="text-sm">{a.item}</b><p className="text-xs text-[#80695b]">{KWD(a.amountFils)} · {a.status}</p></div>{a.status==='pending'&&<span className="text-[10px] text-[#8a6e5e]">Decision disabled</span>}</div>)}</div>}</Panel>
  </div><div className="mt-5"><Panel title="Recent family activity">{dash.data.activity.length===0?<Empty title="No activity yet" detail="Existing records and simulated child QR transfers appear here."/>:<div className="divide-y divide-[#f0e2d4]">{dash.data.activity.map(a=><div key={a.id} className="flex items-center justify-between py-3"><div><p className="text-sm font-semibold">{a.title}</p><p className="text-xs text-[#80695b]">{a.kind} · {dateLabel(a.createdAt)}</p></div><b>{KWD(a.amountFils)}</b></div>)}</div>}</Panel></div></>}
 </>}</Shell>;
}
function GoalRow({name,saved,target}:{name:string;saved:number;target:number}) {
 const pct=target?Math.min(100,Math.round(saved/target*100)):0;
 return <div className="rounded-xl bg-[#fff5e9] px-4 py-3"><div className="flex items-center justify-between gap-2"><div><p className="text-sm font-semibold">{name}</p><p className="text-[10px] text-[#80695b]">{KWD(saved)} saved of {KWD(target)}</p></div><span className="text-[10px] text-[#8a6e5e]">Read-only</span></div><div className="mt-2 h-1.5 rounded-full bg-[#eadbcc]"><div className="h-1.5 rounded-full bg-[#EF805F]" style={{width:`${pct}%`}}/></div></div>;
}
function ChildPage() {
 const {id='1'}=useParams(); const dashboard=useGetChildDashboard(Number(id),{query:{queryKey:getGetChildDashboardQueryKey(Number(id))}});
 return <Shell demo><PageTitle eyebrow="My SANAD wallet" title="Hi there, {name}." description="A friendly view of your demo balance, activity, and savings goals."/>
  <div className="mb-5 rounded-xl bg-[#fff0df] px-4 py-3 text-xs leading-5 text-[#754832]">Requests and wallet changes are disabled until secure sign-in is configured. This demo wallet is read-only.</div>
 {dashboard.isLoading?<LoadingCards/>:dashboard.isError?<QueryError retry={()=>dashboard.refetch()}/>:dashboard.data&&<><div className="rounded-[28px] bg-[#581C2B] p-6 text-[#fff4e5] md:p-9"><div className="flex flex-wrap items-start justify-between gap-4"><div><span className="text-[10px] font-bold uppercase tracking-[.2em] text-[#efbda3]">Demo wallet</span><h1 className="mt-2 font-[Manrope] text-3xl font-extrabold">Hello, {dashboard.data.child.name}</h1><p className="mt-1 text-sm text-[#ead0bd]">Your family wallet is for practice only.</p></div><div className="text-right"><p className="text-xs text-[#e6c6ae]">Available balance</p><p className="mt-1 text-3xl font-extrabold">{KWD(dashboard.data.child.balanceFils)}</p></div></div><div className="mt-6 flex flex-wrap gap-2">{dashboard.data.goals.map(g=><span key={g.id} className="rounded-full bg-white/10 px-3 py-2 text-xs">{g.name} · {KWD(g.savedFils)} / {KWD(g.targetFils)}</span>)}</div></div>
  <div className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><Panel title="Purchase requests · read-only">{dashboard.data.approvals.length?<div className="space-y-2">{dashboard.data.approvals.map(a=><div key={a.id} className="flex items-center justify-between rounded-xl bg-[#fff5e9] px-4 py-3"><div><b className="text-sm">{a.item}</b><p className="text-xs text-[#80695b]">{KWD(a.amountFils)}</p></div><span className={`rounded-full px-3 py-1 text-[10px] font-bold ${a.status==='approved'?'bg-[#e3f0df] text-[#456c42]':a.status==='rejected'?'bg-[#f6e2dc] text-[#984d3b]':'bg-[#f7ebd8] text-[#835e32]'}`}>{a.status}</span></div>)}</div>:<p className="text-sm text-[#80695b]">No purchase requests are recorded.</p>}</Panel>
 <Panel title="Activity"><div className="space-y-1">{dashboard.data.activity.length?dashboard.data.activity.map(a=><div key={a.id} className="flex items-center justify-between border-b border-[#f0e2d4] py-3"><div><p className="text-sm font-semibold">{a.title}</p><p className="text-xs text-[#80695b]">{a.kind} · {dateLabel(a.createdAt)}</p></div><b className="text-sm">{KWD(a.amountFils)}</b></div>):<Empty title="Your story starts here" detail="Allowance, Eidiyah, savings, and purchases will show here."/ >}</div></Panel></div></>}
 </Shell>;
}

function ChildTransferPage() {
 const {publicId=''}=useParams();
 const recipient=useGetPublicChildRecipient(publicId,{query:{queryKey:getGetPublicChildRecipientQueryKey(publicId)}});
 const transfer=useCreatePublicChildTransfer();
 const [amount,setAmount]=useState('0.500');
 const rawAmount=Number(amount)*1000;
 const amountFils=Math.round(rawAmount);
 const validAmount=Number.isFinite(rawAmount)&&Math.abs(rawAmount-amountFils)<0.0001&&amountFils>=250&&amountFils<=1_000_000;
 const send=()=>transfer.mutate({publicId,data:{amountFils}});

 return <Shell demo publicPage><div className="mx-auto max-w-[540px]">
  {recipient.isLoading?<div className="card-warm rounded-[30px] p-7"><div className="skeleton h-24"/><div className="skeleton mt-4 h-48"/></div>:recipient.isError?<div className="card-warm rounded-[30px] p-7 text-center"><QrCode className="mx-auto mb-3 text-[#EF805F]" size={28}/><h1 className="font-[Manrope] text-xl font-extrabold">This child QR is not available</h1><p className="mt-2 text-sm text-[#765b4e]">Ask the family to share a current QR code.</p><Link href="/" className="btn-primary mt-5 inline-flex">Return to SANAD</Link></div>:recipient.data&&<div className="card-warm overflow-hidden rounded-[30px] p-5 sm:p-7">
   <div className="flex items-center justify-between"><Brand compact/><span className="rounded-full bg-[#f7e9dc] px-3 py-1.5 text-[10px] font-bold text-[#82583f]"><ShieldAlert size={12} className="mr-1 inline"/>DEMO ONLY</span></div>
   {transfer.data?<div className="mt-6 rounded-[24px] bg-white p-6 text-center shadow-sm sm:p-8"><CheckCircle2 className="mx-auto text-[#53764b]" size={44}/><p className="mt-3 text-[10px] font-bold uppercase tracking-[.2em] text-[#ad6955]">Simulated · no money moved</p><h1 className="mt-2 font-[Manrope] text-2xl font-extrabold">Transfer recorded</h1><p className="mt-2 text-sm text-[#765b4e]">Your demo transfer was added to {transfer.data.firstName}’s SANAD wallet.</p><p className="mt-5 font-[Manrope] text-4xl font-extrabold text-[#581C2B]">{KWD(transfer.data.amountFils)}</p><p className="mt-2 text-xs text-[#80695b]">{shortDate(transfer.data.createdAt)}</p><button className="btn-primary mt-6 w-full" onClick={()=>{transfer.reset();setAmount('0.500')}}>Send another demo transfer</button></div>:<>
    <div className="mt-5 rounded-[22px] bg-white p-4 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#b66e59]">Recipient</p><h1 className="mt-1 font-[Manrope] text-2xl font-extrabold text-[#3B1720]">{recipient.data.firstName}</h1><p className="mt-1 text-xs text-[#80695b]">SANAD child wallet</p></div>
    <div className="my-4 rounded-xl bg-[#fff0df] p-3 text-xs leading-5 text-[#76543d]"><b>No SANAD account needed.</b> Choose an amount to record a direct demo transfer. This does not process a payment or move money.</div>
    <h2 className="font-[Manrope] text-lg font-extrabold">Choose an amount</h2>
    <div className="mt-3 grid grid-cols-3 gap-2">{[250,500,1000].map(fils=>{const value=(fils/1000).toFixed(3);return <button key={fils} type="button" onClick={()=>setAmount(value)} className={`rounded-2xl border px-2 py-3 transition ${amount===value?'border-[#EF805F] bg-[#fff0e7] text-[#581C2B] ring-1 ring-[#EF805F]':'border-[#eadbcc] bg-white'}`}><b className="block text-lg">{value}</b><span className="text-[10px] text-[#80695b]">KWD</span></button>})}</div>
    <Field label="Custom amount in KWD" type="number" min=".250" max="1000" step=".001" value={amount} onChange={e=>setAmount(e.target.value)}/>
    {!validAmount&&<p className="mt-1 text-[10px] text-[#a34d3d]">Choose at least 0.250 KWD and no more than 1,000 KWD.</p>}
    {transfer.isError&&<p className="mt-3 text-xs text-red-700">Could not record the demo transfer. Please try again.</p>}
    <button className="btn-primary mt-4 flex w-full items-center justify-center gap-2 py-4 disabled:cursor-not-allowed disabled:opacity-50" disabled={transfer.isPending||!validAmount} onClick={send}>{transfer.isPending?'Recording demo transfer…':`Send demo transfer · ${validAmount?(amountFils/1000).toFixed(3):'0.000'} KWD`}<ArrowRight size={17}/></button>
    <p className="mt-3 text-center text-[10px] leading-4 text-[#8b7566]">No account, sign-in, or payment method is required. This is a public demo page; only the child’s first name is shown.</p>
   </>}
  </div>}
 </div></Shell>;
}

function IndividualPage() {
 const qc=useQueryClient(); const transfers=useListDemoTransfers({query:{queryKey:getListDemoTransfersQueryKey()}});
 const create=useCreateDemoTransfer({mutation:{onSuccess:()=>qc.invalidateQueries({queryKey:getListDemoTransfersQueryKey()})}});
 const [mode,setMode]=useState<'send'|'request'>('send'); const [sender,setSender]=useState('You'); const [recipient,setRecipient]=useState(''); const [amount,setAmount]=useState(''); const [search,setSearch]=useState('');
 const submit=()=>create.mutate({data:{sender,recipient:mode==='request'?`${recipient} (request)`:recipient,amountFils:amountInKwd(amount)}},{onSuccess:()=>{setRecipient('');setAmount('')}});
 return <Shell demo><PageTitle eyebrow="Individual demo" title="Move a little kindness." description="Explore a simulated send or request and review demo history. No real transfers are made."/>
 <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]"><Panel title="Send or request"><div className="mb-5 flex rounded-full bg-[#f4e8dc] p-1"><button className={`flex-1 rounded-full py-2 text-xs font-bold ${mode==='send'?'bg-[#581C2B] text-white':''}`} onClick={()=>setMode('send')}>Send demo</button><button className={`flex-1 rounded-full py-2 text-xs font-bold ${mode==='request'?'bg-[#581C2B] text-white':''}`} onClick={()=>setMode('request')}>Request demo</button></div><div className="grid gap-3"><Field label="From" value={sender} onChange={e=>setSender(e.target.value)}/><Field label={mode==='send'?'Send to':'Request from'} value={recipient} onChange={e=>setRecipient(e.target.value)} placeholder="A name"/><Field label="Amount (KWD)" type="number" min=".001" step=".001" value={amount} onChange={e=>setAmount(e.target.value)}/><button className="btn-primary mt-1" disabled={create.isPending||!recipient||!amount||!sender} onClick={submit}>{create.isPending?'Saving demo…':mode==='send'?'Record simulated send':'Record simulated request'} <ArrowRight className="ml-1 inline" size={14}/></button><p className="text-[10px] leading-4 text-[#80695b]">This is a recorded demo entry only; the prototype does not transfer funds.</p></div></Panel>
  <Panel title="Transfer history" aside={<label className="relative"><Search className="absolute left-3 top-2.5 text-[#9a7966]" size={14}/><input className="soft-input w-40 py-2 pl-8 text-xs" placeholder="Filter names" value={search} onChange={e=>setSearch(e.target.value)}/></label>}>{transfers.isLoading?<ListSkeleton/>:transfers.isError?<QueryError retry={()=>transfers.refetch()}/>:!transfers.data?.filter(t=>`${t.sender} ${t.recipient}`.toLowerCase().includes(search.toLowerCase())).length?<Empty title="Nothing in the ledger yet" detail="Your demo transfers and requests will appear here."/>:<div className="space-y-2">{transfers.data.filter(t=>`${t.sender} ${t.recipient}`.toLowerCase().includes(search.toLowerCase())).map(t=><div key={t.reference} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#fff5e9] px-4 py-3"><div><b className="text-sm">{t.sender} → {t.recipient}</b><p className="mt-1 text-xs text-[#80695b]">{t.reference} · {dateLabel(t.createdAt)}</p></div><div className="text-right"><b>{KWD(t.amountFils)}</b><p className="text-[10px] text-[#80695b]">simulated</p></div></div>)}</div>}</Panel></div></Shell>;
}

function AppRouter() {
 const [location]=useLocation();
 return <ErrorBoundary resetKey={location}><Switch>
  <Route path="/" component={Home}/><Route path="/tip/:publicId" component={TipPage}/><Route path="/receipt/:reference" component={ReceiptPage}/>
  <Route path="/worker" component={WorkerPage}/><Route path="/company" component={CompanyPage}/><Route path="/parent" component={FamilyPage}/>
   <Route path="/child/:id" component={ChildPage}/><Route path="/give/:publicId" component={ChildTransferPage}/><Route path="/individual" component={IndividualPage}/>
  <Route component={NotFound}/>
 </Switch></ErrorBoundary>;
}
function App() {
 return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/,'')}><AppRouter/></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>;
}
export default App;
