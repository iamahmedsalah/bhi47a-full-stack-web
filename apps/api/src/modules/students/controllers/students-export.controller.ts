import { Controller, Get, HttpStatus, Query, Res } from '@nestjs/common';
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
  @ApiOperation({
    summary: 'Stream students list as Excel file with constant O(1) memory',
  })
  async exportExcel(@Query() query: SearchStudentQuery, @Res() res: Response) {
    res.status(HttpStatus.OK);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="students-${Date.now()}.xlsx"`,
    );
    res.setHeader('Transfer-Encoding', 'chunked');

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: res,
      useStyles: false,
      useSharedStrings: false,
    });
    const worksheet = workbook.addWorksheet('Students');

    worksheet.columns = [
      { header: 'كود الطالب', key: 'studentCode', width: 15 },
      { header: 'الاسم الكامل', key: 'fullName', width: 30 },
      { header: 'الاسم بالعربية', key: 'fullNameAr', width: 25 },
      { header: 'الاسم بالإنجليزية', key: 'fullNameEn', width: 25 },
      { header: 'الفرقة', key: 'level', width: 12 },
      { header: 'القسم', key: 'department', width: 20 },
      { header: 'البريد الأكاديمي', key: 'academicEmail', width: 30 },
      { header: 'حالة القيد', key: 'enrollmentStatus', width: 15 },
      { header: 'المجموعة', key: 'group', width: 12 },
      { header: 'السكشن', key: 'section', width: 12 },
      { header: 'رقم الجلوس', key: 'seatNumber', width: 15 },
      { header: 'لجنة الامتحان', key: 'examRoom', width: 15 },
    ];

    try {
      const cursor = this.studentQueryService.getExportCursor(query);

      for await (const student of cursor) {
        worksheet
          .addRow({
            studentCode: student.studentCode,
            fullName: student.fullName,
            fullNameAr: student.fullNameAr || student.fullName,
            fullNameEn: student.fullNameEn || '-',
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

      worksheet.commit();
      await workbook.commit();
    } catch (error) {
      if (!res.headersSent) {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).end();
      }
      throw error;
    }
  }
}
