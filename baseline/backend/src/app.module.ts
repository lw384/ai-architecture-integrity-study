import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { resolve } from 'node:path';
import { ContactModule } from './modules/contact/contact.module';
import { CompanyModule } from './modules/company/company.module';

const nodeEnv = process.env.NODE_ENV ?? 'development';
const defaultSynchronize = nodeEnv === 'production' ? 'false' : 'true';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        resolve(process.cwd(), `../.env.${nodeEnv}`),
        resolve(process.cwd(), '../.env'),
        resolve(process.cwd(), `.env.${nodeEnv}`),
        resolve(process.cwd(), '.env'),
      ],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: Number(configService.get<string>('DB_PORT', '5432')),
        username: configService.get<string>('DB_USERNAME', 'postgres'),
        password: configService.get<string>('DB_PASSWORD', 'postgres'),
        database: configService.get<string>('DB_DATABASE', 'crm_baseline'),
        autoLoadEntities: true,
        synchronize:
          configService.get<string>('DB_SYNCHRONIZE', defaultSynchronize) ===
          'true',
      }),
    }),
    CompanyModule,
    ContactModule,
  ],
})
export class AppModule {}
