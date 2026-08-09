const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const TIPOS_DOC = ['cedula', 'migratorio', 'record_policial', 'titulo', 'certificaciones', 'cv'];
const DOCS_OBLIGATORIOS = ['cedula', 'record_policial'];
const COL_DOC = {
  cedula: 'url_cedula',
  migratorio: 'url_certificado_migratorio',
  record_policial: 'url_record_policial',
  titulo: 'url_copia_titulo',
  certificaciones: 'url_certificados',
  cv: 'url_cv',
};


// MÉTRICAS DEL DASHBOARD
const getDashboardMetrics = async (req, res) => {
  try {
    const { count: cuidadorasCount } = await supabase
      .from('cuidadoras')
      .select('*', { count: 'exact', head: true });

    const { count: empleadorasCount } = await supabase
      .from('empleadoras')
      .select('*', { count: 'exact', head: true });

    const { count: solicitudesCount } = await supabase
      .from('solicitudes_conexion')
      .select('*', { count: 'exact', head: true });

    const { count: serviciosCount } = await supabase
      .from('servicios')
      .select('*', { count: 'exact', head: true })
      .neq('estado', 'cancelado');

    // --- CURSOS ---
    const { count: cursosCount } = await supabase
      .from('cursos')
      .select('*', { count: 'exact', head: true })
      .eq('archivado', false);

    const { count: modulosCount } = await supabase
      .from('modulos')
      .select('*', { count: 'exact', head: true })
      .eq('archivado', false);

    // --- PROGRESO DE CURSOS (RF-82) ---
    // Contamos asignaciones curso×cuidadora:
    //   enProgreso  = 0 < % < 100
    //   completados = % = 100
    const { data: asignaciones } = await supabase
      .from('cursos_asignados')
      .select('curso_id, cuidadora_id');

    const { data: modulosActivos } = await supabase
      .from('modulos')
      .select('id, curso_id')
      .eq('archivado', false);

    const { data: progresoGlobal } = await supabase
      .from('progreso_modulos')
      .select('cuidadora_id, curso_id, modulo_id');

    const totalModulosPorCurso = {};
    (modulosActivos || []).forEach((m) => {
      totalModulosPorCurso[m.curso_id] = (totalModulosPorCurso[m.curso_id] || 0) + 1;
    });

    let cursosEnProgreso = 0;
    let cursosCompletados = 0;
    (asignaciones || []).forEach((a) => {
      const total = totalModulosPorCurso[a.curso_id] || 0;
      if (total === 0) return;
      const completados = (progresoGlobal || []).filter(
        (p) => p.cuidadora_id === a.cuidadora_id && p.curso_id === a.curso_id
      ).length;
      if (completados >= total) cursosCompletados++;
      else if (completados > 0) cursosEnProgreso++;
    });

    // --- VALIDACIONES (RF-22 / RF-69) ---
    const { data: validacionCuidadoras } = await supabase
      .from('cuidadoras')
      .select('estado_validacion');

    const { data: revisiones } = await supabase
      .from('revisiones_documentos')
      .select('cuidadora_id, tipo, estado');

    let valAprobadas = 0;
    let valPendientes = 0;
    let valRechazadas = 0;
    let valCambios = 0;

    (validacionCuidadoras || []).forEach((c) => {
      const conCambios = TIPOS_DOC.some((tipo) =>
        (revisiones || []).some(
          (r) => r.cuidadora_id === c.id && r.tipo === tipo && r.estado === 'cambios_solicitados'
        )
      );
      if (c.estado_validacion === 'aprobado') valAprobadas++;
      else if (c.estado_validacion === 'rechazado') valRechazadas++;
      else if (conCambios) valCambios++;
      else valPendientes++;
    });

    res.json({
      cuidadoras: cuidadorasCount || 0,
      familias: empleadorasCount || 0,
      solicitudes: solicitudesCount || 0,
      servicios: serviciosCount || 0,

      cursos: {
        total: cursosCount || 0,
        modulos: modulosCount || 0,
        enProgreso: cursosEnProgreso,
        completados: cursosCompletados,
      },

      validaciones: {
        pendientes: valPendientes,
        aprobadas: valAprobadas,
        cambiosSolicitados: valCambios,
        rechazadas: valRechazadas,
      },
    });
  } catch (error) {
    console.error('getDashboardMetrics:', error.message);
    res.status(500).json({ error: 'Error al obtener métricas del dashboard' });
  }
};

// ---------- CURSOS ----------

// GET /api/admin/cursos  -> catálogo con conteo de módulos
exports.listarCursos = async (req, res) => {
  try {
    const incluirArchivados = req.query.archivados === 'true';
    let query = supabase
      .from('cursos')
      .select('*, modulos(count)')
      .order('created_at', { ascending: true });
    if (!incluirArchivados) query = query.eq('archivado', false);

    const { data, error } = await query;
    if (error) throw error;

    const cursos = data.map((c) => ({ ...c, total_modulos: c.modulos?.[0]?.count ?? 0 }));
    res.json(cursos);
  } catch (err) {
    console.error('listarCursos:', err.message);
    res.status(500).json({ error: 'No se pudieron obtener los cursos' });
  }
};

// GET /api/admin/cursos/:id  -> curso + módulos (vista previa / pantalla módulos)
exports.obtenerCurso = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: curso, error: e1 } = await supabase
      .from('cursos').select('*').eq('id', id).single();
    if (e1) throw e1;
    if (!curso) return res.status(404).json({ error: 'Curso no encontrado' });

    const { data: modulos, error: e2 } = await supabase
      .from('modulos').select('*')
      .eq('curso_id', id).eq('archivado', false)
      .order('orden', { ascending: true });
    if (e2) throw e2;

    res.json({ ...curso, modulos: modulos ?? [], total_modulos: modulos?.length ?? 0 });
  } catch (err) {
    console.error('obtenerCurso:', err.message);
    res.status(500).json({ error: 'No se pudo obtener el curso' });
  }
};

// POST /api/admin/cursos
exports.crearCurso = async (req, res) => {
  try {
    const { titulo, descripcion, duracion, categoria } = req.body;
    if (!titulo) return res.status(400).json({ error: 'El título es obligatorio' });

    const { data, error } = await supabase
      .from('cursos')
      .insert({
        titulo,
        descripcion: descripcion ?? null,
        duracion: duracion ?? null,
        categoria: categoria === 'obligatorio' ? 'obligatorio' : 'opcional',
      })
      .select().single();
    if (error) throw error;

    res.status(201).json(data);
  } catch (err) {
    console.error('crearCurso:', err.message);
    res.status(500).json({ error: 'No se pudo crear el curso' });
  }
};

// PUT /api/admin/cursos/:id
exports.editarCurso = async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, descripcion, duracion, categoria } = req.body;

    const cambios = {};
    if (titulo !== undefined) cambios.titulo = titulo;
    if (descripcion !== undefined) cambios.descripcion = descripcion;
    if (duracion !== undefined) cambios.duracion = duracion;
    if (categoria !== undefined)
      cambios.categoria = categoria === 'obligatorio' ? 'obligatorio' : 'opcional';

    const { data, error } = await supabase
      .from('cursos').update(cambios).eq('id', id).select().single();
    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('editarCurso:', err.message);
    res.status(500).json({ error: 'No se pudo actualizar el curso' });
  }
};

// PATCH /api/admin/cursos/:id/archivar   body: { archivado: true|false }
exports.archivarCurso = async (req, res) => {
  try {
    const { id } = req.params;
    const archivado = req.body.archivado !== false; // por defecto archiva
    const { data, error } = await supabase
      .from('cursos').update({ archivado }).eq('id', id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('archivarCurso:', err.message);
    res.status(500).json({ error: 'No se pudo archivar el curso' });
  }
};

// ---------- MÓDULOS ----------

// POST /api/admin/cursos/:cursoId/modulos
exports.crearModulo = async (req, res) => {
  try {
    const { cursoId } = req.params;
    const { titulo, descripcion, duracion, video_url } = req.body;
    if (!titulo) return res.status(400).json({ error: 'El título es obligatorio' });

    // orden = (máximo actual) + 1
    const { data: ultimo } = await supabase
      .from('modulos').select('orden')
      .eq('curso_id', cursoId)
      .order('orden', { ascending: false }).limit(1).maybeSingle();
    const orden = (ultimo?.orden ?? 0) + 1;

    const { data, error } = await supabase
      .from('modulos')
      .insert({
        curso_id: cursoId,
        titulo,
        descripcion: descripcion ?? null,
        duracion: duracion ?? null,
        video_url: video_url ?? null,
        orden,
      })
      .select().single();
    if (error) throw error;

    res.status(201).json(data);
  } catch (err) {
    console.error('crearModulo:', err.message);
    res.status(500).json({ error: 'No se pudo crear el módulo' });
  }
};

// PUT /api/admin/modulos/:id
exports.editarModulo = async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, descripcion, duracion, video_url, orden } = req.body;

    const cambios = {};
    if (titulo !== undefined) cambios.titulo = titulo;
    if (descripcion !== undefined) cambios.descripcion = descripcion;
    if (duracion !== undefined) cambios.duracion = duracion;
    if (video_url !== undefined) cambios.video_url = video_url;
    if (orden !== undefined) cambios.orden = orden;

    const { data, error } = await supabase
      .from('modulos').update(cambios).eq('id', id).select().single();
    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('editarModulo:', err.message);
    res.status(500).json({ error: 'No se pudo actualizar el módulo' });
  }
};

// PATCH /api/admin/modulos/:id/archivar
exports.archivarModulo = async (req, res) => {
  try {
    const { id } = req.params;
    const archivado = req.body.archivado !== false;
    const { data, error } = await supabase
      .from('modulos').update({ archivado }).eq('id', id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('archivarModulo:', err.message);
    res.status(500).json({ error: 'No se pudo archivar el módulo' });
  }
};

// ---------- SUBIDA DE VIDEO ----------
// POST /api/admin/upload-video  (multipart/form-data, campo "video")
exports.subirVideo = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se envió ningún archivo' });

    // Nombre único para evitar colisiones
    const ext = req.file.originalname.split('.').pop();
    const nombreArchivo = `modulo-${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from('videos-modulos')
      .upload(nombreArchivo, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });
    if (error) throw error;

    // URL pública del archivo subido
    const { data } = supabase.storage
      .from('videos-modulos')
      .getPublicUrl(nombreArchivo);

    res.status(201).json({ url: data.publicUrl });
  } catch (err) {
    console.error('subirVideo:', err.message);
    res.status(500).json({ error: 'No se pudo subir el video' });
  }
};

// ---------- ASIGNACIÓN DE CURSOS (RF-81 / RF-82) ----------

// GET /api/admin/cuidadoras  -> catálogo para asignar cursos
exports.listarCuidadorasActivas = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('cuidadoras')
      .select(`
        id, especialidades, años_experiencia, estado_validacion,
        perfiles!inner ( nombre, avatar_url, ciudad )
      `);
    if (error) throw error;

    const resultado = (data || []).map((c) => ({
      id: c.id,
      nombre: (c.perfiles?.nombre || 'Sin nombre').trim(),
      avatarUrl: c.perfiles?.avatar_url || null,
      ciudad: c.perfiles?.ciudad || null,
      especialidades: c.especialidades || [],
      años_experiencia: c.años_experiencia || 0,
      estado_validacion: c.estado_validacion || 'pendiente',
    }));
    resultado.sort((a, b) => a.nombre.localeCompare(b.nombre));
    res.json(resultado);
  } catch (err) {
    console.error('listarCuidadorasActivas:', err.message);
    res.status(500).json({ error: 'No se pudieron obtener las cuidadoras' });
  }
};

// POST /api/admin/cursos/:cursoId/asignar  body: { cuidadoraIds?: string[], todas?: boolean }
exports.asignarCurso = async (req, res) => {
  try {
    const { cursoId } = req.params;
    const { cuidadoraIds, todas } = req.body;

    const { data: curso } = await supabase
      .from('cursos').select('id').eq('id', cursoId).maybeSingle();
    if (!curso) return res.status(404).json({ error: 'Curso no encontrado' });

    let ids = Array.isArray(cuidadoraIds) ? cuidadoraIds : [];
    if (todas) {
      const { data: todasCuidadoras } = await supabase
        .from('cuidadoras')
        .select('id, perfiles!inner(id)');
      ids = (todasCuidadoras || []).map((c) => c.id);
    }
    ids = [...new Set(ids.filter(Boolean))];
    if (ids.length === 0) return res.status(400).json({ error: 'Selecciona al menos una cuidadora' });

    const { data: existentes } = await supabase
      .from('cursos_asignados')
      .select('cuidadora_id')
      .eq('curso_id', cursoId)
      .in('cuidadora_id', ids);

    const yaAsignadas = new Set((existentes || []).map((e) => e.cuidadora_id));
    const nuevas = ids.filter((cid) => !yaAsignadas.has(cid));

    if (nuevas.length > 0) {
      const filas = nuevas.map((cid) => ({ curso_id: cursoId, cuidadora_id: cid }));
      const { error } = await supabase.from('cursos_asignados').insert(filas);
      if (error) throw error;
    }

    res.json({ asignadas: ids.length, nuevas: nuevas.length, yaAsignadas: yaAsignadas.size });
  } catch (err) {
    console.error('asignarCurso:', err.message);
    res.status(500).json({ error: 'No se pudo asignar el curso' });
  }
};

// DELETE /api/admin/cursos/:cursoId/asignar/:cuidadoraId
exports.desasignarCurso = async (req, res) => {
  try {
    const { cursoId, cuidadoraId } = req.params;
    const { error } = await supabase
      .from('cursos_asignados')
      .delete()
      .eq('curso_id', cursoId)
      .eq('cuidadora_id', cuidadoraId);
    if (error) throw error;
    res.json({ mensaje: 'Asignación eliminada' });
  } catch (err) {
    console.error('desasignarCurso:', err.message);
    res.status(500).json({ error: 'No se pudo quitar la asignación' });
  }
};

// GET /api/admin/cursos/:cursoId/asignaciones
// Devuelve por cuidadora asignada: nombre, avatar y progreso en el curso (RF-82).
exports.obtenerAsignacionesCurso = async (req, res) => {
  try {
    const { cursoId } = req.params;

    const { data: asignaciones, error: e1 } = await supabase
      .from('cursos_asignados')
      .select('cuidadora_id')
      .eq('curso_id', cursoId);
    if (e1) throw e1;

    const cuidadoraIds = (asignaciones || []).map((a) => a.cuidadora_id);
    if (cuidadoraIds.length === 0) return res.json([]);

    const { data: cuidadoras, error: e2 } = await supabase
      .from('cuidadoras')
      .select(`id, perfiles!inner ( nombre, avatar_url )`)
      .in('id', cuidadoraIds);
    if (e2) throw e2;

    const { data: modulos, error: e3 } = await supabase
      .from('modulos')
      .select('id')
      .eq('curso_id', cursoId)
      .eq('archivado', false);
    if (e3) throw e3;
    const total = (modulos || []).length;

    const { data: progreso, error: e4 } = await supabase
      .from('progreso_modulos')
      .select('cuidadora_id, modulo_id')
      .eq('curso_id', cursoId)
      .in('cuidadora_id', cuidadoraIds);
    if (e4) throw e4;

    const resultado = cuidadoraIds.map((cid) => {
      const c = cuidadoras.find((x) => x.id === cid);
      const filasProgreso = (progreso || []).filter((p) => p.cuidadora_id === cid);
      return {
        cuidadoraId: cid,
        nombre: (c?.perfiles?.nombre || 'Sin nombre').trim(),
        avatarUrl: c?.perfiles?.avatar_url || null,
        completados: filasProgreso.length,
        completadosIds: filasProgreso.map((p) => p.modulo_id),
        total,
        porcentaje: total > 0 ? Math.round((filasProgreso.length / total) * 100) : 0,
      };
    });

    resultado.sort((a, b) => a.nombre.localeCompare(b.nombre));
    res.json(resultado);
  } catch (err) {
    console.error('obtenerAsignacionesCurso:', err.message);
    res.status(500).json({ error: 'No se pudieron obtener las asignaciones' });
  }
};

// Calcula el estado general a partir de los documentos obligatorios
function estadoGeneral(docs) {
  const obligatorios = docs.filter((d) => DOCS_OBLIGATORIOS.includes(d.tipo));
  const subidos = obligatorios.filter((d) => d.url);
  if (obligatorios.some((d) => d.estado === 'cambios_solicitados')) return 'changes_requested';
  if (subidos.length === DOCS_OBLIGATORIOS.length && subidos.every((d) => d.estado === 'aprobado')) {
    return 'approved';
  }
  return 'pending';
}

// GET /api/admin/validaciones  -> lista para la pantalla de Validaciones
exports.listarValidaciones = async (req, res) => {
  try {
    // Cuidadoras con su perfil (nombre) y sus urls de documentos
    const { data: cuidadoras, error: e1 } = await supabase
      .from('cuidadoras')
      .select(`
        id, url_cedula, url_certificado_migratorio, url_record_policial,
        url_copia_titulo, url_certificados, url_cv,
        estado_validacion, motivo_rechazo,
        perfiles!inner ( nombre, avatar_url )
      `);
    if (e1) throw e1;

    const { data: revisiones, error: e2 } = await supabase
      .from('revisiones_documentos')
      .select('*');
    if (e2) throw e2;

    const resultado = cuidadoras.map((c) => {
      const docs = TIPOS_DOC.map((tipo) => {
        const rev = revisiones.find((r) => r.cuidadora_id === c.id && r.tipo === tipo);
        return {
          tipo,
          url: c[COL_DOC[tipo]] || null,
          estado: rev?.estado || 'pendiente',
          nota: rev?.nota || null,
        };
      });
      const subidosObligatorios = docs.filter((d) => DOCS_OBLIGATORIOS.includes(d.tipo) && d.url).length;

      return {
        id: c.id,
        caregiverId: c.id,
        caregiverName: (c.perfiles?.nombre || 'Sin nombre').trim(),
        caregiverAvatarUrl: c.perfiles?.avatar_url || null,
        status: estadoGeneral(docs),
        estadoValidacion: c.estado_validacion || 'pendiente',
        motivoRechazo: c.motivo_rechazo || null,
        uploadedDocs: subidosObligatorios,
        totalDocs: DOCS_OBLIGATORIOS.length,
        docs,
      };
    });

    res.json(resultado);
  } catch (err) {
    console.error('listarValidaciones:', err.message);
    res.status(500).json({ error: 'No se pudieron obtener las validaciones' });
  }
};

// PATCH /api/admin/validaciones/:cuidadoraId/documento
// body: { tipo, estado: 'aprobado'|'cambios_solicitados', nota? }
exports.revisarDocumento = async (req, res) => {
  try {
    const { cuidadoraId } = req.params;
    const { tipo, estado, nota } = req.body;

    if (!TIPOS_DOC.includes(tipo)) {
      return res.status(400).json({ error: 'Tipo de documento no válido' });
    }
    if (!['aprobado', 'cambios_solicitados'].includes(estado)) {
      return res.status(400).json({ error: 'Estado no válido' });
    }

    const { data, error } = await supabase
      .from('revisiones_documentos')
      .upsert(
        {
          cuidadora_id: cuidadoraId,
          tipo,
          estado,
          nota: estado === 'cambios_solicitados' ? (nota || null) : null,
          revisado_at: new Date().toISOString(),
        },
        { onConflict: 'cuidadora_id,tipo' }
      )
      .select()
      .single();
    if (error) throw error;

    // dentro de revisarDocumento, antes del res.json(data)
    await supabase.from('notificaciones').insert({
      usuario_id: cuidadoraId,
      tipo: 'documento',
      titulo: estado === 'aprobado' ? 'Documento aprobado' : 'Cambios solicitados en un documento',
      mensaje: estado === 'aprobado'
        ? `Tu documento fue aprobado.`
        : `Se solicitaron cambios en tu documento${nota ? `: ${nota}` : '.'}`,
    });

    res.json(data);
  } catch (err) {
    console.error('revisarDocumento:', err.message);
    res.status(500).json({ error: 'No se pudo revisar el documento' });
  }
};

// PATCH /api/admin/validaciones/:cuidadoraId/aprobar
// Aprueba el PERFIL COMPLETO (RF-69). Requiere los 6 documentos subidos y aprobados.
exports.aprobarPerfil = async (req, res) => {
  try {
    const { cuidadoraId } = req.params;

    const { data: cuidadora, error: e1 } = await supabase
      .from('cuidadoras')
      .select('url_cedula, url_certificado_migratorio, url_record_policial, url_copia_titulo, url_certificados, url_cv')
      .eq('id', cuidadoraId)
      .single();
    if (e1) throw e1;

    const { data: revisiones, error: e2 } = await supabase
      .from('revisiones_documentos')
      .select('*')
      .eq('cuidadora_id', cuidadoraId);
    if (e2) throw e2;

    const docs = TIPOS_DOC.map((tipo) => {
      const rev = (revisiones || []).find((r) => r.tipo === tipo);
      return {
        tipo,
        url: cuidadora[COL_DOC[tipo]] || null,
        estado: rev?.estado || 'pendiente',
      };
    });
    if (estadoGeneral(docs) !== 'approved') {
      return res.status(400).json({
        error: 'Los documentos obligatorios (cédula y record policial) deben estar subidos y aprobados para aprobar el perfil',
      });
    }

    const { data, error: e3 } = await supabase
      .from('cuidadoras')
      .update({
        estado_validacion: 'aprobado',
        motivo_rechazo: null,
        fecha_validacion: new Date().toISOString(),
      })
      .eq('id', cuidadoraId)
      .select('estado_validacion, motivo_rechazo, fecha_validacion')
      .single();
    if (e3) throw e3;

    await supabase.from('notificaciones').insert({
      usuario_id: cuidadoraId,
      tipo: 'validacion',
      titulo: 'Perfil verificado',
      mensaje: 'Tu perfil fue aprobado. Ahora eres una cuidadora verificada de Cuida Red.',
    });

    res.json(data);
  } catch (err) {
    console.error('aprobarPerfil:', err.message);
    res.status(500).json({ error: 'No se pudo aprobar el perfil' });
  }
};

// PATCH /api/admin/validaciones/:cuidadoraId/rechazar  body: { motivo }
exports.rechazarPerfil = async (req, res) => {
  try {
    const { cuidadoraId } = req.params;
    const { motivo } = req.body;
    if (!motivo || !String(motivo).trim()) {
      return res.status(400).json({ error: 'El motivo de rechazo es obligatorio' });
    }

    const { data, error } = await supabase
      .from('cuidadoras')
      .update({
        estado_validacion: 'rechazado',
        motivo_rechazo: String(motivo).trim(),
        fecha_validacion: new Date().toISOString(),
      })
      .eq('id', cuidadoraId)
      .select('estado_validacion, motivo_rechazo, fecha_validacion')
      .single();
    if (error) throw error;

    await supabase.from('notificaciones').insert({
      usuario_id: cuidadoraId,
      tipo: 'validacion',
      titulo: 'Perfil rechazado',
      mensaje: `Tu perfil no fue aprobado. Motivo: ${String(motivo).trim()}`,
    });

    res.json(data);
  } catch (err) {
    console.error('rechazarPerfil:', err.message);
    res.status(500).json({ error: 'No se pudo rechazar el perfil' });
  }
};

// GET /api/admin/solicitudes
exports.obtenerSolicitudes = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('solicitudes_conexion')
      .select(`
        id, estado, familia_confirmo, cuidadora_confirmo, creado_en, motivo_rechazo_admin,
        familiares!familiar_id ( id, nombre, parentesco, edad, tipos_cuidado, condiciones_especificas ),
        empleadoras!empleadora_id ( id, perfiles!inner ( nombre, ciudad ) ),
        cuidadoras!cuidadora_id ( id, especialidades, calificacion_promedio, perfiles!inner ( nombre, avatar_url ) )
      `)
      .order('creado_en', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('obtenerSolicitudes:', err.message);
    res.status(500).json({ error: 'No se pudieron obtener las solicitudes' });
  }
};

// PUT /api/admin/solicitudes/:id/tomar
exports.tomarSolicitud = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: solicitud, error } = await supabase
      .from('solicitudes_conexion')
      .update({ estado: 'en_gestion' })
      .eq('id', id)
      .eq('estado', 'nueva')
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!solicitud) return res.status(409).json({ error: 'La solicitud ya no está en estado nueva' });

    // Crear las dos conversaciones
    const { data: conversaciones, error: eConv } = await supabase
      .from('conversaciones')
      .insert([
        { solicitud_id: id, tipo: 'familia' },
        { solicitud_id: id, tipo: 'cuidadora' },
      ])
      .select();
    if (eConv) throw eConv;

    const convFamilia = conversaciones.find((c) => c.tipo === 'familia');
    const convCuidadora = conversaciones.find((c) => c.tipo === 'cuidadora');

    // Mensajes automáticos iniciales
    const { error: eMsg } = await supabase.from('mensajes').insert([
      {
        conversacion_id: convFamilia.id,
        remitente: 'sistema',
        texto: 'Hola, soy el equipo de Cuida Red. Estamos coordinando el contacto con la cuidadora para tu familiar. Te mantendremos informado.',
      },
      {
        conversacion_id: convCuidadora.id,
        remitente: 'sistema',
        texto: 'Hola, soy el equipo de Cuida Red. Tienes una nueva oportunidad disponible. Cualquier duda, contáctanos por aquí.',
      },
    ]);
    if (eMsg) throw eMsg;

    // 👇 AGREGADO: notificación para la cuidadora
    await supabase.from('notificaciones').insert({
      usuario_id: solicitud.cuidadora_id,
      tipo: 'oportunidad',
      titulo: 'Nueva oportunidad disponible',
      mensaje: 'Tienes una nueva familia interesada en tu perfil.',
      solicitud_id: id,
    });

    res.json(solicitud);
  } catch (err) {
    console.error('tomarSolicitud:', err.message);
    res.status(500).json({ error: 'No se pudo tomar la solicitud' });
  }
};

// PATCH /api/admin/solicitudes/:id/rechazar  body: { motivo }
// El admin rechaza una solicitud de conexión (RF-73). Solo desde nueva o en_gestion.
exports.rechazarSolicitud = async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body;
    if (!motivo || !String(motivo).trim()) {
      return res.status(400).json({ error: 'El motivo de rechazo es obligatorio' });
    }

    const { data: solicitud, error } = await supabase
      .from('solicitudes_conexion')
      .update({ estado: 'rechazada_admin', motivo_rechazo_admin: String(motivo).trim() })
      .eq('id', id)
      .in('estado', ['nueva', 'en_gestion'])
      .select('empleadora_id, cuidadora_id')
      .maybeSingle();
    if (error) throw error;
    if (!solicitud) return res.status(409).json({ error: 'La solicitud ya no se puede rechazar' });

    await supabase.from('notificaciones').insert({
      usuario_id: solicitud.empleadora_id,
      tipo: 'solicitud',
      titulo: 'Solicitud rechazada',
      mensaje: `Tu solicitud de conexión fue rechazada por Cuida Red. Motivo: ${String(motivo).trim()}`,
      solicitud_id: id,
    });

    res.json(solicitud);
  } catch (err) {
    console.error('rechazarSolicitud:', err.message);
    res.status(500).json({ error: 'No se pudo rechazar la solicitud' });
  }
};

// POST /api/admin/solicitudes/:solicitudId/crear-servicio
exports.crearServicio = async (req, res) => {
  try {
    const { solicitudId } = req.params;

    const { data: solicitud, error: e1 } = await supabase
      .from('solicitudes_conexion')
      .select('*')
      .eq('id', solicitudId)
      .single();
    if (e1) throw e1;
    if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });

    if (!(solicitud.familia_confirmo && solicitud.cuidadora_confirmo)) {
      return res.status(400).json({ error: 'Ambas partes deben confirmar antes de crear el servicio' });
    }
    if (solicitud.estado === 'servicio_creado') {
      return res.status(409).json({ error: 'El servicio ya fue creado' });
    }

    const { titulo, descripcion, horario } = req.body;

    const { data: servicio, error: e2 } = await supabase
      .from('servicios')
      .insert({
        solicitud_id: solicitud.id,
        empleadora_id: solicitud.empleadora_id,
        familiar_id: solicitud.familiar_id,
        cuidadora_id: solicitud.cuidadora_id,
        titulo: titulo || 'Servicio de cuidado',
        descripcion: descripcion || '',
        horario: horario || null,
        estado: 'en_coordinacion',
      })
      .select().single();
    if (e2) throw e2;

    const { error: e3 } = await supabase
      .from('solicitudes_conexion')
      .update({ estado: 'servicio_creado' })
      .eq('id', solicitud.id);
    if (e3) throw e3;

    // dentro de crearServicio, antes del res.status(201).json(servicio)
    await supabase.from('notificaciones').insert([
      {
        usuario_id: solicitud.empleadora_id,
        tipo: 'servicio',
        titulo: 'Servicio confirmado',
        mensaje: 'Tu servicio de cuidado ha sido confirmado por Cuida Red.',
        solicitud_id: solicitud.id,
      },
      {
        usuario_id: solicitud.cuidadora_id,
        tipo: 'servicio',
        titulo: 'Servicio confirmado',
        mensaje: 'Tu servicio de cuidado ha sido confirmado por Cuida Red.',
        solicitud_id: solicitud.id,
      },
    ]);

    res.status(201).json(servicio);
  } catch (err) {
    console.error('crearServicio:', err.message);
    res.status(500).json({ error: 'No se pudo crear el servicio' });
  }
};
// GET /api/admin/solicitudes/:solicitudId/conversacion/:tipo/mensajes
exports.obtenerMensajesAdmin = async (req, res) => {
  try {
    const { solicitudId, tipo } = req.params;
    const { data: conv, error: e1 } = await supabase
      .from('conversaciones').select('id').eq('solicitud_id', solicitudId).eq('tipo', tipo).maybeSingle();
    if (e1) throw e1;
    if (!conv) return res.json([]);

    const { data, error: e2 } = await supabase
      .from('mensajes').select('*').eq('conversacion_id', conv.id).order('creado_en', { ascending: true });
    if (e2) throw e2;
    res.json(data);
  } catch (err) {
    console.error('obtenerMensajesAdmin:', err.message);
    res.status(500).json({ error: 'No se pudieron obtener los mensajes' });
  }
};

// POST /api/admin/solicitudes/:solicitudId/conversacion/:tipo/mensajes  body: { texto }
exports.enviarMensajeAdmin = async (req, res) => {
  try {
    const { solicitudId, tipo } = req.params;
    const { texto } = req.body;
    if (!texto) return res.status(400).json({ error: 'Falta el texto' });

    const { data: conv, error: e1 } = await supabase
      .from('conversaciones').select('id').eq('solicitud_id', solicitudId).eq('tipo', tipo).single();
    if (e1) throw e1;

    const { data, error: e2 } = await supabase
      .from('mensajes').insert({ conversacion_id: conv.id, remitente: 'admin', texto }).select().single();
    if (e2) throw e2;

    // 👇 AGREGADO: notificación para el destinatario
    const { data: solicitud } = await supabase
      .from('solicitudes_conexion')
      .select('empleadora_id, cuidadora_id')
      .eq('id', solicitudId)
      .single();
    if (solicitud) {
      const destinatarioId = tipo === 'familia' ? solicitud.empleadora_id : solicitud.cuidadora_id;
      await supabase.from('notificaciones').insert({
        usuario_id: destinatarioId,
        tipo: 'mensaje',
        titulo: 'Nuevo mensaje de Cuida Red',
        mensaje: texto,
        solicitud_id: solicitudId,
      });
    }

    res.status(201).json(data);
  } catch (err) {
    console.error('enviarMensajeAdmin:', err.message);
    res.status(500).json({ error: 'No se pudo enviar el mensaje' });
  }
};

// PUT /api/admin/solicitudes/:solicitudId/completar-servicio
exports.completarServicio = async (req, res) => {
  try {
    const { solicitudId } = req.params;
    const { data: servicio, error: e1 } = await supabase
      .from('servicios')
      .select('id, empleadora_id')
      .eq('solicitud_id', solicitudId)
      .single();
    if (e1) throw e1;
    if (!servicio) return res.status(404).json({ error: 'Servicio no encontrado' });

    const { data, error: e2 } = await supabase
      .from('servicios')
      .update({ estado: 'completado' })
      .eq('id', servicio.id)
      .select().single();
    if (e2) throw e2;

    await supabase.from('notificaciones').insert({
      usuario_id: servicio.empleadora_id,
      tipo: 'servicio',
      titulo: 'Servicio completado',
      mensaje: 'Tu servicio de cuidado ha finalizado. Puedes dejar una reseña.',
      solicitud_id: solicitudId,
    });

    res.json(data);
  } catch (err) {
    console.error('completarServicio:', err.message);
    res.status(500).json({ error: 'No se pudo completar el servicio' });
  }
};

exports.actualizarServicio = async (req, res) => {
  try {
    const { solicitudId } = req.params;
    const { titulo, descripcion, horario } = req.body;

    const { data: servicio, error: e1 } = await supabase
      .from('servicios')
      .select('id')
      .eq('solicitud_id', solicitudId)
      .maybeSingle();
    if (e1) throw e1;
    if (!servicio) return res.status(404).json({ error: 'Servicio no encontrado' });

    const updates = {};
    if (titulo !== undefined) updates.titulo = titulo;
    if (descripcion !== undefined) updates.descripcion = descripcion;
    if (horario !== undefined) updates.horario = horario;

    const { data, error: e2 } = await supabase
      .from('servicios')
      .update(updates)
      .eq('id', servicio.id)
      .select()
      .single();
    if (e2) throw e2;

    res.json(data);
  } catch (err) {
    console.error('actualizarServicio:', err.message);
    res.status(500).json({ error: 'No se pudo actualizar el servicio' });
  }
};

exports.getDashboardMetrics = getDashboardMetrics;