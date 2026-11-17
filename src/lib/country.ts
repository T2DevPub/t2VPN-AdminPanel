/** Shared country presentation for dashboard screens and mobile server metadata. */
const displayNames = new Intl.DisplayNames(['en'], {type:'region'});
export function countryFlag(value:string|null|undefined):string{
 const code=(value||'').trim().toUpperCase();
 if(!/^[A-Z]{2}$/.test(code))return '🌐';
 return String.fromCodePoint(...[...code].map(c=>127397+c.charCodeAt(0)));
}
export function countryName(value:string|null|undefined,provided?:string|null):string{
 const code=(value||'').trim().toUpperCase();
 const named=provided?.trim();
 if(named&&named.toUpperCase()!==code)return named;
 if(!/^[A-Z]{2}$/.test(code))return named||'Unknown country';
 const result=displayNames.of(code);
 return result&&result!==code?result:code;
}
export function countryLabel(value:string|null|undefined,provided?:string|null):string{
 const code=(value||'').trim().toUpperCase();
 const name=countryName(value,provided);
 return /^[A-Z]{2}$/.test(code)?countryFlag(code)+' '+name+' ('+code+')':'🌐 '+name;
}
export function serverLocation(country:string,city:string,countryCode:string):string{
 const name=countryName(countryCode,country);
 return city?.trim()?name+' · '+city.trim():name;
}
