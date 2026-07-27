import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Read config through ConfigService rather than process.env directly, so
  // values come from backend/.env (loaded by ConfigModule) as well as the shell.
  const config = app.get(ConfigService);

  // Serve every route under /api (e.g. GET /api/hello).
  app.setGlobalPrefix('api');

  // Let the Next.js dev server call this API from the browser. Server-side
  // fetches (React Server Components) don't need CORS, but client-side ones do.
  app.enableCors({
    origin: config.get<string>('FRONTEND_URL', 'http://localhost:4200'),
  });

  await app.listen(config.get<number>('PORT', 3000));
}
bootstrap();
