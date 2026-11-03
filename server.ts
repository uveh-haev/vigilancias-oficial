import 'dotenv/config';
import http from 'http';
import express, { type Request, type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no está configurada en el entorno del servidor.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '25mb' }));

  // 1. Multimodal Extraction of Lab Culture & Antibiogram (PDF or Photo)
  app.post('/api/ai/extract-culture', async (req: Request, res: Response) => {
    try {
      const { mimeType, base64, censusPatients } = req.body || {};
      if (!base64 || typeof base64 !== 'string') {
        res.status(400).json({ error: 'Se requiere el archivo de cultivo codificado en base64.' });
        return;
      }

      const ai = getGenAIClient();
      const censusContext = Array.isArray(censusPatients) && censusPatients.length > 0
        ? JSON.stringify(censusPatients.slice(0, 200))
        : '[]';

      const prompt = `Eres un microbiólogo clínico y epidemiólogo hospitalario experto en México (NOM-045-SSA2 / RHOVE).
Analiza este reporte de laboratorio microbiológico (PDF o fotografía de hoja impresa) y extrae con precisión todos los datos clínicos y la tabla completa del antibiograma.

Reglas estrictas:
1. Estandariza el nombre del microorganismo en nomenclatura binomial científica (ej. "Klebsiella pneumoniae", "Acinetobacter baumannii", "Pseudomonas aeruginosa", "Escherichia coli", "Staphylococcus aureus", "Candida albicans") o "Sin desarrollo" si el cultivo fue negativo.
2. En cada fila de antibiograma:
   - "antimicrobiano": nombre limpio en español (ej. "Meropenem", "Ceftriaxona", "Amikacina", "Colistina").
   - "codigo": código corto de 3 letras en mayúsculas (ej. "MEM", "CRO", "AMK", "CST", "TZP", "FEP", "CIP", "VAN", "LZD", "IPM", "ETP", "CAZ", "SAM", "SXT", "GEN", "TGC").
   - "cmi": valor numérico/comparador de CMI si aparece (ej. "<=0.25", ">=16") o cadena vacía "".
   - "interpretacion": exactamente "Sensible", "Intermedio" o "Resistente".
3. Si el paciente del reporte coincide claramente por expediente o apellidos/nombre con alguno de los pacientes de este censo activo:
${censusContext}
coloca su "id" exacto en "matchedPatientId". Si no hay coincidencia segura, devuelve "" en "matchedPatientId".
4. En "fechaReporte", usa formato YYYY-MM-DD si aparece fecha de resultado o validación; si no es legible, devuelve "".`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: typeof mimeType === 'string' && mimeType ? mimeType : 'application/pdf',
                data: base64,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              pacienteDetectado: { type: Type.STRING },
              expediente: { type: Type.STRING },
              cama: { type: Type.STRING },
              servicio: { type: Type.STRING },
              muestra: { type: Type.STRING },
              fechaReporte: { type: Type.STRING },
              folio: { type: Type.STRING },
              microorganismo: { type: Type.STRING },
              recuento: { type: Type.STRING },
              fenotipoResistencia: { type: Type.STRING },
              matchedPatientId: { type: Type.STRING },
              resumenClinico: { type: Type.STRING },
              antibiograma: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    antimicrobiano: { type: Type.STRING },
                    codigo: { type: Type.STRING },
                    cmi: { type: Type.STRING },
                    interpretacion: {
                      type: Type.STRING,
                      enum: ['Sensible', 'Intermedio', 'Resistente'],
                    },
                  },
                  required: ['antimicrobiano', 'codigo', 'cmi', 'interpretacion'],
                },
              },
            },
            required: [
              'pacienteDetectado',
              'expediente',
              'cama',
              'servicio',
              'muestra',
              'fechaReporte',
              'folio',
              'microorganismo',
              'recuento',
              'fenotipoResistencia',
              'matchedPatientId',
              'resumenClinico',
              'antibiograma',
            ],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      res.json(parsed);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al analizar el reporte de cultivo.';
      console.error('[/api/ai/extract-culture]', message);
      res.status(500).json({ error: message });
    }
  });

  // 2. Clinical Ward Round Voice Dictation Transcription
  app.post('/api/ai/transcribe-note', async (req: Request, res: Response) => {
    try {
      const { mimeType, base64 } = req.body || {};
      if (!base64 || typeof base64 !== 'string') {
        res.status(400).json({ error: 'No se recibió audio para transcribir.' });
        return;
      }

      const ai = getGenAIClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: typeof mimeType === 'string' && mimeType ? mimeType : 'audio/webm',
                data: base64,
              },
            },
            {
              text: 'Transcribe este dictado clínico hospitalario en español mexicano con ortografía y puntuación claras. Conserva términos clínicos y abreviaturas hospitalarias como CVC, Sonda Foley, VM, UFC/mL, RHOVE, UCIA, UCIN, nombres de microorganismos y antibióticos. Devuelve únicamente el texto limpio transcrito, sin encabezados ni explicaciones.',
            },
          ],
        },
      });

      const cleanText = (response.text || '').trim();
      res.json({ text: cleanText });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al transcribir el dictado de voz.';
      console.error('[/api/ai/transcribe-note]', message);
      res.status(500).json({ error: message });
    }
  });

  // 3. Assisted NOM-045-SSA2 / NHSN Surveillance Criteria Pre-Validation
  app.post('/api/ai/evaluate-criteria', async (req: Request, res: Response) => {
    try {
      const { event, corte, categoryKey, categoriesCatalog } = req.body || {};
      if (!event || typeof event !== 'object') {
        res.status(400).json({ error: 'Se requieren los datos clínicos del evento.' });
        return;
      }

      const ai = getGenAIClient();
      const prompt = `Eres un médico epidemiólogo de la Unidad de Vigilancia Epidemiológica Hospitalaria (UVEH) en México.
Realiza una pre-validación operativa de criterios diagnósticos de IAAS conforme a la NOM-045-SSA2 y definiciones operativas NHSN/RHOVE.

Fecha de corte actual: ${corte || 'No especificada'}
Categoría seleccionada actualmente por el usuario (puede estar vacía): "${categoryKey || ''}"

Catálogo disponible de categorías e índices (0-indexed) de criterios:
${JSON.stringify(categoriesCatalog || [], null, 2)}

Datos registrados del evento en el censo RADAR:
${JSON.stringify(event, null, 2)}

Instrucciones estrictas:
1. Si "categoryKey" ya fue elegida por el usuario y existe en el catálogo, evalúa esa categoría. Si está vacía, elige la categoría más pertinente del catálogo en "suggestedCategoryKey".
2. En "metIndices", incluye ÚNICAMENTE los índices numéricos (0-based) de la categoría elegida que estén respaldados explícitamente por los datos del evento (fechas de ingreso/detección >48h, dispositivos, cultivo/microorganismo, fiebre/clínica descrita en motivo u observaciones). No inventes hallazgos que no estén escritos.
3. En "suggestedVerdict":
   - "si": cuando los datos actuales documentan suficientemente el cumplimiento operativo del evento.
   - "falta": cuando hay sospecha fundada pero faltan datos clínicos/radiológicos/segunda toma por corroborar en expediente o piso.
   - "no": cuando los datos descartan la definición operativa (ej. infección comunitaria <48h o contaminación aislada sin clínica).
4. En "fundamentoClinico": redacta 1 a 2 oraciones concisas y objetivas en español clínico explicando qué elementos ya se cumplen.
5. En "datosFaltantes": lista puntual (máximo 3 puntos breves) de lo que el personal de UVEH debe verificar en el expediente físico/electrónico antes de capturar en RHOVE. No incluyas indicaciones de aislamiento ni tarjetas de precaución.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestedCategoryKey: { type: Type.STRING },
              metIndices: {
                type: Type.ARRAY,
                items: { type: Type.INTEGER },
              },
              suggestedVerdict: {
                type: Type.STRING,
                enum: ['si', 'no', 'falta'],
              },
              fundamentoClinico: { type: Type.STRING },
              datosFaltantes: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: [
              'suggestedCategoryKey',
              'metIndices',
              'suggestedVerdict',
              'fundamentoClinico',
              'datosFaltantes',
            ],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      res.json(parsed);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al evaluar criterios clínicos.';
      console.error('[/api/ai/evaluate-criteria]', message);
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const disableHmr = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: disableHmr ? true : { server: httpServer },
        hmr: disableHmr ? false : { server: httpServer },
        ws: disableHmr ? (false as const) : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`RADAR UVEH server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
