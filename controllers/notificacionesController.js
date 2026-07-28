const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// GET /api/notificaciones/:usuarioId
exports.obtenerNotificaciones = async (req, res) => {
  try {
    const { usuarioId } = req.params;
    const { data, error } = await supabase
      .from('notificaciones')
      .select('*')
      .eq('usuario_id', usuarioId)
      .order('creado_en', { ascending: false })
      .limit(30);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('obtenerNotificaciones:', err.message);
    res.status(500).json({ error: 'No se pudieron obtener las notificaciones' });
  }
};

// PUT /api/notificaciones/:id/leida
exports.marcarLeida = async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('notificaciones').update({ leido: true }).eq('id', id);
    if (error) throw error;
    res.json({ mensaje: 'Marcada como leída' });
  } catch (err) {
    console.error('marcarLeida:', err.message);
    res.status(500).json({ error: 'No se pudo marcar como leída' });
  }
};

// PUT /api/notificaciones/marcar-todas/:usuarioId
exports.marcarTodasLeidas = async (req, res) => {
  try {
    const { usuarioId } = req.params;
    const { error } = await supabase.from('notificaciones').update({ leido: true }).eq('usuario_id', usuarioId).eq('leido', false);
    if (error) throw error;
    res.json({ mensaje: 'Todas marcadas como leídas' });
  } catch (err) {
    console.error('marcarTodasLeidas:', err.message);
    res.status(500).json({ error: 'No se pudo actualizar' });
  }
};