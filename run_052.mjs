import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

async function run() {
    try {
        const sql = fs.readFileSync('052_document_attachments.sql', 'utf8');
        await prisma.$executeRawUnsafe(sql);
        console.log("Migration executed successfully!");
    } catch (e) {
        console.error("Migration failed:", e);
    } finally {
        await prisma.$disconnect();
    }
}

run();
