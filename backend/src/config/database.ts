import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { SnakeNamingStrategy } from 'typeorm-naming-strategies'
import { Account } from '@entities/Account'
import { Article } from '@entities/Article'
import { VerificationCode } from '@entities/VerificationCode'

// Enable SSL for remote databases (Heroku, AWS RDS, etc.)
const isRemoteDb = process.env.DATABASE_URL?.includes('amazonaws.com') ||
                   process.env.DATABASE_URL?.includes('heroku') ||
                   process.env.NODE_ENV === 'production'

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: isRemoteDb ? { rejectUnauthorized: false } : false,
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  namingStrategy: new SnakeNamingStrategy(),
  entities: [Account, Article, VerificationCode],
  migrations: ['src/migrations/*.ts'],
})
