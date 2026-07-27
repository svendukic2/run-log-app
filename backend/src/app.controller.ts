import { Controller, Get } from '@nestjs/common';
import { AppService, type HelloResponse } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // With the global 'api' prefix (see main.ts), this is GET /api/hello.
  @Get('hello')
  getHello(): HelloResponse {
    return this.appService.getHello();
  }
}
