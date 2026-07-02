import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

async function run() {
    try {
        const sql = fs.readFileSync('064_godown_ledger_posting.sql', 'utf8');
        await prisma.$executeRawUnsafe(sql);
        console.log("Migration 064 executed successfully!");
    } catch (e) {
        console.error("Migration 064 failed:", e);
    } finally {
        await prisma.$disconnect();
    }
}

run();
