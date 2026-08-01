import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

async function run() {
    try {
        const file = process.argv[2];
        if (!file) throw new Error("Please provide a SQL file path");
        
        const sql = fs.readFileSync(file, 'utf8');
        await prisma.$executeRawUnsafe(sql);
        console.log(`Migration ${file} executed successfully!`);
    } catch (e) {
        console.error("Migration failed:", e);
    } finally {
        await prisma.$disconnect();
    }
}

run();
