import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filter/http-exception.filter';
import { createValidationException } from './common/errors/validation-exception.factory';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.enableCors();

  app.useGlobalFilters(new HttpExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: createValidationException,
    }),
  );

  const port =
    process.env.PORT ?? process.env.CRM_BASELINE_BACKEND_PORT ?? 3101;
  await app.listen(port);

  logger.log(`🚀 Application is running on: http://localhost:${port}/api`);
}

void bootstrap();
