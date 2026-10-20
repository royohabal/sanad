import './_group.css';
import { ArrowRight, ArrowUpRight, BadgeCheck, BriefcaseBusiness, Coffee, Heart, Languages, Menu, QrCode, Sparkles, Users, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';

function Shell({ children }: { children: ReactNode }) {
  return <div className="app-shell grain">
    <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between bg-[#581C2B] px-5 text-white shadow-[0_5px_18px_rgba(59,23,32,.12)] md:px-9">
      <a href="/" className="inline-flex items-center gap-2.5 text-white no-underline">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#EF805F] text-[#3B1720]"><Heart size={18} strokeWidth={2.5}/></span>
        <span className="leading-tight"><b className="block font-[Manrope] text-[17px] tracking-[.12em]">SANAD <span className="font-sans tracking-normal">سند</span></b><small className="block text-[10px] tracking-[.14em] text-[#f4cfb9]">Scan. Send. Done.</small></span>
      </a>
      <nav className="hidden items-center gap-1 lg:flex">{[['Direct tip','/direct-tip'],['Worker','/worker'],['Company','/company'],['Parent','/parent'],['Child','/parent'],['Individual','/individual']].map(([title, href],index)=><a key={title} href={href} className={`rounded-full px-3 py-2 text-white transition hover:bg-white/10 ${index<3?'text-[13px] font-bold':'text-[11px] text-[#f7e9dc]'}`}>{title}</a>)}</nav>
      <div className="flex items-center gap-2"><button className="rounded-full border border-white/20 px-2.5 py-2 text-[11px]"><Languages size={14}/></button><span className="hidden rounded-full bg-[#EF805F] px-4 py-2 text-xs font-bold text-[#3B1720] md:block">Worker space <ArrowRight className="ml-1 inline" size={13}/></span><span className="hidden rounded-full border border-white/20 px-3 py-2 text-[11px] md:block">Sign in</span><Menu className="lg:hidden"/></div>
    </header>
    <main className="mx-auto max-w-[1220px] px-4 py-6 md:px-8 md:py-9">{children}</main>
    <footer className="mt-10 border-t border-[#eadbcc] bg-[#fff4e5] px-5 py-5 text-xs text-[#765b4e]"><div className="mx-auto flex max-w-[1220px] flex-wrap items-center justify-between gap-3"><b className="font-[Manrope] tracking-[.12em] text-[#581C2B]">SANAD سند</b><span>Kuwait’s community-first money prototype</span><span>All money movement shown is simulated.</span></div></footer>
  </div>;
}

export function CurrentHome() {
  const publicTipHref = '/direct-tip';
  const roles = [
    {name:'Worker', arabic:'موظف الخدمة', desc:'View appreciation, tips, your personal QR, and monthly settlement status.', icon:Coffee, href:'/worker', label:'WORKER SPACE'},
    {name:'Company', arabic:'الشركات والمنشآت', desc:'Review worker totals and existing monthly settlement records.', icon:BriefcaseBusiness, href:'/company', label:'FOR BUSINESSES'},
    {name:'Parent', arabic:'ولي الأمر', desc:'Manage child profiles, allowances, Eidiyah, goals, and approvals.', icon:Users, href:'/parent', label:'FAMILY CARE'},
    {name:'Child', arabic:'الأبناء', desc:'A parent-supervised wallet view for activity, goals, and spending requests.', icon:Wallet, href:'/parent', label:'SUPERVISED WALLET'},
    {name:'Individual', arabic:'الأفراد', desc:'Record a simulated person-to-person transfer and review its history.', icon:ArrowUpRight, href:'/individual', label:'EVERYDAY FINANCE'},
  ];
  return <Shell><div className="mx-auto max-w-[1120px] pt-4 text-left md:pt-8">
    <span className="inline-flex items-center gap-2 rounded-full bg-[#f7e8d8] px-4 py-2 text-[11px] font-semibold text-[#82583f]"><span className="h-2 w-2 rounded-full bg-[#EF805F]"/>Choose your SANAD journey</span>
    <div className="mt-7 grid items-center gap-8 lg:grid-cols-[1.05fr_.95fr]">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[.24em] text-[#b66955]">SANAD · سند / Made for everyday Kuwait</p>
        <h1 className="mt-3 max-w-[760px] font-[Manrope] text-[42px] font-extrabold leading-[1.04] tracking-[-.055em] text-[#3B1720] md:text-[66px]">A little thanks goes a long way.</h1>
        <p className="mt-5 max-w-[570px] text-base leading-7 text-[#765b4e] md:text-lg">Help Kuwait's service workers receive digital tips in seconds. No customer account required.</p>
        <div className="mt-7 flex flex-wrap gap-3"><a href={publicTipHref} className="btn-coral inline-flex items-center gap-2 text-sm">Direct tip <ArrowRight size={16}/></a><a href="/company" className="inline-flex items-center gap-2 rounded-full border border-[#ddc4b2] px-5 py-3 text-sm font-bold text-[#581C2B] hover:bg-[#fff5e9]">For Businesses <ArrowUpRight size={16}/></a></div>
        <p className="mt-4 text-xs text-[#907566]"><span dir="rtl">شكراً بسيطاً يصنع فرقاً كبيراً</span><span className="mx-2">·</span>English and Arabic</p>
      </div>
      <div className="relative overflow-hidden rounded-[30px] bg-[#581C2B] p-6 text-[#fff4e5] shadow-[0_20px_50px_rgba(88,28,43,.14)] md:p-8">
        <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full border border-[#ef805f]/30"/><div className="absolute -right-5 -top-9 h-44 w-44 rounded-full border border-[#ef805f]/25"/>
        <div className="relative"><div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-[.22em] text-[#f1b99d]">Three easy steps</span><QrCode size={23} className="text-[#ef805f]"/></div>
          <div className="mt-7 space-y-4">{[['01','Scan the worker’s SANAD QR','No customer sign-up'],['02','Choose a thank-you amount','250 fils · 500 fils · 1 KWD'],['03','Send your appreciation','Test-mode or clearly labelled simulated checkout']].map(([n,title,sub])=><div key={n} className="flex items-center gap-4 border-t border-white/15 pt-4"><span className="font-mono text-xs text-[#ef805f]">{n}</span><div><b className="block text-sm">{title}</b><span className="mt-1 block text-xs text-[#e7cbbc]">{sub}</span></div></div>)}</div>
          <div className="mt-5 rounded-xl bg-white/10 px-4 py-3 text-[11px] leading-5 text-[#f4d9c7]">Test mode or simulation only. No live money moves.</div>
        </div>
      </div>
    </div>
    <div className="mt-9 grid gap-4 md:grid-cols-2">
      {roles.slice(0,2).map(({name,arabic,desc,icon:Icon,href,label},i)=><a key={name} href={href} className={`card-warm group flex min-h-[190px] flex-col rounded-[23px] p-6 text-left no-underline transition duration-200 hover:-translate-y-1 hover:shadow-[0_18px_38px_rgba(88,28,43,.12)] enter ${i===0?'border-l-[5px] border-l-[#EF805F]':''}`}>
        <div className="flex items-start justify-between"><span className={`grid h-11 w-11 place-items-center rounded-[15px] ${i===1?'bg-[#EF805F] text-[#3B1720]':'bg-[#581C2B] text-[#fff4e5]'}`}><Icon size={20}/></span><span className="rounded-full bg-[#f8e6dc] px-3 py-1 text-[9px] font-bold tracking-[.12em] text-[#874b3a]">{label}</span></div>
        <div className="mt-5 flex items-baseline justify-between gap-2"><h2 className="font-[Manrope] text-xl font-extrabold tracking-tight text-[#3B1720]">{name}</h2><span dir="rtl" className="text-xs font-semibold text-[#a75d4d]">{arabic}</span></div>
        <p className="mt-2 max-w-md text-sm leading-6 text-[#796257]">{desc}</p>
        <span className="mt-auto flex items-center justify-between pt-5 text-xs font-bold text-[#581C2B]"><span>Explore demo space</span><span className="grid h-8 w-8 place-items-center rounded-full bg-[#f5e8d8] transition group-hover:bg-[#EF805F]"><ArrowRight size={15}/></span></span>
      </a>)}
    </div>
    <a href="/admin" className="card-warm group mt-4 flex min-h-[190px] w-full max-w-[550px] flex-col rounded-[23px] p-6 text-left no-underline transition duration-200 hover:-translate-y-1 hover:shadow-[0_18px_38px_rgba(88,28,43,.12)] enter">
      <div className="flex items-start justify-between"><span className="grid h-11 w-11 place-items-center rounded-[15px] bg-[#581C2B] text-[#fff4e5]"><BadgeCheck size={20}/></span><span className="rounded-full bg-[#f8e6dc] px-3 py-1 text-[9px] font-bold tracking-[.12em] text-[#874b3a]">PLATFORM OPERATIONS</span></div>
      <div className="mt-5 flex items-baseline justify-between gap-2"><h2 className="font-[Manrope] text-xl font-extrabold tracking-tight text-[#3B1720]">Admin</h2><span dir="rtl" className="text-xs font-semibold text-[#a75d4d]">إدارة SANAD</span></div>
      <p className="mt-2 max-w-md text-sm leading-6 text-[#796257]">Review company access and demo activity. Admin tools require an authorized SANAD account.</p>
      <span className="mt-auto flex items-center justify-between pt-5 text-xs font-bold text-[#581C2B]"><span>Explore admin space</span><span className="grid h-8 w-8 place-items-center rounded-full bg-[#f5e8d8] transition group-hover:bg-[#EF805F]"><ArrowRight size={15}/></span></span>
    </a>
    <div className="mt-5 grid gap-3 sm:grid-cols-3">{roles.slice(2).map(({name,arabic,desc,icon:Icon,href})=><a key={name} href={href} className="group flex items-start gap-3 rounded-2xl border border-[#eadbcc] bg-[#f8efe5] p-4 transition hover:bg-[#fff9f2]"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#efdfd0] text-[#87523e]"><Icon size={17}/></span><span><b className="block text-sm">{name} <small dir="rtl" className="ml-1 font-normal text-[#a75d4d]">{arabic}</small></b><span className="mt-1 block text-xs leading-5 text-[#80695b]">{desc}</span></span></a>)}</div>
    <div className="mt-8 flex flex-col items-center justify-between gap-4 rounded-[24px] bg-[#3B1720] px-6 py-6 text-[#fff4e5] md:flex-row md:px-9">
      <div className="flex items-center gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#EF805F] text-[#3B1720]"><Sparkles/></span><div><h2 className="font-[Manrope] text-lg font-bold">Just want to thank someone?</h2><p className="mt-1 text-xs text-[#ebd0bd]">No account required. Open a worker’s public demo tip page.</p></div></div>
      <a href={publicTipHref} className="btn-coral flex items-center gap-2 text-sm">Choose a worker to tip <ArrowRight size={16}/></a>
    </div>
  </div></Shell>;
}
