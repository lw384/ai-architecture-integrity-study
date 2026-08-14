import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { resolve } from 'node:path';

const nodeEnv = process.env.NODE_ENV ?? 'development';

loadEnv({ path: resolve(process.cwd(), `../.env.${nodeEnv}`) });
loadEnv({ path: resolve(process.cwd(), '../.env') });
loadEnv({ path: resolve(process.cwd(), `.env.${nodeEnv}`) });
loadEnv({ path: resolve(process.cwd(), '.env') });

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? '5432'),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'crm_baseline',
  entities: [resolve(__dirname, '../../modules/**/*.entity.{ts,js}')],
  migrations: [resolve(__dirname, 'migrations/*.{ts,js}')],
  synchronize: false,
});
