// Access tiers are configured by the V2 backend, not hard-coded in Android.
// Plus server: both verified paid Plus and 30-minute verified reward use Config 1.
// Free server: paid Plus uses Config 1, Free/reward-only uses Config 2 if available.
export function chooseVpnSlot(serverTier:string,hasConfig2:boolean,paidPlus:boolean,verifiedReward:boolean):1|2|null{
 if(serverTier==='PLUS')return paidPlus||verifiedReward?1:null;
 if(serverTier!=='FREE')return null;
 return paidPlus?1:hasConfig2?2:1;
}
