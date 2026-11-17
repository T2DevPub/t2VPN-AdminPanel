/** Calendar-day boundaries use IST (Asia/Kolkata), independently of server TZ. */
export const IST_OFFSET_MS=330*60000;
export function istTodayStart(now:Date=new Date()):Date{
 const day=new Date(now.getTime()+IST_OFFSET_MS).toISOString().slice(0,10);
 return new Date(day+'T00:00:00+05:30');
}
export function periodBounds(period:string,now:Date=new Date()):{start:Date;end:Date}{
 const today=istTodayStart(now);
 if(period==='today')return {start:today,end:now};
 if(period==='yesterday')return {start:new Date(today.getTime()-86400000),end:today};
 if(period==='lifetime')return {start:new Date(0),end:now};
 const duration:Record<string,number>={'7d':7,'30d':30,'90d':90};
 return {start:new Date(now.getTime()-(duration[period]||1)*86400000),end:now};
}
