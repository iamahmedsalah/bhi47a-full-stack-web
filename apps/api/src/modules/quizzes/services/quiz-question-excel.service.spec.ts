import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { QuizQuestionExcelService } from './quiz-question-excel.service';

describe('Quiz question spreadsheets', () => {
  const service = new QuizQuestionExcelService();

  it.each(['xlsx', 'csv'] as const)(
    'round-trips the %s template with B, T and F examples and ignores instructions',
    async (format) => {
      const file = await service.generateSampleTemplate(format);
      const parsed = await service.parseQuestionsFile(
        file.buffer,
        file.filename,
      );
      expect(parsed.errors).toEqual([]);
      expect(parsed.questions).toHaveLength(3);
      expect(parsed.questions.map((q) => q.correctOptionIndex)).toEqual([
        1, 0, 1,
      ]);
      expect(parsed.questions.map((q) => q.type)).toEqual([
        'mcq',
        'true_false',
        'true_false',
      ]);
      if (format === 'csv') {
        expect(file.buffer.toString('utf8').startsWith('\uFEFF')).toBe(true);
        expect(file.buffer.toString('utf8')).toContain('instructions');
      } else {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(
          file.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
        );
        const help = workbook.getWorksheet('Instructions');
        expect(help?.rowCount).toBeGreaterThan(5);
        expect(help?.getCell('B3').text).toContain('B means option_b');
        expect(help?.getCell('C3').text).toContain('الخيار الثاني');
        // Excel sheet order is editable: instructions must never become questions.
        if (help) help.orderNo = 0;
        const reordered = await workbook.xlsx.writeBuffer();
        expect(
          (
            await service.parseQuestionsFile(
              Buffer.from(reordered),
              'edited.xlsx',
            )
          ).questions,
        ).toHaveLength(3);
      }
    },
  );

  it('supports quoted commas, escaped quotes, multiline questions and semicolon CSV files', async () => {
    const header =
      'question_text,type,option_a,option_b,option_c,option_d,correct_answer,points';
    const csv = `${header}\r\n"A comma, a quote ""here""\nand a new line",MCQ,one,two,three,four,B,2`;
    const result = await service.parseQuestionsFile(
      Buffer.from(csv),
      'questions.csv',
    );
    expect(result.errors).toEqual([]);
    expect(result.questions[0].text).toBe(
      'A comma, a quote "here"\nand a new line',
    );
    expect(result.questions[0].correctOptionIndex).toBe(1);
    const semicolon = `${header.replaceAll(',', ';')}\nA false statement;TF;True;False;;;F;1`;
    expect(
      (await service.parseQuestionsFile(Buffer.from(semicolon), 'q.csv'))
        .questions[0].correctOptionIndex,
    ).toBe(1);
  });

  it('reports invalid rows and rejects broken CSV quoting', async () => {
    const result = await service.parseQuestionsFile(
      Buffer.from(
        'question_text,type,correct_answer\nInvalid,WRONG,B\nValid,TF,F',
      ),
      'q.csv',
    );
    expect(result.errors).toHaveLength(1);
    expect(result.validCount).toBe(1);
    await expect(
      service.parseQuestionsFile(
        Buffer.from('question_text,type\n"unclosed,TF'),
        'q.csv',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('retains Excel boolean false and numeric zero options and validates points before import', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Questions');
    sheet.addRow([
      'question_text',
      'type',
      'option_a',
      'option_b',
      'option_c',
      'option_d',
      'correct_answer',
      'points',
    ]);
    sheet.addRow(['False statement', 'TF', true, false, '', '', false, 1]);
    sheet.addRow(['Pick zero', 'MCQ', 0, 1, 2, 3, 'A', 0.5]);
    sheet.addRow(['Invalid marks', 'TF', 'True', 'False', '', '', 'T', 0]);
    const file = await workbook.xlsx.writeBuffer();
    const result = await service.parseQuestionsFile(
      Buffer.from(file),
      'numeric.xlsx',
    );
    expect(result.questions).toHaveLength(2);
    expect(result.questions[0].correctOptionIndex).toBe(1);
    expect(result.questions[1].options[0]).toBe('0');
    expect(result.errors).toHaveLength(1);
  });
});
