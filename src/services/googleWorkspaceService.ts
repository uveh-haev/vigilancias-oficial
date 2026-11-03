import * as XLSX from 'xlsx';
import { parseRadarWorkbook } from '../domain/excelParser';
import { todayISO } from '../domain/dates';
import { BulletinPayload, NursingNote, RadarEvent } from '../types/clinical';

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3/files';

export const UVEH_DRIVE_FOLDER_NAME = 'RADAR UVEH - Cultivos HAEV';
export const UVEH_NOTES_SHEET_TITLE = 'NOTAS_PISO_UVEH';

let cachedDriveFolderId: string | null = null;

export function extractSpreadsheetId(input: string): string | null {
  const trimmed = String(input || '').trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch?.[1]) {
    return urlMatch[1];
  }

  if (/^[a-zA-Z0-9-_]{20,120}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

export function buildSpreadsheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}

async function parseGoogleError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    const apiMsg = data?.error?.message;
    if (res.status === 401 || res.status === 403) {
      return apiMsg
        ? `Acceso denegado por Google (${res.status}): ${apiMsg}`
        : 'Tu cuenta no tiene permiso sobre este archivo o la autorización expiró. Vuelve a autorizar Google Workspace.';
    }
    if (res.status === 404) {
      return 'No se encontró la hoja de cálculo. Verifica el enlace o ID y que tu cuenta tenga acceso.';
    }
    return apiMsg || fallback;
  } catch {
    return fallback;
  }
}

interface SpreadsheetMetadata {
  spreadsheetId: string;
  spreadsheetUrl?: string;
  properties?: {
    title?: string;
  };
  sheets?: Array<{
    properties?: {
      sheetId?: number;
      title?: string;
    };
  }>;
}

async function fetchSpreadsheetMetadata(
  spreadsheetId: string,
  accessToken: string
): Promise<SpreadsheetMetadata> {
  const res = await fetch(
    `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}?includeGridData=false`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    throw new Error(
      await parseGoogleError(res, 'No se pudo consultar la información de Google Sheets.')
    );
  }
  return (await res.json()) as SpreadsheetMetadata;
}

export interface ImportedGoogleSheetResult {
  parsed: ReturnType<typeof parseRadarWorkbook>;
  spreadsheetId: string;
  spreadsheetTitle: string;
  spreadsheetUrl: string;
}

/**
 * Reads all sheets from a Google Spreadsheet (non-destructive GET),
 * builds an in-memory XLSX workbook, and parses RADAR ACTIVO, HISTORIAL, and ANTIBIOGRAMAS.
 */
export async function importBulletinFromGoogleSheet(
  spreadsheetIdOrUrl: string,
  accessToken: string
): Promise<ImportedGoogleSheetResult> {
  const spreadsheetId = extractSpreadsheetId(spreadsheetIdOrUrl);
  if (!spreadsheetId) {
    throw new Error('Ingresa un enlace o ID válido de Google Sheets.');
  }

  const meta = await fetchSpreadsheetMetadata(spreadsheetId, accessToken);
  const spreadsheetTitle = meta.properties?.title || 'Google Sheet RADAR';
  const sheetTitles = (meta.sheets || [])
    .map((s) => s.properties?.title)
    .filter((t): t is string => Boolean(t));

  if (sheetTitles.length === 0) {
    throw new Error('La hoja de cálculo no contiene pestañas legibles.');
  }

  const params = new URLSearchParams();
  params.set('valueRenderOption', 'FORMATTED_VALUE');
  sheetTitles.forEach((title) => {
    const escaped = `'${title.replace(/'/g, "''")}'`;
    params.append('ranges', escaped);
  });

  const valuesRes = await fetch(
    `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!valuesRes.ok) {
    throw new Error(
      await parseGoogleError(valuesRes, 'No se pudieron leer las celdas de Google Sheets.')
    );
  }

  const valuesPayload = (await valuesRes.json()) as {
    valueRanges?: Array<{ range?: string; values?: unknown[][] }>;
  };

  const wb = XLSX.utils.book_new();
  const valueRanges = valuesPayload.valueRanges || [];

  sheetTitles.forEach((title, idx) => {
    const rows = valueRanges[idx]?.values || [];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31));
  });

  const parsed = parseRadarWorkbook(wb);
  return {
    parsed,
    spreadsheetId,
    spreadsheetTitle,
    spreadsheetUrl: meta.spreadsheetUrl || buildSpreadsheetUrl(spreadsheetId),
  };
}

export interface SyncNotesResult {
  spreadsheetId: string;
  spreadsheetTitle: string;
  spreadsheetUrl: string;
  appendedCount: number;
  skippedDuplicates: number;
}

/**
 * Appends floor nursing notes into the `NOTAS_PISO_UVEH` tab of the target Google Sheet.
 * MUST only be called after explicit user confirmation in UI.
 */
export async function syncNotesToGoogleSheet(params: {
  spreadsheetIdOrUrl: string;
  notes: NursingNote[];
  corte: string | null;
  accessToken: string;
}): Promise<SyncNotesResult> {
  const spreadsheetId = extractSpreadsheetId(params.spreadsheetIdOrUrl);
  if (!spreadsheetId) {
    throw new Error('Ingresa un enlace o ID válido de Google Sheets.');
  }

  const meta = await fetchSpreadsheetMetadata(spreadsheetId, params.accessToken);
  const spreadsheetTitle = meta.properties?.title || 'Google Sheet RADAR';
  const spreadsheetUrl = meta.spreadsheetUrl || buildSpreadsheetUrl(spreadsheetId);
  const hasNotesTab = (meta.sheets || []).some(
    (s) => (s.properties?.title || '').trim().toUpperCase() === UVEH_NOTES_SHEET_TITLE
  );

  const headersRow = [
    'FolioNota',
    'FechaRegistro',
    'CorteBoletin',
    'Paciente',
    'Cama',
    'Servicio',
    'NotaOperativa',
    'Autor',
    'EstadoEnApp',
  ];

  if (!hasNotesTab) {
    const createTabRes = await fetch(
      `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: {
                  title: UVEH_NOTES_SHEET_TITLE,
                },
              },
            },
          ],
        }),
      }
    );

    if (!createTabRes.ok) {
      throw new Error(
        await parseGoogleError(
          createTabRes,
          `No se pudo crear la pestaña ${UVEH_NOTES_SHEET_TITLE} en Google Sheets.`
        )
      );
    }

    const headerRes = await fetch(
      `${SHEETS_API_BASE}/${encodeURIComponent(
        spreadsheetId
      )}/values/${encodeURIComponent(`${UVEH_NOTES_SHEET_TITLE}!A1:I1`)}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: [headersRow],
        }),
      }
    );

    if (!headerRes.ok) {
      throw new Error(
        await parseGoogleError(headerRes, 'No se pudieron escribir los encabezados de notas.')
      );
    }
  }

  // Read existing signatures to avoid duplicating previously exported notes
  const existingSignatures = new Set<string>();
  const existingRes = await fetch(
    `${SHEETS_API_BASE}/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(`${UVEH_NOTES_SHEET_TITLE}!A2:G1000`)}`,
    {
      headers: { Authorization: `Bearer ${params.accessToken}` },
    }
  );
  if (existingRes.ok) {
    const existingData = (await existingRes.json()) as { values?: string[][] };
    (existingData.values || []).forEach((row) => {
      const sig = `${row[0] || ''}|${row[3] || ''}|${row[6] || ''}`.trim().toLowerCase();
      if (sig) existingSignatures.add(sig);
    });
  }

  const rowsToAppend: string[][] = [];
  let skippedDuplicates = 0;

  params.notes.forEach((n) => {
    const folioId = `NOTA-${n.fila}`;
    const sig = `${folioId}|${n.nombre || ''}|${n.texto || ''}`.trim().toLowerCase();
    if (existingSignatures.has(sig)) {
      skippedDuplicates += 1;
      return;
    }
    rowsToAppend.push([
      folioId,
      n.fecha || new Date().toISOString(),
      params.corte || todayISO(),
      n.nombre || '',
      n.cama || 's/c',
      n.servicio || '',
      n.texto || '',
      n.autor || '',
      n.aplicada ? 'Aplicada' : 'Pendiente',
    ]);
  });

  if (rowsToAppend.length > 0) {
    const appendRes = await fetch(
      `${SHEETS_API_BASE}/${encodeURIComponent(
        spreadsheetId
      )}/values/${encodeURIComponent(
        `${UVEH_NOTES_SHEET_TITLE}!A1`
      )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: rowsToAppend,
        }),
      }
    );

    if (!appendRes.ok) {
      throw new Error(
        await parseGoogleError(appendRes, 'No se pudieron registrar las notas en Google Sheets.')
      );
    }
  }

  return {
    spreadsheetId,
    spreadsheetTitle,
    spreadsheetUrl,
    appendedCount: rowsToAppend.length,
    skippedDuplicates,
  };
}

function radarEventToSheetRow(r: RadarEvent): Array<string | number> {
  return [
    r.det || '',
    r.nombre || '',
    r.exp || '',
    r.edad ?? '',
    r.cama || '',
    r.svc || '',
    r.prev || '',
    r.ing || '',
    r.prog || '',
    r.motivo || '',
    r.muestra || '',
    r.res || '',
    r.micro || '',
    r.disp || '',
    r.atb || '',
    r.epi || '',
    r.notif || '',
    r.oper || '',
    r.pri || '',
    r.accion || '',
    r.obs || '',
    r.tipo || '',
    r.rhove || '',
    r.fcap || '',
    r.fres || '',
    r.egreso || '',
  ];
}

export interface ExportNewSheetResult {
  spreadsheetId: string;
  spreadsheetTitle: string;
  spreadsheetUrl: string;
}

/**
 * Creates a new Google Spreadsheet in the user's account containing RADAR ACTIVO,
 * RESUMEN, HISTORIAL - CERRADOS, ANTIBIOGRAMAS, and NOTAS_PISO_UVEH.
 * MUST only be called after explicit user confirmation in UI.
 */
export async function exportBulletinToNewGoogleSheet(params: {
  bulletin: BulletinPayload;
  notes: NursingNote[];
  accessToken: string;
}): Promise<ExportNewSheetResult> {
  const corteLabel = params.bulletin.corte || todayISO();
  const title = `RADAR UVEH HAEV — Corte ${corteLabel}`;

  const sheetDefinitions = [
    { properties: { title: 'RADAR ACTIVO' } },
    { properties: { title: 'RESUMEN' } },
    { properties: { title: 'HISTORIAL - CERRADOS' } },
    { properties: { title: 'ANTIBIOGRAMAS' } },
    { properties: { title: UVEH_NOTES_SHEET_TITLE } },
  ];

  const createRes = await fetch(SHEETS_API_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
      sheets: sheetDefinitions,
    }),
  });

  if (!createRes.ok) {
    throw new Error(
      await parseGoogleError(createRes, 'No se pudo crear la hoja de cálculo en Google Sheets.')
    );
  }

  const created = (await createRes.json()) as SpreadsheetMetadata;
  const spreadsheetId = created.spreadsheetId;
  const spreadsheetUrl = created.spreadsheetUrl || buildSpreadsheetUrl(spreadsheetId);

  const headerLabels = [
    'Fecha de detección',
    'Nombre completo',
    'Expediente',
    'Edad',
    'Cama actual',
    'Servicio actual',
    'Servicios/ubicaciones previas',
    'Fecha de ingreso',
    'Programa de vigilancia',
    'Motivo de alerta',
    'Tipo/sitio de muestra',
    'Resultado',
    'Microorganismo',
    'Dispositivo',
    'Tratamiento',
    'Estado epidemiológico',
    'Estado de notificación',
    'Estado operativo',
    'Prioridad',
    'Acción pendiente',
    'Observaciones',
    'Tipo de IAAS',
    'Estado RHOVE',
    'Fecha de captura RHOVE',
    'Fecha del resultado microbiológico',
    'Fecha de egreso',
  ];

  const batchData = [
    {
      range: `'RADAR ACTIVO'!A1`,
      values: [
        [`RADAR ACTIVO UVEH — Corte ${corteLabel}`],
        headerLabels,
        ...(params.bulletin.rows || []).map(radarEventToSheetRow),
      ],
    },
    {
      range: `'RESUMEN'!A1`,
      values: [
        ['Fecha de corte', corteLabel],
        ['Nota', params.bulletin.nota || ''],
        ['Exportado desde RADAR UVEH', new Date().toISOString()],
      ],
    },
    {
      range: `'HISTORIAL - CERRADOS'!A1`,
      values: [headerLabels, ...(params.bulletin.cerrados || []).map(radarEventToSheetRow)],
    },
    {
      range: `'ANTIBIOGRAMAS'!A1`,
      values: [
        ['Paciente', 'Microorganismo', 'Código', 'Categoría', 'Fecha de estudio', 'Folio'],
        ...(params.bulletin.abRows || []).map((a) => [
          a.pac,
          a.mic || '',
          a.cod,
          a.cat,
          a.fecha,
          a.folio,
        ]),
      ],
    },
    {
      range: `'${UVEH_NOTES_SHEET_TITLE}'!A1`,
      values: [
        [
          'FolioNota',
          'FechaRegistro',
          'CorteBoletin',
          'Paciente',
          'Cama',
          'Servicio',
          'NotaOperativa',
          'Autor',
          'EstadoEnApp',
        ],
        ...params.notes.map((n) => [
          `NOTA-${n.fila}`,
          n.fecha || '',
          corteLabel,
          n.nombre || '',
          n.cama || 's/c',
          n.servicio || '',
          n.texto || '',
          n.autor || '',
          n.aplicada ? 'Aplicada' : 'Pendiente',
        ]),
      ],
    },
  ];

  const writeRes = await fetch(
    `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: batchData,
      }),
    }
  );

  if (!writeRes.ok) {
    throw new Error(
      await parseGoogleError(
        writeRes,
        'Se creó la hoja de cálculo pero ocurrió un problema al poblar las filas.'
      )
    );
  }

  return {
    spreadsheetId,
    spreadsheetTitle: title,
    spreadsheetUrl,
  };
}

/**
 * Finds or creates the `RADAR UVEH - Cultivos HAEV` folder in Google Drive
 * using the `drive.file` scope (app-created folders and files).
 */
export async function ensureUvehDriveFolder(accessToken: string): Promise<string> {
  if (cachedDriveFolderId) {
    return cachedDriveFolderId;
  }

  const query = `name = '${UVEH_DRIVE_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const searchParams = new URLSearchParams({
    q: query,
    fields: 'files(id,name)',
    pageSize: '5',
  });

  const searchRes = await fetch(`${DRIVE_API_BASE}?${searchParams.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (searchRes.ok) {
    const found = (await searchRes.json()) as { files?: Array<{ id: string; name: string }> };
    if (found.files && found.files.length > 0 && found.files[0].id) {
      cachedDriveFolderId = found.files[0].id;
      return cachedDriveFolderId;
    }
  }

  const createFolderRes = await fetch(`${DRIVE_API_BASE}?fields=id,name`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: UVEH_DRIVE_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      description: 'Repositorio operativo de reportes microbiológicos y antibiogramas RADAR UVEH HAEV',
    }),
  });

  if (!createFolderRes.ok) {
    throw new Error(
      await parseGoogleError(
        createFolderRes,
        'No se pudo preparar la carpeta de cultivos en Google Drive.'
      )
    );
  }

  const folderData = (await createFolderRes.json()) as { id: string };
  cachedDriveFolderId = folderData.id;
  return cachedDriveFolderId;
}

export interface DriveUploadedCulture {
  fileId: string;
  name: string;
  webViewLink: string;
  folderId: string;
}

/**
 * Uploads a single culture PDF or image into the `RADAR UVEH - Cultivos HAEV` Google Drive folder
 * using multipart upload (`drive.file`).
 * MUST only be called after explicit user confirmation in UI.
 */
export async function uploadCultureFileToDrive(params: {
  fileOrBytes: Blob | Uint8Array;
  filename: string;
  mimeType: string;
  patientName: string;
  cama: string;
  servicio: string;
  accessToken: string;
}): Promise<DriveUploadedCulture> {
  const folderId = await ensureUvehDriveFolder(params.accessToken);
  const boundary = `uveh_drive_boundary_${Date.now().toString(36)}`;
  const cleanMime = params.mimeType || 'application/pdf';

  const metadata = {
    name: params.filename,
    parents: [folderId],
    description: `Paciente: ${params.patientName || 'Sin nombre'} | Cama: ${
      params.cama || 's/c'
    } | Servicio: ${params.servicio || 'Hospitalización'}`,
  };

  let binaryPart: Blob;
  if (params.fileOrBytes instanceof Blob) {
    binaryPart = params.fileOrBytes;
  } else {
    binaryPart = new Blob([new Uint8Array(params.fileOrBytes)], { type: cleanMime });
  }

  const multipartBody = new Blob(
    [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify(metadata),
      `\r\n--${boundary}\r\nContent-Type: ${cleanMime}\r\n\r\n`,
      binaryPart,
      `\r\n--${boundary}--`,
    ],
    { type: `multipart/related; boundary=${boundary}` }
  );

  const uploadRes = await fetch(
    `${DRIVE_UPLOAD_BASE}?uploadType=multipart&fields=id,name,webViewLink`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    }
  );

  if (!uploadRes.ok) {
    if (uploadRes.status === 404) {
      cachedDriveFolderId = null;
    }
    throw new Error(
      await parseGoogleError(uploadRes, 'No se pudo subir el reporte de cultivo a Google Drive.')
    );
  }

  const uploaded = (await uploadRes.json()) as {
    id: string;
    name: string;
    webViewLink?: string;
  };

  return {
    fileId: uploaded.id,
    name: uploaded.name || params.filename,
    webViewLink:
      uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`,
    folderId,
  };
}
