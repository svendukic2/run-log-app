import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { PlanRouteDto } from './dto/plan-route.dto';
import { RoutesService, type RoutePlanResponse } from './routes.service';

// POST /api/routes/plan (RUN-53), under the global 'api' prefix set in
// main.ts. The one endpoint of the routing proxy: the browser posts points,
// gets back a street-snapped walking polyline, and never learns the
// provider's URL or key.
//
// Protected by the app-wide JwtAuthGuard - deliberately NOT @Public(). An
// unauthenticated route planner is a free proxy onto our provider quota, and
// exhausting that quota breaks the feature for every real user. The caller's
// identity is not otherwise needed: nothing here is stored or user-scoped.
@Controller('routes')
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  // POST because the payload is a body of coordinates, but 200 not 201:
  // planning is a pure computation and creates nothing. RUN-54 is what
  // persists a chosen route, on the run it belongs to.
  @Post('plan')
  @HttpCode(HttpStatus.OK)
  plan(@Body() dto: PlanRouteDto): Promise<RoutePlanResponse> {
    return this.routes.plan(dto);
  }
}
