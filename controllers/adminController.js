const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const TIPOS_DOC = ['cedula', 'migratorio', 'record_policial', 'titulo', 'certificaciones', 'cv'];
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

    // --- VALIDACIONES ---
    // Reutilizamos la misma lógica de estado que en listarValidaciones
    const { data: cuidadoras } = await supabase
      .from('cuidadoras')
      .select(`
        id, url_cedula, url_certificado_migratorio, url_record_policial,
        url_copia_titulo, url_certificados, url_cv
      `);

    const { data: revisiones } = await supabase
      .from('revisiones_documentos')
      .select('*');

    let valPendientes = 0;
    let valAprobadas = 0;
    let valCambios = 0;

    (cuidadoras || []).forEach((c) => {
      const docs = TIPOS_DOC.map((tipo) => {
        const rev = (revisiones || []).find(
          (r) => r.cuidadora_id === c.id && r.tipo === tipo
        );
        return {
          url: c[COL_DOC[tipo]] || null,
          estado: rev?.estado || 'pendiente',
        };
      });
      const estado = estadoGeneral(docs);
      if (estado === 'approved') valAprobadas++;
      else if (estado === 'changes_requested') valCambios++;
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
        enProgreso: 0,   // pendiente: requiere tabla de progreso
        completados: 0,  // pendiente: requiere tabla de progreso
      },

      validaciones: {
        pendientes: valPendientes,
        aprobadas: valAprobadas,
        cambiosSolicitados: valCambios,
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

// Calcula el estado general a partir de los 6 documentos
function estadoGeneral(docs) {
  const subidos = docs.filter((d) => d.url);
  if (subidos.some((d) => d.estado === 'cambios_solicitados')) return 'changes_requested';
  if (subidos.length === TIPOS_DOC.length && subidos.every((d) => d.estado === 'aprobado')) {
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
      const subidos = docs.filter((d) => d.url).length;

      return {
        id: c.id,
        caregiverId: c.id,
        caregiverName: c.perfiles?.nombre || 'Sin nombre',
        caregiverAvatarUrl: c.perfiles?.avatar_url || null,
        status: estadoGeneral(docs),
        uploadedDocs: subidos,
        totalDocs: TIPOS_DOC.length,
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

// GET /api/admin/solicitudes
exports.obtenerSolicitudes = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('solicitudes_conexion')
      .select(`
        id, estado, familia_confirmo, cuidadora_confirmo, creado_en,
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

    const { titulo, descripcion } = req.body;

    const { data: servicio, error: e2 } = await supabase
      .from('servicios')
      .insert({
        solicitud_id: solicitud.id,
        empleadora_id: solicitud.empleadora_id,
        familiar_id: solicitud.familiar_id,
        cuidadora_id: solicitud.cuidadora_id,
        titulo: titulo || 'Servicio de cuidado',
        descripcion: descripcion || '',
        estado: 'en_coordinacion', // ← corregido
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

exports.getDashboardMetrics = getDashboardMetrics;