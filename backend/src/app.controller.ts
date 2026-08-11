import { Controller, Get } from '@nestjs/common';
import { AppService, type HelloResponse } from './app.service';
import { Public } from './auth/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // With the global 'api' prefix (see main.ts), this is GET /api/hello.
  // Public by the RUN-57 contract: it is the frontend's connectivity probe
  // and carries no user data.
  @Public()
  @Get('hello')
  getHello(): HelloResponse {
    return this.appService.getHello();
  }
}
