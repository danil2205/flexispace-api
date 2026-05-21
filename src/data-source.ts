import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

const env = process.env.NODE_ENV;
const envPath = !env ? '.env' : `.env.${env}`;
dotenv.config({ path: path.resolve(process.cwd(), envPath) });

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'postgres',
  entities: [__dirname + '/**/*.entity{.js,.ts}'],
  migrations: [__dirname + '/migrations/**/*{.js,.ts}'],
  synchronize: false,
});
