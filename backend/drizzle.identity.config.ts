import { defineConfig } from 'drizzle-kit';
export default defineConfig({ dialect: 'sqlite', schema: './src/data/identity-schema.ts', out: './migrations/identity' });
