import { Body, Controller, Param, Post } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PERMISSIONS } from '@student-portal/shared';
import {
  HistoricalPublicationScopeDto,
  PublishHistoricalGradesDto,
} from './dto/grade.dto';
import { HistoricalPublicationService } from './historical-publication.service';

@Controller('admin/grades/historical-publication')
@Roles('admin', 'staff')
@RequirePermissions(PERMISSIONS.GRADES_HISTORICAL_PUBLISH)
export class HistoricalPublicationController {
  constructor(private readonly publication: HistoricalPublicationService) {}

  @Post('preview')
  preview(@Body() scope: HistoricalPublicationScopeDto) {
    return this.publication.preview(scope);
  }

  @Post('status')
  status(@Body() scope: HistoricalPublicationScopeDto) {
    return this.publication.latest(scope);
  }

  @Post('publish')
  publish(
    @Body() dto: PublishHistoricalGradesDto,
    @CurrentUser('_id') actorId: string,
  ) {
    return this.publication.publish(dto, actorId);
  }

  @Post(':id/process')
  process(@Param('id') id: string, @CurrentUser('_id') actorId: string) {
    return this.publication.process(id, actorId);
  }
}
