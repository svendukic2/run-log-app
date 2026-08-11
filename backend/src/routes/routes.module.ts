import { Module } from '@nestjs/common';
import { RoutesController } from './routes.controller';
import { RoutesService } from './routes.service';

// Feature module for route planning (RUN-53). No PrismaModule import, unlike
// every other feature module here: the endpoint is stateless. It reads two
// values from ConfigService (global, no import needed) and calls the provider
// with Node's built-in fetch, so it has no dependencies of its own. The
// routePolyline/routeWaypoints/routeSource columns that persist a chosen
// route belong to the Run entity and land with RUN-54.
@Module({
  controllers: [RoutesController],
  providers: [RoutesService],
})
export class RoutesModule {}
