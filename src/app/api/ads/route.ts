import {NextResponse} from 'next/server';
import {getMobileAds,PublicUnit} from '@/lib/mobile-ad-config';
export const runtime='nodejs';export const dynamic='force-dynamic';
// Legacy Android ad settings (non-secret ad placement IDs only).
// For mixed networks, use /api/mobile/ads instead: legacy clients assume one global network.
export async function GET(req:Request){
 try{
  const country=(new URL(req.url).searchParams.get('country')||'').toUpperCase();
  const c=await getMobileAds(country),ps=c.placements;
  const p=(key:string)=>ps.find(x=>x.key===key);
  const id=(key:string,provider:string)=>{const x=p(key);if(!x?.enabled)return '';return [x.primary,x.fallback].find((u):u is PublicUnit=>Boolean(u&&u.provider===provider))?.unitId||''};
  const network=(p('home_banner')?.primary?.provider||p('app_open')?.primary?.provider||'ADX');
  const provider=network==='META'?'Meta':network==='ADFOX'?'Yandex':'AdMob';
  return NextResponse.json({
   bannersEnabled:Boolean(p('home_banner')?.enabled),
   appOpenAdsEnabled:Boolean(p('app_open')?.enabled),
   interstitialOnConnect:false,interstitialOnDisconnect:false,interstitialOnFreeServerSelection:false,
   adNetworkProvider:provider,ruAdNetworkProvider:country==='RU'?provider:'Yandex',
   bannerAdUnitId:id('home_banner','ADX'),usageStatsBannerAdUnitId:id('usage_banner','ADX'),
   appOpenAdUnitId:id('app_open','ADX'),nativeAdUnitId:id('region_native','ADX'),rewardedAdUnitId:id('rewarded_unlock','ADX'),
   metaBannerAdUnitId:id('home_banner','META'),metaUsageStatsBannerAdUnitId:id('usage_banner','META'),
   metaAppOpenAdUnitId:id('app_open','META'),metaNativeAdUnitId:id('region_native','META'),metaRewardedAdUnitId:id('rewarded_unlock','META'),
   yandexBannerAdUnitId:id('home_banner','ADFOX'),yandexUsageStatsBannerAdUnitId:id('usage_banner','ADFOX'),
   yandexAppOpenAdUnitId:id('app_open','ADFOX'),yandexNativeAdUnitId:id('region_native','ADFOX'),yandexRewardedAdUnitId:id('rewarded_unlock','ADFOX'),
   interstitialAdUnitId:'',metaInterstitialAdUnitId:'',yandexInterstitialAdUnitId:'',
   freeServerInterstitialAdUnitId:'',metaFreeServerInterstitialAdUnitId:'',yandexFreeServerInterstitialAdUnitId:'',
   enablePremiumServerRewards:c.rewardedUnlockEnabled
  },{headers:{'Cache-Control':'public, max-age=30, s-maxage=30'}});
 }catch{return NextResponse.json({error:'Advertising configuration unavailable'},{status:503})}
}
