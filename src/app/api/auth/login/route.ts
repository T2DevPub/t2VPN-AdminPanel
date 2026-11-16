import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createSession, sessionCookie } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import {mobileRateLimit,requestIp} from '@/lib/mobile-auth';

const schema = z.object({ username: z.string().min(1).max(100), password: z.string().min(1).max(200) });

export async function POST(req: Request) {
  try {
    const origin = req.headers.get('origin');
    if (origin) {
      const originUrl = new URL(origin);
      const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
      const host = req.headers.get('host');
      const allowedHosts = [forwardedHost, host, new URL(req.url).host].filter(Boolean);
      if (!['http:', 'https:'].includes(originUrl.protocol) || !allowedHosts.includes(originUrl.host)) {
        return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
      }
    }

    const input = schema.safeParse(await req.json());
    if (!input.success) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    const ip=requestIp(req);
    if(ip!=='unidentified'&&!await mobileRateLimit('admin-login-ip',ip,12,15))return NextResponse.json({error:'Too many login attempts'},{status:429});
    if(!await mobileRateLimit('admin-login-user',input.data.username.toLowerCase(),20,15))return NextResponse.json({error:'Too many login attempts'},{status:429});
    const user = await db.admin.findUnique({ where: { username: input.data.username } });
    if (!user || !(await bcrypt.compare(input.data.password, user.passwordHash))) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    const token = await createSession(user.username);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(sessionCookie, token, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', path: '/', maxAge: 60 * 60 * 12
    });
    return response;
  } catch {
    return NextResponse.json({ error: 'Sign-in unavailable' }, { status: 503 });
  }
}
