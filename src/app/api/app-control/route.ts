import {NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {getSession} from '@/lib/auth';
import {z} from 'zod';
export const runtime='nodejs';
const configSchema=z.object({
  minVersionCode:z.number().int().min(0).max(100000000),
  latestVersionCode:z.number().int().min(0).max(100000000),
  updateUrl:z.string().url().max(500).or(z.literal('')),
  forceUpdate:z.boolean(),
  updateMessage:z.string().max(400),
  connectionTimeoutSeconds:z.number().int().min(5).max(120),
  autoReconnect:z.boolean(),
  autoConnectOnLaunch:z.boolean(),
  killSwitchPrompt:z.boolean(),
  showConnectionNotification:z.boolean(),
  allowSplitTunneling:z.boolean(),
  showServerLatency:z.boolean(),
  showConnectionStats:z.boolean(),
  enableInAppRatingPrompt:z.boolean(),
  ratingPromptAfterConnections:z.number().int().min(1).max(100),
  supportUrl:z.string().url().max(500).or(z.literal('')),
  privacyPolicyUrl:z.string().url().max(500).or(z.literal('')),
  termsUrl:z.string().url().max(500).or(z.literal('')),
  announcementEnabled:z.boolean(),
  announcementText:z.string().max(300),
  announcementUrl:z.string().url().max(500).or(z.literal('')),
  enableDiagnostics:z.boolean(),
  diagnosticsSamplePercent:z.number().int().min(0).max(100),
  configRefreshMinutes:z.number().int().min(5).max(1440)
}).refine(v=>v.latestVersionCode>=v.minVersionCode,{message:'Latest version must be at least the minimum version'});
export const defaults:z.infer<typeof configSchema>={minVersionCode:0,latestVersionCode:0,updateUrl:'',forceUpdate:false,updateMessage:'',connectionTimeoutSeconds:30,autoReconnect:true,autoConnectOnLaunch:false,killSwitchPrompt:true,showConnectionNotification:true,allowSplitTunneling:true,showServerLatency:true,showConnectionStats:true,enableInAppRatingPrompt:false,ratingPromptAfterConnections:5,supportUrl:'',privacyPolicyUrl:'',termsUrl:'',announcementEnabled:false,announcementText:'',announcementUrl:'',enableDiagnostics:false,diagnosticsSamplePercent:0,configRefreshMinutes:30};
function sameOrigin(req:Request){const origin=req.headers.get('origin');if(!origin)return true;try{const u=new URL(origin);return u.protocol==='https:'||u.protocol==='http:' ? [req.headers.get('host'),req.headers.get('x-forwarded-host')?.split(',')[0]?.trim(),new URL(req.url).host].includes(u.host):false}catch{return false}}
export async function GET(){if(!await getSession())return NextResponse.json({error:'Unauthorized'},{status:401});try{const row=await db.appSetting.findUnique({where:{key:'app_control_v1'}});return NextResponse.json({config:row?configSchema.parse({...defaults,...JSON.parse(row.value)}):defaults},{headers:{'Cache-Control':'no-store'}})}catch{return NextResponse.json({error:'Unable to load app controls'},{status:500})}}
export async function PUT(req:Request){const actor=await getSession();if(!actor)return NextResponse.json({error:'Unauthorized'},{status:401});if(!sameOrigin(req))return NextResponse.json({error:'Invalid origin'},{status:403});try{const parsed=configSchema.safeParse(await req.json());if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message||'Invalid configuration'},{status:400});await db.$transaction(async tx=>{await tx.appSetting.upsert({where:{key:'app_control_v1'},create:{key:'app_control_v1',value:JSON.stringify(parsed.data)},update:{value:JSON.stringify(parsed.data)}});await tx.auditLog.create({data:{actor,action:'app-control.update',detail:'app_control_v1'}})});return NextResponse.json({ok:true})}catch{return NextResponse.json({error:'Unable to save app controls'},{status:500})}}
