import { defineConfig } from 'drizzle-kit';
export default defineConfig({ dialect: 'sqlite', schema: './src/validation/schema.ts', out: './validation/migrations' });
