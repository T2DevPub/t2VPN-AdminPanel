import {countryName} from '@/lib/country';

export function CountryFlag({code}:{code:string|null|undefined}){
 const normalized=(code||'').trim().toUpperCase();
 if(!/^[A-Z]{2}$/.test(normalized))return <span aria-label="Unknown country" className="inline-block shrink-0">🌐</span>;
 // Render actual flag artwork instead of emoji: Windows often shows regional
 // indicator letters (e.g. IN) rather than a flag glyph.
 return <img
  src={'https://flagcdn.com/w40/'+normalized.toLowerCase()+'.png'}
  alt={normalized+' flag'}
  width={24} height={16} loading="lazy"
  className="inline-block h-4 w-6 shrink-0 rounded-[3px] border border-slate-200 object-cover align-middle"
 />;
}
export function CountryLabel({code,name,showCode=true}:{code:string|null|undefined;name?:string|null;showCode?:boolean}){
 const normalized=(code||'').trim().toUpperCase(),valid=/^[A-Z]{2}$/.test(normalized);
 return <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap"><CountryFlag code={code}/><span>{countryName(code,name)}{showCode&&valid?' ('+normalized+')':''}</span></span>;
}
