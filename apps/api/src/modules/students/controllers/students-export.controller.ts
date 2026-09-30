import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
import * as ExcelJS from 'exceljs';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { PERMISSIONS } from '@student-portal/shared';
import { StudentQueryService } from '../services/student-query.service';
import { SearchStudentQuery } from '../dto/student.dto';

@ApiTags('Students Export')
@Controller('admin/students')
export class StudentsExportController {
  constructor(private readonly studentQueryService: StudentQueryService) {}

  @Get('export/excel')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.STUDENTS_READ)
  @ApiOperation({ summary: 'Stream students list as Excel file' })
  async exportExcel(@Query() query: SearchStudentQuery, @Res() res: Response) {
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="students-${Date.now()}.xlsx"`,
    );

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: res,
      useStyles: true,
    });
    const worksheet = workbook.addWorksheet('Students');

    worksheet.columns = [
      { header: 'كود الطالب', key: 'studentCode', width: 15 },
      { header: 'الاسم الكامل', key: 'fullName', width: 30 },
      { header: 'الفرقة', key: 'level', width: 12 },
      { header: 'القسم', key: 'department', width: 20 },
      { header: 'البريد الأكاديمي', key: 'academicEmail', width: 30 },
      { header: 'حالة القيد', key: 'enrollmentStatus', width: 15 },
      { header: 'المجموعة', key: 'group', width: 12 },
      { header: 'السكشن', key: 'section', width: 12 },
      { header: 'رقم الجلوس', key: 'seatNumber', width: 15 },
      { header: 'لجنة الامتحان', key: 'examRoom', width: 15 },
    ];

    const pageSize = 500;
    let page = 1;
    let totalPages = 1;

    do {
      const result = await this.studentQueryService.findAll({
        ...query,
        page,
        limit: pageSize,
      });
      totalPages = result.totalPages;

      for (const student of result.items) {
        worksheet
          .addRow({
            studentCode: student.studentCode,
            fullName: student.fullName,
            level: student.level,
            department: student.department || '-',
            academicEmail: student.academicEmail || '-',
            enrollmentStatus: student.enrollmentStatus,
            group: student.group || '-',
            section: student.section || '-',
            seatNumber: student.seatNumber || '-',
            examRoom: student.examRoom || '-',
          })
          .commit();
      }

      page++;
    } while (page <= totalPages);

    worksheet.commit();
    await workbook.commit();
  }
}
