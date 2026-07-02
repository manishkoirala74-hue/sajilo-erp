import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

async function run() {
    try {
        const sql = fs.readFileSync('068_inventory_reconciliation.sql', 'utf8');
        await prisma.$executeRawUnsafe(sql);
        console.log("Migration 068 executed successfully!");
    } catch (e) {
        console.error("Migration 068 failed:", e);
    } finally {
        await prisma.$disconnect();
    }
}

run();
