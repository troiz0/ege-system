import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { pdfExportService } from '../services/pdfExportService.js';

const router = Router();

// POST /api/reports/class-pack (or /api/exams/print-class-pack)
router.post('/class-pack', requireAuth, async (req, res) => {
  try {
    const subject = (req.body?.subject as string) || 'math_profile';
    const count = Number(req.body?.count) || 4;
    const html = await pdfExportService.generateClassPackHtml(subject, count);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (error: any) {
    console.error('Generate class pack error:', error);
    return res.status(500).json({ error: error?.message || 'Ошибка генерации комплекта' });
  }
});

// GET /api/reports/monthly-pdf — отчет текущего ученика
router.get('/monthly-pdf', requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const html = await pdfExportService.generateMonthlyReportHtml(user.id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (error: any) {
    console.error('Generate monthly report error:', error);
    return res.status(500).json({ error: error?.message || 'Ошибка генерации отчета' });
  }
});

// GET /api/reports/student/:id/monthly-pdf — отчет конкретного ученика для репетитора
router.get('/student/:id/monthly-pdf', requireAuth, async (req, res) => {
  try {
    const studentId = req.params.id;
    const html = await pdfExportService.generateMonthlyReportHtml(studentId);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (error: any) {
    console.error('Generate student monthly report error:', error);
    return res.status(500).json({ error: error?.message || 'Ошибка генерации отчета ученика' });
  }
});

export default router;
