import { Router } from 'express';
import { strToU8, zipSync } from 'fflate';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { appStore } from '../../shared/store.js';
import { calculateAverage, calculateNps } from '../../shared/metrics.js';
import { AppError } from '../../shared/errors.js';
import { requireAuth, requireAnyPermission, enforceUserSectorScope } from '../auth/auth.routes.js';
import { asyncHandler, databaseConfigured, query } from '../../config/database.js';

const router = Router();
const filterSchema = z.object({
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  setor_id: z.coerce.number().int().positive().optional(),
}).refine(({ inicio, fim }) => !inicio || !fim || inicio <= fim, {
  message: '`inicio` deve ser anterior ou igual a `fim`',
});

function parseFilters(req) {
  const parsed = filterSchema.safeParse(req.query);
  if (!parsed.success) throw new AppError('Filtros inválidos', 400, 'VALIDATION_ERROR', parsed.error.flatten());
  for (const date of [parsed.data.inicio, parsed.data.fim].filter(Boolean)) {
    const parsedDate = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
      throw new AppError('Data inválida; use YYYY-MM-DD', 400, 'VALIDATION_ERROR');
    }
  }
  return parsed.data;
}

function matchesFilters(survey, filters) {
  if (filters.setor_id && survey.setor_id !== filters.setor_id) return false;
  const date = new Date(survey.data_hora);
  if (Number.isNaN(date.getTime())) return false;
  const dateKey = date.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  return (!filters.inicio || dateKey >= filters.inicio) && (!filters.fim || dateKey <= filters.fim);
}

async function getSectorReport(filters) {
  if (databaseConfigured) {
    const values = [];
    const conditions = ['s.ativo = TRUE'];
    const surveyConditions = [];
    if (filters.inicio) {
      values.push(filters.inicio);
      surveyConditions.push(`(p.data_hora AT TIME ZONE 'America/Sao_Paulo') >= $${values.length}::date`);
    }
    if (filters.fim) {
      values.push(filters.fim);
      surveyConditions.push(`(p.data_hora AT TIME ZONE 'America/Sao_Paulo') < ($${values.length}::date + INTERVAL '1 day')`);
    }
    if (filters.setor_id) {
      values.push(filters.setor_id);
      conditions.push(`s.id = $${values.length}`);
    }
    const result = await query(
      `SELECT s.id AS setor_id, s.nome,
              COUNT(p.id)::integer AS total_pesquisas,
              AVG(p.media_parcial) FILTER (WHERE p.media_parcial IS NOT NULL) AS media,
              ARRAY_AGG(p.nps_nota) FILTER (WHERE p.nps_nota IS NOT NULL) AS notas
       FROM setor s
       LEFT JOIN pesquisa p ON p.setor_id = s.id${surveyConditions.length ? ` AND ${surveyConditions.join(' AND ')}` : ''}
       WHERE ${conditions.join(' AND ')}
       GROUP BY s.id
       ORDER BY s.nome`,
      values,
    );
    return result.rows.map((row) => ({
      setor_id: row.setor_id,
      setor: row.nome,
      total_pesquisas: row.total_pesquisas,
      media: row.media === null ? null : Number(Number(row.media).toFixed(1)),
      nps: calculateNps((row.notas ?? []).map(Number)),
    }));
  }

  const activeSectors = appStore.setores.filter((sector) => sector.ativo
    && (!filters.setor_id || sector.id === filters.setor_id));
  return activeSectors.map((sector) => {
    const surveys = appStore.pesquisas.filter((survey) => survey.setor_id === sector.id && matchesFilters(survey, filters));
    return {
      setor_id: sector.id,
      setor: sector.nome,
      total_pesquisas: surveys.length,
      media: calculateAverage(surveys.map((survey) => survey.media_parcial)),
      nps: calculateNps(surveys.filter((survey) => survey.nps_nota !== null && survey.nps_nota !== undefined).map((survey) => survey.nps_nota)),
    };
  });
}

function escapeXml(value) {
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function excelColumn(index) {
  let column = '';
  let current = index;
  while (current > 0) {
    current -= 1;
    column = String.fromCharCode(65 + (current % 26)) + column;
    current = Math.floor(current / 26);
  }
  return column;
}

function createExcelReport(rows, filters) {
  const reportRows = [
    ['Setor', 'Total de pesquisas', 'Média das avaliações', 'NPS'],
    ...rows.map((row) => [row.setor, row.total_pesquisas, row.media, row.nps]),
    ['Período inicial', filters.inicio ?? 'Não informado'],
    ['Período final', filters.fim ?? 'Não informado'],
  ];
  const sheetRows = reportRows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const reference = `${excelColumn(columnIndex + 1)}${rowIndex + 1}`;
      const style = rowIndex === 0 ? ' s="1"' : '';
      if (typeof value === 'number' && Number.isFinite(value)) {
        return `<c r="${reference}"${style}><v>${value}</v></c>`;
      }
      if (value === null || value === undefined) return `<c r="${reference}"${style}/>`;
      return `<c r="${reference}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');

  const files = {
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Resultados por setor" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
    'xl/styles.xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'),
    'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="28" customWidth="1"/><col min="2" max="2" width="22" customWidth="1"/><col min="3" max="3" width="23" customWidth="1"/><col min="4" max="4" width="12" customWidth="1"/></cols><sheetData>${sheetRows}</sheetData></worksheet>`),
  };
  return Buffer.from(zipSync(files, { level: 6 }));
}

async function createPdfReport(rows, filters) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];
    document.on('data', (chunk) => chunks.push(chunk));
    document.on('error', reject);
    document.on('end', () => resolve(Buffer.concat(chunks)));

    document.fontSize(18).text('Resultados das pesquisas por setor');
    document.moveDown(0.5).fontSize(10)
      .text(`Período: ${filters.inicio ?? 'início não informado'} a ${filters.fim ?? 'fim não informado'}`);
    document.moveDown();

    const columns = [
      { title: 'Setor', x: 40, width: 190 },
      { title: 'Pesquisas', x: 235, width: 85 },
      { title: 'Média', x: 325, width: 90 },
      { title: 'NPS', x: 420, width: 100 },
    ];
    const drawHeader = () => {
      const top = document.y;
      document.font('Helvetica-Bold').fontSize(10);
      for (const column of columns) document.text(column.title, column.x, top, { width: column.width });
      document.y = top + 18;
      document.font('Helvetica').fontSize(10);
    };
    drawHeader();

    for (const row of rows) {
      if (document.y > 750) {
        document.addPage();
        drawHeader();
      }
      const top = document.y;
      const values = [row.setor, String(row.total_pesquisas), row.media === null ? '-' : row.media.toFixed(1), row.nps.toFixed(1)];
      const heights = values.map((value, index) => document.heightOfString(value, { width: columns[index].width }));
      const rowHeight = Math.max(...heights) + 8;
      values.forEach((value, index) => document.text(value, columns[index].x, top, { width: columns[index].width }));
      document.y = top + rowHeight;
      document.moveTo(40, document.y).lineTo(555, document.y).strokeColor('#dddddd').stroke();
    }

    document.end();
  });
}

const createExportHandler = (tipo) => asyncHandler(async (req, res) => {
  const filters = parseFilters(req);
  const rows = await getSectorReport(filters);
  const buffer = tipo === 'excel'
    ? createExcelReport(rows, filters)
    : await createPdfReport(rows, filters);

  let exportacaoId;
  if (databaseConfigured) {
    const result = await query(
      `INSERT INTO exportacao (usuario_id, tipo, filtros)
       VALUES ($1, $2, $3::jsonb)
       RETURNING id`,
      [req.user.id, tipo, JSON.stringify(filters)],
    );
    exportacaoId = result.rows[0].id;
  } else {
    exportacaoId = appStore.exportacoes.length + 1;
    appStore.exportacoes.push({
      id: exportacaoId,
      usuario_id: req.user.id,
      tipo,
      data: new Date().toISOString(),
      filtros: filters,
    });
  }

  const extension = tipo === 'excel' ? 'xlsx' : 'pdf';
  const contentType = tipo === 'excel'
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'application/pdf';
  const filename = `resultados-setores-${new Date().toISOString().slice(0, 10)}.${extension}`;
  res.set({
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'X-Exportacao-Id': String(exportacaoId),
  });
  res.send(buffer);
});

const exportPermissions = [
  requireAuth,
  requireAnyPermission('super_admin', 'gestao', 'ouvidoria'),
  enforceUserSectorScope,
];

router.get('/exportacoes/excel', ...exportPermissions, createExportHandler('excel'));
router.get('/exportacoes/pdf', ...exportPermissions, createExportHandler('pdf'));

export default router;
