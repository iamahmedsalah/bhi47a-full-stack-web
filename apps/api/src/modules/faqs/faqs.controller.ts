import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PERMISSIONS } from '@student-portal/shared';
import {
  AskFaqDto,
  BulkDeleteFaqsDto,
  CreateFaqDto,
  QueryFaqDto,
  UpdateFaqDto,
} from './dto/faq.dto';
import { FaqsService } from './faqs.service';

@ApiTags('FAQs')
@Controller()
export class FaqsController {
  constructor(private readonly faqsService: FaqsService) {}

  @Get('faqs')
  @Roles('student', 'admin', 'staff')
  @ApiOperation({ summary: 'List active FAQs' })
  async listPublic(@Query() query: QueryFaqDto) {
    return this.faqsService.findAll(query);
  }

  @Post('faqs/chat')
  @Roles('student', 'admin', 'staff')
  @ApiOperation({ summary: 'Ask the FAQ chatbot' })
  async ask(@Body() dto: AskFaqDto) {
    return this.faqsService.ask(dto);
  }

  @Get('admin/faqs')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.FAQS_READ)
  @ApiOperation({ summary: 'List and filter FAQs for admin' })
  async listAdmin(@Query() query: QueryFaqDto) {
    return this.faqsService.findAll(query, true);
  }

  @Post('admin/faqs')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.FAQS_WRITE)
  @ApiOperation({ summary: 'Create FAQ' })
  async create(@Body() dto: CreateFaqDto, @CurrentUser('_id') userId: string) {
    return this.faqsService.create(dto, userId);
  }

  @Post('admin/faqs/seed-defaults')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.FAQS_WRITE)
  @ApiOperation({ summary: 'Idempotently seed starter FAQ entries' })
  async seedDefaults(@CurrentUser('_id') userId: string) {
    return this.faqsService.seedDefaults(userId);
  }

  @Post('admin/faqs/bulk-delete')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.FAQS_WRITE)
  @ApiOperation({ summary: 'Bulk delete FAQs' })
  async bulkRemove(@Body() dto: BulkDeleteFaqsDto) {
    return this.faqsService.bulkRemove(dto.ids);
  }

  @Patch('admin/faqs/:id')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.FAQS_WRITE)
  @ApiOperation({ summary: 'Update FAQ' })
  async update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateFaqDto,
    @CurrentUser('_id') userId: string,
  ) {
    return this.faqsService.update(id, dto, userId);
  }

  @Delete('admin/faqs/:id')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.FAQS_WRITE)
  @ApiOperation({ summary: 'Delete FAQ' })
  async remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.faqsService.remove(id);
  }
}
