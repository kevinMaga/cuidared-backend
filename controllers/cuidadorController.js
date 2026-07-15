const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// POST /api/cuidador/progreso  body: { cuidadoraId, cursoId, moduloId }
exports.marcarModuloCompletado = async (req, res) => {
  try {
    const { cuidadoraId, cursoId, moduloId } = req.body;
    if (!cuidadoraId || !cursoId || !moduloId) {
      return res.status(400).json({ error: 'Faltan datos' });
    }
    const { data, error } = await supabase
      .from('progreso_modulos')
      .upsert(
        { cuidadora_id: cuidadoraId, curso_id: cursoId, modulo_id: moduloId },
        { onConflict: 'cuidadora_id,modulo_id' }
      )
      .select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('marcarModuloCompletado:', err.message);
    res.status(500).json({ error: 'No se pudo guardar el progreso' });
  }
};

// GET /api/cuidador/:cuidadoraId/progreso
// Devuelve { cursoId: { completados: [moduloId...], porcentaje } }
exports.obtenerProgreso = async (req, res) => {
  try {
    const { cuidadoraId } = req.params;

    // módulos completados por la cuidadora
    const { data: progreso, error: e1 } = await supabase
      .from('progreso_modulos')
      .select('curso_id, modulo_id')
      .eq('cuidadora_id', cuidadoraId);
    if (e1) throw e1;

    // total de módulos activos por curso
    const { data: modulos, error: e2 } = await supabase
      .from('modulos')
      .select('id, curso_id')
      .eq('archivado', false);
    if (e2) throw e2;

    const totalPorCurso = {};
    modulos.forEach((m) => {
      totalPorCurso[m.curso_id] = (totalPorCurso[m.curso_id] || 0) + 1;
    });

    const completadosPorCurso = {};
    progreso.forEach((p) => {
      if (!completadosPorCurso[p.curso_id]) completadosPorCurso[p.curso_id] = [];
      completadosPorCurso[p.curso_id].push(p.modulo_id);
    });

    const resultado = {};
    Object.keys(totalPorCurso).forEach((cursoId) => {
      const completados = completadosPorCurso[cursoId] || [];
      const total = totalPorCurso[cursoId];
      resultado[cursoId] = {
        completados,
        porcentaje: total > 0 ? Math.round((completados.length / total) * 100) : 0,
      };
    });

    res.json(resultado);
  } catch (err) {
    console.error('obtenerProgreso:', err.message);
    res.status(500).json({ error: 'No se pudo obtener el progreso' });
  }
};