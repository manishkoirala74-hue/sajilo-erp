import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

async function run() {
    try {
        const sql = fs.readFileSync('092_standardize_reports_rpc.sql', 'utf8');
        await prisma.$executeRawUnsafe(sql);
        console.log("Migration 092 executed successfully!");
    } catch (e) {
        console.error("Migration 092 failed:", e);
    } finally {
        await prisma.$disconnect();
    }
}

run();
