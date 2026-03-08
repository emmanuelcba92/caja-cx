/**
 * AI Service — Google Gemini integration for auto-filling orders from email text
 */

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash'];
const makeUrl = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

/**
 * Parses raw email text and extracts structured order data using Gemini AI.
 * Tries multiple models as fallback if one hits quota limits.
 * @param {string} emailText - The raw email content pasted by the user
 * @param {Array} profesionalesList - List of professionals [{nombre: "Dr. X"}, ...]
 * @returns {Promise<Object>} Parsed order data matching the form fields
 */
export async function parseEmailToOrder(emailText, profesionalesList = []) {
    if (!GEMINI_API_KEY) {
        throw new Error('API key de Gemini no configurada. Contacte al administrador.');
    }

    const profNames = profesionalesList.map(p => p.nombre).join(', ');

    const prompt = `Sos un asistente que extrae datos de emails para completar órdenes de internación quirúrgica de una clínica ORL (otorrinolaringología).

Te voy a dar el texto de un email y necesito que extraigas los datos y los devuelvas ÚNICAMENTE como un objeto JSON válido, sin markdown, sin explicaciones, solo el JSON.

REGLAS:
- "profesional": Intentá hacer match con alguno de estos profesionales del sistema: [${profNames}]. Si no hay match exacto, usá el nombre tal cual viene en el email. Incluí el prefijo (Dr., Dra., etc.).
- "afiliado": Nombre del paciente en MAYÚSCULAS.
- "obraSocial": Nombre de la obra social. Corregí errores de tipeo obvios (ej: "swiss mwdical" → "Swiss Medical", "ospedyc" → "OSPEDYC").
- "numeroAfiliado": Número de afiliado si está disponible, sino cadena vacía.
- "dni": DNI del paciente como string.
- "edad": Edad del paciente como string.
- "telefono": Número de teléfono/celular. Eliminá el 0 y el 15 del inicio si los tiene (ej: "03541200806" → "3541200806").
- "tutor": Nombre del tutor si el paciente es menor de edad o se menciona uno.
- "codigosCirugia": Array de objetos {codigo: "XXXXXX", nombre: "descripción"}. Si el código viene con descripción entre paréntesis, separá código y nombre. Si solo hay descripción sin código, dejá el código vacío.
- "tipoAnestesia": Debe ser exactamente uno de: "general", "local", "regional", "sedación". Convertí a minúsculas.
- "fechaCirugia": Fecha en formato YYYY-MM-DD. Convertí cualquier formato de fecha al correcto.
- "horaCirugia": Hora en formato HH:mm si está disponible (ej: "08:30").
- "salaCirugia": Nombre de la sala o quirófano si se menciona (ej: "Quirófano 1").
- "incluyeMaterial": true si hay materiales a solicitar (que no sean "." o vacío o "no"), false si no.
- "descripcionMaterial": Descripción del material si aplica, sino cadena vacía.
- "diagnostico": Diagnóstico o justificación de la cirugía. Si dice "." o está vacío, dejá cadena vacía.
- "anotacionCalendario": "Auto-completado por IA" + cualquier dato extra relevante que no entre en otros campos.
- "habitacion": Cadena vacía (no suele venir en el email).

EJEMPLO DE RESPUESTA:
{
  "profesional": "Dr Pablo Jasin",
  "afiliado": "GARCIA MARIA",
  "obraSocial": "OSDE",
  "numeroAfiliado": "12345/0",
  "dni": "12345678",
  "edad": "45",
  "telefono": "3512345678",
  "tutor": "",
  "codigosCirugia": [{"codigo": "030608", "nombre": "MICROCIRUGIA DE LARINGE"}],
  "tipoAnestesia": "general",
  "fechaCirugia": "2026-03-18",
  "horaCirugia": "09:00",
  "salaCirugia": "Quirófano 2",
  "incluyeMaterial": false,
  "descripcionMaterial": "",
  "diagnostico": "Disfonía",
  "anotacionCalendario": "Auto-completado por IA. Duración estimada 1h.",
  "habitacion": ""
}

TEXTO DEL EMAIL:
${emailText}`;

    const body = {
        contents: [{
            parts: [{ text: prompt }]
        }],
        generationConfig: {
            temperature: 0.1,
            topP: 0.8,
            maxOutputTokens: 1024,
        }
    };

    // Try each model in order until one works
    let lastError = null;
    for (const model of GEMINI_MODELS) {
        try {
            console.log(`[AI] Trying model: ${model}`);
            const response = await fetch(makeUrl(model), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const status = response.status;
                if (status === 429 || status === 503) {
                    console.warn(`[AI] Model ${model} hit quota/unavailable (${status}), trying next...`);
                    lastError = new Error(`Model ${model}: ${errorData?.error?.message || `HTTP ${status}`}`);
                    continue;
                }
                throw new Error(`Error de Gemini API (${status}): ${errorData?.error?.message || 'Error desconocido'}`);
            }

            const data = await response.json();
            const textResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!textResponse) {
                throw new Error('Gemini no devolvió una respuesta válida.');
            }

            // Extract JSON from response (may be wrapped in ```json ... ```)
            let jsonStr = textResponse.trim();
            const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1].trim();
            }

            const parsed = JSON.parse(jsonStr);
            console.log(`[AI] Success with model: ${model}`, parsed);
            return parsed;

        } catch (e) {
            if (e.message.includes('quota') || e.message.includes('429') || e.message.includes('503')) {
                lastError = e;
                continue;
            }
            // For JSON parse errors, try to give a better message
            if (e instanceof SyntaxError) {
                console.error('[AI] Failed to parse response as JSON:', e);
                lastError = new Error('No se pudo interpretar la respuesta de la IA. Intentá de nuevo.');
                continue;
            }
            throw e;
        }
    }

    // All models failed
    throw lastError || new Error('Todos los modelos de IA están temporalmente no disponibles. Intentá en unos minutos.');
}
