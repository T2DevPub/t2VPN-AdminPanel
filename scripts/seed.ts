import { PrismaClient } from '@prisma/client';import bcrypt from 'bcryptjs';
const db=new PrismaClient();
async function main(){const username=process.env.ADMIN_USERNAME;const password=process.env.ADMIN_PASSWORD;if(!username||!password||password.length<12)throw new Error('Set ADMIN_USERNAME and ADMIN_PASSWORD (12+ chars)');await db.admin.upsert({where:{username},update:{passwordHash:await bcrypt.hash(password,12)},create:{username,passwordHash:await bcrypt.hash(password,12)}});console.log('Admin account provisioned');}
main().finally(()=>db.$disconnect());
