/**
 * CSRF origin check for authenticated administrator mutations.
 * In Coolify, req.url can be internal HTTP while the browser Origin is the
 * public HTTPS domain. Do NOT trust the client-controlled X-Forwarded-Host.
 *
 * Set ADMIN_PUBLIC_ORIGIN to the exact external dashboard origin.
 */
export function isAllowedAdminMutationOrigin(req:Request, configured=process.env.ADMIN_PUBLIC_ORIGIN):boolean{
 const origin=req.headers.get('origin');
 if(!origin||origin==='null')return false;
 try{
  const browser=new URL(origin);
  if(!['https:','http:'].includes(browser.protocol)||browser.username||browser.password||browser.pathname!=='/'||browser.search||browser.hash)return false;
  if(configured){
   const allowed=new URL(configured);
   if(!['https:','http:'].includes(allowed.protocol)||allowed.pathname!=='/'||allowed.search||allowed.hash)return false;
   return browser.origin===allowed.origin;
  }
  // Development-only direct-host fallback. Never trust forwarded host here.
  if(process.env.NODE_ENV==='production')return false;
  const target=new URL(req.url);
  return browser.origin===target.origin;
 }catch{return false}
}
