import { defineConfig } from 'drizzle-kit';
export default defineConfig({ dialect: 'sqlite', schema: './src/data/records-schema.ts', out: './migrations/records' });
