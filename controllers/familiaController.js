const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function notificarAdmins({ tipo, titulo, mensaje, solicitud_id }) {
  const { data: admins } = await supabase.from('perfiles').select('id').eq('rol', 'admin');
  if (!admins || admins.length === 0) return;
  await supabase.from('notificaciones').insert(
    admins.map((a) => ({ usuario_id: a.id, tipo, titulo, mensaje, solicitud_id }))
  );
}

// GET /api/familia/:empleadoraId/perfil
exports.obtenerPerfilFamilia = async (req, res) => {
  try {
    const { empleadoraId } = req.params;

    const { data: perfil, error: e1 } = await supabase
      .from('perfiles')
      .select('nombre, correo, telefono, ciudad, provincia')
      .eq('id', empleadoraId).single();
    if (e1) throw e1;

    const { data: empleadora, error: e2 } = await supabase
      .from('empleadoras')
      .select('*')
      .eq('id', empleadoraId).single();
    if (e2) throw e2;

    const { data: familiares, error: e3 } = await supabase
      .from('familiares')
      .select('*')
      .eq('empleadora_id', empleadoraId)
      .order('creado_en', { ascending: true });
    if (e3) throw e3;

    res.json({ ...perfil, ...empleadora, familiares: familiares || [] });
  } catch (err) {
    console.error('obtenerPerfilFamilia:', err.message);
    res.status(500).json({ error: 'No se pudo obtener el perfil' });
  }
};

// DELETE /api/familia/familiar/:familiarId
exports.eliminarFamiliar = async (req, res) => {
  try {
    const { familiarId } = req.params;
    const { error } = await supabase.from('familiares').delete().eq('id', familiarId);
    if (error) throw error;
    res.json({ mensaje: 'Familiar eliminado' });
  } catch (err) {
    console.error('eliminarFamiliar:', err.message);
    res.status(500).json({ error: 'No se pudo eliminar el familiar' });
  }
};

// POST /api/familia/:empleadoraId/familiar
exports.agregarFamiliar = async (req, res) => {
  try {
    const { empleadoraId } = req.params;
    const { nombre, parentesco, edad, tipos_cuidado } = req.body;
    if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });

    const { data, error } = await supabase
      .from('familiares')
      .insert({
        empleadora_id: empleadoraId,
        nombre,
        parentesco: parentesco || null,
        edad: edad ? parseInt(edad, 10) : null,
        tipos_cuidado: tipos_cuidado || [],
        condiciones_especificas: req.body.condiciones_especificas || null,
        dias_disponibles: req.body.dias_disponibles || null,
        alcance_servicio: req.body.alcance_servicio || null,
      })
      .select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('agregarFamiliar:', err.message);
    res.status(500).json({ error: 'No se pudo agregar el familiar' });
  }
};

// PUT /api/familia/familiar/:familiarId
exports.editarFamiliar = async (req, res) => {
  try {
    const { familiarId } = req.params;
    const { nombre, parentesco, edad, tipos_cuidado } = req.body;

    const cambios = {};
    if (nombre !== undefined) cambios.nombre = nombre;
    if (parentesco !== undefined) cambios.parentesco = parentesco;
    if (edad !== undefined) cambios.edad = edad ? parseInt(edad, 10) : null;
    if (tipos_cuidado !== undefined) cambios.tipos_cuidado = tipos_cuidado;
    if (req.body.condiciones_especificas !== undefined) cambios.condiciones_especificas = req.body.condiciones_especificas;
    if (req.body.dias_disponibles !== undefined) cambios.dias_disponibles = req.body.dias_disponibles;
    if (req.body.alcance_servicio !== undefined) cambios.alcance_servicio = req.body.alcance_servicio;

    const { data, error } = await supabase
      .from('familiares').update(cambios).eq('id', familiarId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('editarFamiliar:', err.message);
    res.status(500).json({ error: 'No se pudo actualizar el familiar' });
  }
};

// GET /api/familia/familiar/:familiarId  (para cargar en modo edición)
exports.obtenerFamiliar = async (req, res) => {
  try {
    const { familiarId } = req.params;
    const { data, error } = await supabase
      .from('familiares').select('*').eq('id', familiarId).single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('obtenerFamiliar:', err.message);
    res.status(500).json({ error: 'No se pudo obtener el familiar' });
  }
};

// PUT /api/familia/:empleadoraId/perfil
exports.actualizarPerfilFamilia = async (req, res) => {
  try {
    const { empleadoraId } = req.params;
    const {
      nombre, telefono, ciudad, provincia,
      direccion, sector, composicion_hogar, referencia_direccion,
      tipo_vivienda, caracteristicas_vivienda, tiene_mascotas,
    } = req.body;

    // Actualiza perfiles (datos de la cuenta)
    const cambiosPerfil = {};
    if (nombre !== undefined) cambiosPerfil.nombre = nombre;
    if (telefono !== undefined) cambiosPerfil.telefono = telefono;
    if (ciudad !== undefined) cambiosPerfil.ciudad = ciudad;
    if (provincia !== undefined) cambiosPerfil.provincia = provincia;
    if (Object.keys(cambiosPerfil).length > 0) {
      const { error: e1 } = await supabase
        .from('perfiles').update(cambiosPerfil).eq('id', empleadoraId);
      if (e1) throw e1;
    }

    // Actualiza empleadoras (datos del hogar)
    const cambiosEmp = {};
    if (direccion !== undefined) cambiosEmp.direccion = direccion;
    if (sector !== undefined) cambiosEmp.sector = sector;
    if (composicion_hogar !== undefined) cambiosEmp.composicion_hogar = composicion_hogar;
    if (referencia_direccion !== undefined) cambiosEmp.referencia_direccion = referencia_direccion;
    if (tipo_vivienda !== undefined) cambiosEmp.tipo_vivienda = tipo_vivienda;
    if (caracteristicas_vivienda !== undefined) cambiosEmp.caracteristicas_vivienda = caracteristicas_vivienda;
    if (tiene_mascotas !== undefined) cambiosEmp.tiene_mascotas = tiene_mascotas;
    if (Object.keys(cambiosEmp).length > 0) {
      const { error: e2 } = await supabase
        .from('empleadoras').update(cambiosEmp).eq('id', empleadoraId);
      if (e2) throw e2;
    }

    res.json({ mensaje: 'Perfil actualizado' });
  } catch (err) {
    console.error('actualizarPerfilFamilia:', err.message);
    res.status(500).json({ error: 'No se pudo actualizar el perfil' });
  }
};

// GET /api/familia/cuidadoras  -> lista de cuidadoras disponibles para buscar
exports.buscarCuidadoras = async (req, res) => {
  try {
    // Traemos cuidadoras con su nombre (de perfiles)
    const { data: cuidadoras, error } = await supabase
      .from('cuidadoras')
      .select(`
        id, especialidades, modalidad, zonas_cobertura, provincia,
        años_experiencia, calificacion_promedio, nivel_formacion,
        perfiles!inner ( nombre, ciudad, provincia )
      `);
    if (error) throw error;

    const resultado = (cuidadoras || []).map((c) => ({
      id: c.id,
      nombre: c.perfiles?.nombre || 'Cuidadora',
      ciudad: c.perfiles?.ciudad || '',
      especialidades: c.especialidades || [],
      modalidad: c.modalidad || [],
      zonas: c.zonas_cobertura || '',
      experiencia: c.años_experiencia || 0,
      calificacion: c.calificacion_promedio || null,
      formacion: c.nivel_formacion || '',
    }));

    res.json(resultado);
  } catch (err) {
    console.error('buscarCuidadoras:', err.message);
    res.status(500).json({ error: 'No se pudieron obtener las cuidadoras' });
  }
};

// POST /api/familia/interes  -> la familia expresa interés en una cuidadora
// body: { empleadoraId, familiarId, cuidadoraId }
exports.expresarInteres = async (req, res) => {
  try {
    const { empleadoraId, familiarId, cuidadoraId } = req.body;
    if (!empleadoraId || !familiarId || !cuidadoraId) {
      return res.status(400).json({ error: 'Faltan datos' });
    }

    // Evitar duplicados: ¿ya existe una solicitud activa para esta combinación?
    const { data: existente } = await supabase
      .from('solicitudes_conexion')
      .select('id, estado')
      .eq('empleadora_id', empleadoraId)
      .eq('familiar_id', familiarId)
      .eq('cuidadora_id', cuidadoraId)
      .not('estado', 'in', '(rechazada_cuidadora,cerrada)')
      .maybeSingle();

    if (existente) {
      return res.status(409).json({ error: 'Ya existe una solicitud activa para esta cuidadora' });
    }

    const { data, error } = await supabase
      .from('solicitudes_conexion')
      .insert({
        empleadora_id: empleadoraId,
        familiar_id: familiarId,
        cuidadora_id: cuidadoraId,
        estado: 'nueva',
      })
      .select().single();
    if (error) throw error;

    await notificarAdmins({
      tipo: 'solicitud',
      titulo: 'Nueva solicitud de interés',
      mensaje: 'Una familia expresó interés en una cuidadora.',
      solicitud_id: data.id,
    });

    res.status(201).json(data);
  } catch (err) {
    console.error('expresarInteres:', err.message);
    res.status(500).json({ error: 'No se pudo expresar el interés' });
  }
};

// GET /api/familia/:empleadoraId/solicitudes-pendientes
exports.obtenerSolicitudesPendientes = async (req, res) => {
  try {
    const { empleadoraId } = req.params;
    const { data, error } = await supabase
      .from('solicitudes_conexion')
      .select(`
        id, estado, familia_confirmo, cuidadora_confirmo,
        familiares!familiar_id ( id, nombre ),
        cuidadoras!cuidadora_id ( id, perfiles!inner ( nombre ) )
      `)
      .eq('empleadora_id', empleadoraId)
      .eq('estado', 'aceptada_cuidadora')
      .order('creado_en', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('obtenerSolicitudesPendientes:', err.message);
    res.status(500).json({ error: 'No se pudieron obtener las solicitudes' });
  }
};

// GET /api/familia/:empleadoraId/solicitudes
// Solicitudes activas de la familia (antes de convertirse en servicio).
exports.obtenerSolicitudesFamilia = async (req, res) => {
  try {
    const { empleadoraId } = req.params;
    const { data, error } = await supabase
      .from('solicitudes_conexion')
      .select(`
        id, estado, familia_confirmo, cuidadora_confirmo, creado_en,
        familiares!familiar_id ( id, nombre ),
        cuidadoras!cuidadora_id ( id, especialidades, perfiles!inner ( nombre, avatar_url ) )
      `)
      .eq('empleadora_id', empleadoraId)
      .in('estado', ['nueva', 'en_gestion', 'aceptada_cuidadora'])
      .order('creado_en', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('obtenerSolicitudesFamilia:', err.message);
    res.status(500).json({ error: 'No se pudieron obtener las solicitudes' });
  }
};

// PUT /api/familia/solicitudes/:id/confirmar
exports.confirmarFamilia = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('solicitudes_conexion')
      .update({ familia_confirmo: true })
      .eq('id', id)
      .select().single();
    if (error) throw error;

    await notificarAdmins({
      tipo: 'confirmacion',
      titulo: 'Familia confirmó el servicio',
      mensaje: 'Una familia confirmó su parte del servicio.',
      solicitud_id: id,
    });
    res.json(data);
  } catch (err) {
    console.error('confirmarFamilia:', err.message);
    res.status(500).json({ error: 'No se pudo confirmar' });
  }
};

// GET /api/familia/:empleadoraId/servicios
exports.obtenerServiciosFamilia = async (req, res) => {
  try {
    const { empleadoraId } = req.params;
    const { data, error } = await supabase
      .from('servicios')
      .select(`
        id, titulo, descripcion, estado, creado_en,
        familiares!familiar_id ( id, nombre, dias_disponibles ),
        cuidadoras!cuidadora_id ( id, especialidades, perfiles!inner ( nombre, avatar_url ) )
      `)
      .eq('empleadora_id', empleadoraId)
      .order('creado_en', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('obtenerServiciosFamilia:', err.message);
    res.status(500).json({ error: 'No se pudieron obtener los servicios' });
  }
};

// GET /api/familia/servicio/:id
exports.obtenerServicioFamiliaDetalle = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('servicios')
      .select(`
        id, titulo, descripcion, estado, creado_en,
        familiares!familiar_id ( id, nombre, dias_disponibles ),
        cuidadoras!cuidadora_id ( id, especialidades, perfiles!inner ( nombre ) )
      `)
      .eq('id', id)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('obtenerServicioFamiliaDetalle:', err.message);
    res.status(500).json({ error: 'No se pudo obtener el servicio' });
  }
};

// GET /api/familia/solicitudes/:solicitudId/mensajes
exports.obtenerMensajesFamilia = async (req, res) => {
  try {
    const { solicitudId } = req.params;
    const { data: conv } = await supabase
      .from('conversaciones').select('id').eq('solicitud_id', solicitudId).eq('tipo', 'familia').maybeSingle();
    if (!conv) return res.json([]);
    const { data, error } = await supabase
      .from('mensajes').select('*').eq('conversacion_id', conv.id).order('creado_en', { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('obtenerMensajesFamilia:', err.message);
    res.status(500).json({ error: 'No se pudieron obtener los mensajes' });
  }
};

// POST /api/familia/solicitudes/:solicitudId/mensajes  body: { texto }
exports.enviarMensajeFamilia = async (req, res) => {
  try {
    const { solicitudId } = req.params;
    const { texto } = req.body;
    if (!texto) return res.status(400).json({ error: 'Falta el texto' });
    const { data: conv, error: e1 } = await supabase
      .from('conversaciones').select('id').eq('solicitud_id', solicitudId).eq('tipo', 'familia').single();
    if (e1) throw e1;
    const { data, error: e2 } = await supabase
      .from('mensajes').insert({ conversacion_id: conv.id, remitente: 'familia', texto }).select().single();
    if (e2) throw e2;

    await notificarAdmins({
      tipo: 'mensaje',
      titulo: 'Nuevo mensaje de una familia',
      mensaje: texto,
      solicitud_id: solicitudId,
    });
    res.status(201).json(data);
  } catch (err) {
    console.error('enviarMensajeFamilia:', err.message);
    res.status(500).json({ error: 'No se pudo enviar el mensaje' });
  }
};

// GET /api/familia/:empleadoraId/conversaciones
exports.obtenerConversacionesFamilia = async (req, res) => {
  try {
    const { empleadoraId } = req.params;

    const { data: solicitudes, error: e1 } = await supabase
      .from('solicitudes_conexion')
      .select(`
        id, estado,
        familiares!familiar_id ( nombre ),
        cuidadoras!cuidadora_id ( id, perfiles!inner ( nombre ) )
      `)
      .eq('empleadora_id', empleadoraId);
    if (e1) throw e1;
    if (!solicitudes || solicitudes.length === 0) return res.json([]);

    const solicitudIds = solicitudes.map((s) => s.id);

    const { data: conversaciones, error: e2 } = await supabase
      .from('conversaciones')
      .select('id, solicitud_id')
      .in('solicitud_id', solicitudIds)
      .eq('tipo', 'familia');
    if (e2) throw e2;
    if (!conversaciones || conversaciones.length === 0) return res.json([]);

    const convIds = conversaciones.map((c) => c.id);

    const { data: mensajes, error: e3 } = await supabase
      .from('mensajes')
      .select('conversacion_id, texto, creado_en')
      .in('conversacion_id', convIds)
      .order('creado_en', { ascending: false });
    if (e3) throw e3;

    const resultado = conversaciones.map((conv) => {
      const solicitud = solicitudes.find((s) => s.id === conv.solicitud_id);
      const ultimoMensaje = (mensajes || []).find((m) => m.conversacion_id === conv.id);
      return {
        solicitudId: solicitud.id,
        estado: solicitud.estado,
        familiarNombre: solicitud.familiares?.nombre || '',
        cuidadoraNombre: solicitud.cuidadoras?.perfiles?.nombre || 'Cuidador',
        ultimoMensaje: ultimoMensaje?.texto || '',
        ultimoMensajeFecha: ultimoMensaje?.creado_en || null,
      };
    });

    resultado.sort((a, b) => new Date(b.ultimoMensajeFecha || 0) - new Date(a.ultimoMensajeFecha || 0));
    res.json(resultado);
  } catch (err) {
    console.error('obtenerConversacionesFamilia:', err.message);
    res.status(500).json({ error: 'No se pudieron obtener las conversaciones' });
  }
};

// GET /api/familia/servicio/:id/resena
exports.obtenerResenaServicio = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('resenas').select('*').eq('servicio_id', id).maybeSingle();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('obtenerResenaServicio:', err.message);
    res.status(500).json({ error: 'No se pudo obtener la reseña' });
  }
};

// POST /api/familia/servicio/:id/resena  body: { calificacion, comentario, tag }
exports.crearResena = async (req, res) => {
  try {
    const { id } = req.params;
    const { calificacion, comentario, tag } = req.body;

    if (!calificacion || calificacion < 1 || calificacion > 5) {
      return res.status(400).json({ error: 'Calificación inválida (1 a 5)' });
    }

    const { data: servicio, error: e1 } = await supabase
      .from('servicios').select('id, estado, cuidadora_id, empleadora_id').eq('id', id).single();
    if (e1) throw e1;
    if (!servicio) return res.status(404).json({ error: 'Servicio no encontrado' });
    if (servicio.estado !== 'completado') {
      return res.status(400).json({ error: 'Solo se puede reseñar un servicio completado' });
    }

    const { data, error: e2 } = await supabase
      .from('resenas')
      .insert({
        servicio_id: servicio.id,
        cuidadora_id: servicio.cuidadora_id,
        empleadora_id: servicio.empleadora_id,
        calificacion,
        comentario: comentario || null,
        tag: tag || null,
      })
      .select().single();
    if (e2) throw e2;

    res.status(201).json(data);
  } catch (err) {
    console.error('crearResena:', err.message);
    if (err.code === '23505') return res.status(409).json({ error: 'Este servicio ya tiene una reseña' });
    res.status(500).json({ error: 'No se pudo crear la reseña' });
  }
};