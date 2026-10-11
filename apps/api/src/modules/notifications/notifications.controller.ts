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
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import {
  SendNotificationDto,
  RegisterFcmTokenDto,
  QueryNotificationDto,
} from './dto/notification.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import { PERMISSIONS } from '@student-portal/shared';

@ApiTags('Notifications')
@Controller()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // ─── Student Endpoints ───────────────────────────────────────────

  @Post('students/me/fcm-token')
  @Roles('student')
  @ApiOperation({ summary: 'Register student browser/device FCM token' })
  async registerToken(
    @CurrentUser('_id') studentId: string,
    @Body() dto: RegisterFcmTokenDto,
  ) {
    return this.notificationsService.registerToken(studentId, dto);
  }

  @Get('students/me/notifications')
  @Roles('student')
  @ApiOperation({ summary: 'Get current student own notification inbox feed' })
  async getMyNotifications(
    @CurrentUser('_id') studentId: string,
    @Query() query: QueryNotificationDto,
  ) {
    return this.notificationsService.getStudentFeed(studentId, query);
  }

  @Post('notifications/register-token')
  @Roles('student')
  @ApiOperation({ summary: 'Register student browser/device FCM token' })
  async registerTokenAlias(
    @CurrentUser('_id') studentId: string,
    @Body() dto: RegisterFcmTokenDto,
  ) {
    return this.notificationsService.registerToken(studentId, dto);
  }

  @Get('notifications')
  @Roles('student')
  @ApiOperation({ summary: 'Get current student notification inbox feed' })
  async getNotificationsAlias(
    @CurrentUser('_id') studentId: string,
    @Query() query: QueryNotificationDto,
  ) {
    return this.notificationsService.getStudentFeed(studentId, query);
  }

  @Patch('students/me/notifications/:id/read')
  @Roles('student')
  @ApiOperation({ summary: 'Mark notification as read' })
  async markStudentNotificationRead(
    @CurrentUser('_id') studentId: string,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.notificationsService.markAsRead(studentId, id);
  }

  @Patch('notifications/:id/read')
  @Roles('student')
  @ApiOperation({ summary: 'Mark notification as read' })
  async markNotificationRead(
    @CurrentUser('_id') studentId: string,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.notificationsService.markAsRead(studentId, id);
  }

  @Patch('students/me/notifications/:id/unread')
  @Roles('student')
  @ApiOperation({ summary: 'Mark notification as unread' })
  async markStudentNotificationUnread(
    @CurrentUser('_id') studentId: string,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.notificationsService.markAsUnread(studentId, id);
  }

  @Patch('notifications/:id/unread')
  @Roles('student')
  @ApiOperation({ summary: 'Mark notification as unread' })
  async markNotificationUnread(
    @CurrentUser('_id') studentId: string,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.notificationsService.markAsUnread(studentId, id);
  }

  @Patch('students/me/notifications/read-all')
  @Roles('student')
  @ApiOperation({ summary: 'Mark all own notifications as read' })
  async markAllStudentNotificationsRead(@CurrentUser('_id') studentId: string) {
    return this.notificationsService.markAllAsRead(studentId);
  }

  @Patch('notifications/read-all')
  @Roles('student')
  @ApiOperation({ summary: 'Mark all own notifications as read' })
  async markAllNotificationsRead(@CurrentUser('_id') studentId: string) {
    return this.notificationsService.markAllAsRead(studentId);
  }

  @Delete('students/me/notifications/clear-read')
  @Roles('student')
  @ApiOperation({ summary: 'Clear/hide all read notifications' })
  async clearAllReadNotifications(@CurrentUser('_id') studentId: string) {
    return this.notificationsService.hideAllReadNotifications(studentId);
  }

  @Delete('students/me/notifications/:id')
  @Roles('student')
  @ApiOperation({ summary: 'Hide/delete one notification for current student' })
  async deleteStudentNotification(
    @CurrentUser('_id') studentId: string,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.notificationsService.hideNotification(studentId, id);
  }

  // ─── Admin Endpoints ─────────────────────────────────────────────

  @Post('admin/notifications')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.NOTIFICATIONS_SEND)
  @ApiOperation({
    summary: 'Broadcast or target a push notification (Admin/Staff)',
  })
  async sendNotification(
    @Body() dto: SendNotificationDto,
    @CurrentUser('_id') senderId: string,
  ) {
    return this.notificationsService.sendNotification(dto, senderId);
  }

  @Get('admin/notifications')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.NOTIFICATIONS_READ)
  @ApiOperation({
    summary: 'List all previously sent notifications (Admin/Staff)',
  })
  async listSentHistory(@Query() query: QueryNotificationDto) {
    return this.notificationsService.listSentHistory(query);
  }

  @Delete('admin/notifications/clear-all')
  @Roles('admin')
  @RequirePermissions(PERMISSIONS.NOTIFICATIONS_SEND)
  @ApiOperation({ summary: 'Clear all notification history logs (Admin)' })
  async clearAllNotifications() {
    return this.notificationsService.clearAllHistory();
  }

  @Post('admin/notifications/bulk-delete')
  @Roles('admin')
  @RequirePermissions(PERMISSIONS.NOTIFICATIONS_SEND)
  @ApiOperation({ summary: 'Bulk delete notification logs by IDs (Admin)' })
  async bulkDeleteNotifications(@Body('ids') ids: string[]) {
    return this.notificationsService.bulkDelete(ids);
  }

  @Delete('admin/notifications/:id')
  @Roles('admin')
  @RequirePermissions(PERMISSIONS.NOTIFICATIONS_SEND)
  @ApiOperation({
    summary:
      'Delete a sent notification log and clear it from student feeds (Admin)',
  })
  async deleteNotification(@Param('id', ParseObjectIdPipe) id: string) {
    return this.notificationsService.deleteNotification(id);
  }
}
