'use strict';

/**
 * Genera docs/PRUEBAS_ACEPTACION.md a partir de las definiciones (tests/acceptance/casos.js)
 * y de la última ejecución real (docs/evidencias/resultados-aceptacion.json).
 * Un caso sin resultado registrado queda NO_EJECUTADO: nunca se inventa un resultado.
 */

const fs = require('fs');
const path = require('path');
const { CASOS, REQUISITOS } = require('../tests/acceptance/casos');

const root = path.resolve(__dirname, '../..');
const resultsFile = path.join(root, 'docs/evidencias/resultados-aceptacion.json');
const outFile = path.join(root, 'docs/PRUEBAS_ACEPTACION.md');

const data = fs.existsSync(resultsFile) ? JSON.parse(fs.readFileSync(resultsFile, 'utf8')) : { resultados: {}, entorno: {} };
const res = (id) => data.resultados[id] || { estado: 'NO_EJECUTADO', obtenido: ['Sin ejecución registrada.'], evidencia: [] };
const esc = (t) => String(t).replace(/\|/g, '\\|');

const count = (estado) => CASOS.filter((c) => res(c.id).estado === estado).length;
const L = [];
L.push('# Pruebas de aceptación CP01–CP20 — SGSSU', '');
L.push('> Documento generado con `npm run docs:acceptance` (backend) a partir de la ejecución real de `tests/integration/acceptance.integration.test.js`. No se edita a mano.', '');
L.push('## 1. Resumen y alcance de la ejecución', '');
L.push(`- Casos: ${CASOS.length} · APROBADO: ${count('APROBADO')} · FALLIDO: ${count('FALLIDO')} · NO_EJECUTADO: ${count('NO_EJECUTADO')}`);
L.push(`- Última ejecución: ${data.ejecutado_en || 'sin ejecución'}`);
if (data.entorno && data.entorno.node) {
  L.push(`- Entorno: Node ${data.entorno.node}; PostgreSQL ${data.entorno.postgresql}`);
  L.push(`- Base de datos: ${data.entorno.base_de_datos}`);
  L.push(`- Adjuntos: ${data.entorno.almacenamiento_adjuntos}`);
}
L.push('- **Lo que esta ejecución NO demuestra:** el comportamiento contra el proyecto Supabase del autor, contra Supabase Storage real, ni en un navegador real. Esas pruebas y sus capturas las aporta el autor (DECISIONES §12).');
L.push('- Reejecución: `TEST_DATABASE_URL=... npm run test:integration -- tests/integration/acceptance` y luego `npm run docs:acceptance`.', '');

L.push('## 2. Matriz de trazabilidad requisito → caso de prueba', '');
L.push('| Requisito | Descripción | Referencia | Casos | Estado |', '|---|---|---|---|---|');
for (const r of REQUISITOS) {
  const cs = CASOS.filter((c) => c.requisitos.includes(r.id));
  const estados = cs.map((c) => res(c.id).estado);
  const estado = !cs.length ? 'SIN CASO' : estados.every((e) => e === 'APROBADO') ? 'APROBADO' : estados.includes('FALLIDO') ? 'FALLIDO' : 'NO_EJECUTADO';
  L.push(`| ${r.id} | ${esc(r.texto)} | ${r.ref} | ${cs.map((c) => c.id).join(', ') || '—'} | ${estado} |`);
}
L.push('', '## 3. Matriz caso → requisitos', '', '| Caso | Título | Requisitos | Estado |', '|---|---|---|---|');
for (const c of CASOS) L.push(`| ${c.id} | ${esc(c.titulo)} | ${c.requisitos.join(', ')} | ${res(c.id).estado} |`);

L.push('', '## 4. Detalle de los casos', '');
for (const c of CASOS) {
  const r = res(c.id);
  L.push(`### ${c.id} — ${c.titulo}`, '');
  L.push('| Campo | Contenido |', '|---|---|');
  L.push(`| Identificador | ${c.id} |`, `| Objetivo | ${esc(c.objetivo)} |`);
  L.push(`| Precondiciones | ${esc(c.precondiciones.join('; '))} |`, `| Datos | ${esc(c.datos)} |`);
  L.push(`| Requisitos | ${c.requisitos.join(', ')} |`, `| Resultado esperado | ${esc(c.esperado)} |`);
  L.push(`| Estado | **${r.estado}** |`);
  L.push('', '**Procedimiento**', '');
  c.procedimiento.forEach((p, i) => L.push(`${i + 1}. ${p}`));
  L.push('', '**Resultado obtenido** (valores reales observados en la ejecución)', '');
  r.obtenido.forEach((o) => L.push(`- ${o}`));
  if (r.error) L.push(`- ERROR: ${r.error}`);
  L.push('', '**Evidencia**', '');
  L.push(`- Código: \`backend/tests/integration/acceptance.integration.test.js\` (caso ${c.id}); salida estructurada en \`docs/evidencias/resultados-aceptacion.json\`.`);
  r.evidencia.forEach((e) => L.push(`- ${e}`));
  L.push('- Capturas de pantalla: pendientes de aportar por el autor (no verificado en navegador).', '');
}
fs.writeFileSync(outFile, `${L.join('\n')}\n`);
console.log(`Escrito ${path.relative(root, outFile)} (${count('APROBADO')} aprobados, ${count('FALLIDO')} fallidos, ${count('NO_EJECUTADO')} sin ejecutar)`);
