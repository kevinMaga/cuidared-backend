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

// GET /api/cuidador/:cuidadoraId/cursos
// Devuelve SOLO los cursos asignados a la cuidadora (RF-81) con su progreso.
exports.obtenerCursosAsignados = async (req, res) => {
  try {
    const { cuidadoraId } = req.params;

    // Auto-reparación: asegura que la cuidadora tenga asignados TODOS los
    // cursos obligatorios activos (RF-81), incluso si faltaron al registrarse.
    const { data: obligatorios } = await supabase
      .from('cursos')
      .select('id')
      .eq('categoria', 'obligatorio')
      .eq('archivado', false);

    const { data: prevAsignaciones } = await supabase
      .from('cursos_asignados')
      .select('curso_id')
      .eq('cuidadora_id', cuidadoraId);

    const yaAsignados = new Set((prevAsignaciones || []).map((a) => a.curso_id));
    const faltantes = (obligatorios || [])
      .map((c) => c.id)
      .filter((cursoId) => !yaAsignados.has(cursoId));

    if (faltantes.length > 0) {
      const filas = faltantes.map((cursoId) => ({ curso_id: cursoId, cuidadora_id: cuidadoraId }));
      const { error: eIns } = await supabase.from('cursos_asignados').insert(filas);
      if (eIns) console.error('obtenerCursosAsignados (auto-asignación obligatorios):', eIns.message);
    }

    const { data: asignaciones, error: e1 } = await supabase
      .from('cursos_asignados')
      .select('curso_id')
      .eq('cuidadora_id', cuidadoraId);
    if (e1) throw e1;

    const cursoIds = (asignaciones || []).map((a) => a.curso_id);
    if (cursoIds.length === 0) return res.json([]);

    const { data: cursos, error: e2 } = await supabase
      .from('cursos')
      .select('*, modulos!inner(id, archivado)')
      .in('id', cursoIds)
      .eq('archivado', false)
      .order('created_at', { ascending: true });
    if (e2) throw e2;

    const { data: progreso, error: e3 } = await supabase
      .from('progreso_modulos')
      .select('curso_id, modulo_id')
      .eq('cuidadora_id', cuidadoraId)
      .in('curso_id', cursoIds);
    if (e3) throw e3;

    const resultado = (cursos || []).map((c) => {
      const modulosActivos = (c.modulos || []).filter((m) => !m.archivado);
      const total = modulosActivos.length;
      const completados = (progreso || [])
        .filter((p) => p.curso_id === c.id)
        .filter((p) => modulosActivos.some((m) => m.id === p.modulo_id)).length;
      return {
        ...c,
        modulos: modulosActivos,
        total_modulos: total,
        progreso: {
          completados,
          completadosIds: (progreso || []).filter((p) => p.curso_id === c.id).map((p) => p.modulo_id),
          total,
          porcentaje: total > 0 ? Math.round((completados / total) * 100) : 0,
        },
      };
    });

    res.json(resultado);
  } catch (err) {
    console.error('obtenerCursosAsignados:', err.message);
    res.status(500).json({ error: 'No se pudieron obtener los cursos asignados' });
  }
};

// GET /api/cuidador/:cuidadoraId/perfil
exports.obtenerPerfilCuidadora = async (req, res) => {
  try {
    const { cuidadoraId } = req.params;

    const { data: cuidadora, error: e1 } = await supabase
      .from('cuidadoras')
      .select('*')
      .eq('id', cuidadoraId)
      .single();
    if (e1) throw e1;

    const { data: perfil, error: e2 } = await supabase
      .from('perfiles')
      .select('nombre, correo, telefono, ciudad, provincia, avatar_url')  // 👈 agregado avatar_url
      .eq('id', cuidadoraId)
      .single();
    if (e2) throw e2;

    res.json({ ...cuidadora, ...perfil });
  } catch (err) {
    console.error('obtenerPerfilCuidadora:', err.message);
    res.status(500).json({ error: 'No se pudo obtener el perfil' });
  }
};

// PUT /api/cuidador/:cuidadoraId/perfil
exports.actualizarPerfilCuidadora = async (req, res) => {
  try {
    const { cuidadoraId } = req.params;
    const {
      nombre, telefono, biografia,
      especialidades, provincia, ciudad, zonas_cobertura,
      modalidad, tiene_licencia, idiomas, dias_disponibles,
    } = req.body;

    // Actualiza cuidadoras (solo los campos que llegaron)
    const cambiosCuidadora = {};
    if (biografia !== undefined) cambiosCuidadora.descripcion_estilo = biografia;
    if (especialidades !== undefined) cambiosCuidadora.especialidades = especialidades;
    if (provincia !== undefined) cambiosCuidadora.provincia = provincia;
    if (zonas_cobertura !== undefined) cambiosCuidadora.zonas_cobertura = zonas_cobertura;
    if (modalidad !== undefined) cambiosCuidadora.modalidad = modalidad;
    if (tiene_licencia !== undefined) cambiosCuidadora.tiene_licencia = tiene_licencia;
    if (idiomas !== undefined) cambiosCuidadora.idiomas = idiomas;
    if (dias_disponibles !== undefined) cambiosCuidadora.dias_disponibles = dias_disponibles;

    if (Object.keys(cambiosCuidadora).length > 0) {
      const { error: e1 } = await supabase
        .from('cuidadoras').update(cambiosCuidadora).eq('id', cuidadoraId);
      if (e1) throw e1;
    }

    // Actualiza perfiles (nombre, teléfono, ciudad, provincia)
    const cambiosPerfil = {};
    if (nombre !== undefined) cambiosPerfil.nombre = nombre;
    if (telefono !== undefined) cambiosPerfil.telefono = telefono;
    if (ciudad !== undefined) cambiosPerfil.ciudad = ciudad;
    if (provincia !== undefined) cambiosPerfil.provincia = provincia;

    if (Object.keys(cambiosPerfil).length > 0) {
      const { error: e2 } = await supabase
        .from('perfiles').update(cambiosPerfil).eq('id', cuidadoraId);
      if (e2) throw e2;
    }

    res.json({ mensaje: 'Perfil actualizado' });
  } catch (err) {
    console.error('actualizarPerfilCuidadora:', err.message);
    res.status(500).json({ error: 'No se pudo actualizar el perfil' });
  }
};

// GET /api/cuidador/:cuidadoraId/oportunidades
exports.obtenerOportunidades = async (req, res) => {
  try {
    const { cuidadoraId } = req.params;
    const { data, error } = await supabase
      .from('solicitudes_conexion')
      .select(`
        id, estado, creado_en,
        familiares!familiar_id ( id, nombre, parentesco, edad, tipos_cuidado, condiciones_especificas, dias_disponibles ),
        empleadoras!empleadora_id ( id, perfiles!inner ( nombre, ciudad ) )
      `)
      .eq('cuidadora_id', cuidadoraId)
      .eq('estado', 'en_gestion')
      .order('creado_en', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('obtenerOportunidades:', err.message);
    res.status(500).json({ error: 'No se pudieron obtener las oportunidades' });
  }
};

// PUT /api/cuidador/oportunidades/:id/responder  body: { respuesta: 'aceptar' | 'rechazar' }
exports.responderOportunidad = async (req, res) => {
  try {
    const { id } = req.params;
    const { respuesta } = req.body;
    if (!['aceptar', 'rechazar'].includes(respuesta)) {
      return res.status(400).json({ error: 'Respuesta inválida' });
    }
    const nuevoEstado = respuesta === 'aceptar' ? 'aceptada_cuidadora' : 'rechazada_cuidadora';

    const { data, error } = await supabase
      .from('solicitudes_conexion')
      .update({ estado: nuevoEstado })
      .eq('id', id)
      .eq('estado', 'en_gestion') // evita responder dos veces
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(409).json({ error: 'La solicitud ya no está en gestión' });

    await notificarAdmins({
      tipo: 'oportunidad',
      titulo: nuevoEstado === 'aceptada_cuidadora' ? 'Cuidadora aceptó una oportunidad' : 'Cuidadora rechazó una oportunidad',
      mensaje: nuevoEstado === 'aceptada_cuidadora' ? 'Una cuidadora aceptó la oportunidad.' : 'Una cuidadora rechazó la oportunidad.',
      solicitud_id: id,
    });
    res.json(data);
  } catch (err) {
    console.error('responderOportunidad:', err.message);
    res.status(500).json({ error: 'No se pudo responder la oportunidad' });
  }
};

// GET /api/cuidador/:cuidadoraId/oportunidades-aceptadas
exports.obtenerOportunidadesAceptadas = async (req, res) => {
  try {
    const { cuidadoraId } = req.params;
    const { data, error } = await supabase
      .from('solicitudes_conexion')
      .select(`
        id, estado, familia_confirmo, cuidadora_confirmo,
        familiares!familiar_id ( id, nombre, edad, tipos_cuidado ),
        empleadoras!empleadora_id ( id, perfiles!inner ( nombre, ciudad ) )
      `)
      .eq('cuidadora_id', cuidadoraId)
      .eq('estado', 'aceptada_cuidadora')
      .order('creado_en', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('obtenerOportunidadesAceptadas:', err.message);
    res.status(500).json({ error: 'No se pudieron obtener las oportunidades' });
  }
};

// PUT /api/cuidador/oportunidades/:id/confirmar
exports.confirmarCuidadora = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('solicitudes_conexion')
      .update({ cuidadora_confirmo: true })
      .eq('id', id)
      .select().single();
    if (error) throw error;

    await notificarAdmins({
      tipo: 'confirmacion',
      titulo: 'Cuidadora confirmó el servicio',
      mensaje: 'Una cuidadora confirmó su parte del servicio.',
      solicitud_id: id,
    });
    res.json(data);
  } catch (err) {
    console.error('confirmarCuidadora:', err.message);
    res.status(500).json({ error: 'No se pudo confirmar' });
  }
};

// GET /api/cuidador/:cuidadoraId/servicios
exports.obtenerServiciosCuidador = async (req, res) => {
  try {
    const { cuidadoraId } = req.params;
    const { data, error } = await supabase
      .from('servicios')
      .select(`
        id, titulo, descripcion, horario, estado, creado_en,
        familiares!familiar_id ( id, nombre, dias_disponibles ),
        empleadoras!empleadora_id ( id, perfiles!inner ( nombre, ciudad, avatar_url ) )
      `)
      .eq('cuidadora_id', cuidadoraId)
      .order('creado_en', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('obtenerServiciosCuidador:', err.message);
    res.status(500).json({ error: 'No se pudieron obtener los servicios' });
  }
};

// GET /api/cuidador/servicio/:id
exports.obtenerServicioCuidadorDetalle = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('servicios')
      .select(`
        id, titulo, descripcion, estado, creado_en,
        familiares!familiar_id ( id, nombre, dias_disponibles ),
        empleadoras!empleadora_id ( id, perfiles!inner ( nombre, ciudad ) )
      `)
      .eq('id', id)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('obtenerServicioCuidadorDetalle:', err.message);
    res.status(500).json({ error: 'No se pudo obtener el servicio' });
  }
};

// GET /api/cuidador/solicitudes/:solicitudId/mensajes
exports.obtenerMensajesCuidador = async (req, res) => {
  try {
    const { solicitudId } = req.params;
    const { data: conv } = await supabase
      .from('conversaciones').select('id').eq('solicitud_id', solicitudId).eq('tipo', 'cuidadora').maybeSingle();
    if (!conv) return res.json([]);
    const { data, error } = await supabase
      .from('mensajes').select('*').eq('conversacion_id', conv.id).order('creado_en', { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('obtenerMensajesCuidador:', err.message);
    res.status(500).json({ error: 'No se pudieron obtener los mensajes' });
  }
};

// POST /api/cuidador/solicitudes/:solicitudId/mensajes  body: { texto }
exports.enviarMensajeCuidador = async (req, res) => {
  try {
    const { solicitudId } = req.params;
    const { texto } = req.body;
    if (!texto) return res.status(400).json({ error: 'Falta el texto' });
    const { data: conv, error: e1 } = await supabase
      .from('conversaciones').select('id').eq('solicitud_id', solicitudId).eq('tipo', 'cuidadora').single();
    if (e1) throw e1;
    const { data, error: e2 } = await supabase
      .from('mensajes').insert({ conversacion_id: conv.id, remitente: 'cuidadora', texto }).select().single();
    if (e2) throw e2;

    await notificarAdmins({
      tipo: 'mensaje',
      titulo: 'Nuevo mensaje de una cuidadora',
      mensaje: texto,
      solicitud_id: solicitudId,
    });
    res.status(201).json(data);
  } catch (err) {
    console.error('enviarMensajeCuidador:', err.message);
    res.status(500).json({ error: 'No se pudo enviar el mensaje' });
  }
};

// GET /api/cuidador/:cuidadoraId/conversaciones
exports.obtenerConversacionesCuidador = async (req, res) => {
  try {
    const { cuidadoraId } = req.params;

    const { data: solicitudes, error: e1 } = await supabase
      .from('solicitudes_conexion')
      .select(`
        id, estado,
        familiares!familiar_id ( nombre ),
        empleadoras!empleadora_id ( id, perfiles!inner ( nombre ) )
      `)
      .eq('cuidadora_id', cuidadoraId);
    if (e1) throw e1;
    if (!solicitudes || solicitudes.length === 0) return res.json([]);

    const solicitudIds = solicitudes.map((s) => s.id);

    const { data: conversaciones, error: e2 } = await supabase
      .from('conversaciones')
      .select('id, solicitud_id')
      .in('solicitud_id', solicitudIds)
      .eq('tipo', 'cuidadora');
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
        familiaNombre: (solicitud.empleadoras?.perfiles?.nombre || 'Familia').trim(),
        ultimoMensaje: ultimoMensaje?.texto || '',
        ultimoMensajeFecha: ultimoMensaje?.creado_en || null,
      };
    });

    resultado.sort((a, b) => new Date(b.ultimoMensajeFecha || 0) - new Date(a.ultimoMensajeFecha || 0));
    res.json(resultado);
  } catch (err) {
    console.error('obtenerConversacionesCuidador:', err.message);
    res.status(500).json({ error: 'No se pudieron obtener las conversaciones' });
  }
};

const PDFDocument = require('pdfkit');

// GET /api/cuidador/:cuidadoraId/cv
exports.generarCV = async (req, res) => {
  try {
    const { cuidadoraId } = req.params;

    const { data: cuidadora, error: e1 } = await supabase
      .from('cuidadoras')
      .select('*')
      .eq('id', cuidadoraId)
      .single();
    if (e1) throw e1;

    const { data: perfil, error: e2 } = await supabase
      .from('perfiles')
      .select('nombre, correo, telefono, ciudad, provincia')
      .eq('id', cuidadoraId)
      .single();
    if (e2) throw e2;

    const doc = new PDFDocument({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="CV-${(perfil.nombre || 'cuidadora').replace(/\s+/g, '_')}.pdf"`);
    doc.pipe(res);

    // Encabezado
    doc.fontSize(22).fillColor('#1a1a4b').text(perfil.nombre || 'Cuidadora', { align: 'left' });
    doc.fontSize(12).fillColor('#555').text('Cuidadora Profesional - Cuida Red');
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#333');
    if (perfil.correo) doc.text(`Correo: ${perfil.correo}`);
    if (perfil.telefono) doc.text(`Teléfono: ${perfil.telefono}`);
    if (perfil.ciudad || perfil.provincia) doc.text(`Ubicación: ${[perfil.ciudad, perfil.provincia].filter(Boolean).join(', ')}`);
    doc.moveDown();

    doc.strokeColor('#cccccc').moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown();

    // Especialidades
    doc.fontSize(14).fillColor('#1a1a4b').text('Especialidades');
    doc.fontSize(11).fillColor('#333');
    doc.text((cuidadora.especialidades || []).join(', ') || 'No especificado');
    doc.moveDown();

    // Biografía
    doc.fontSize(14).fillColor('#1a1a4b').text('Biografía Profesional');
    doc.fontSize(11).fillColor('#333');
    doc.text(cuidadora.descripcion_estilo || 'No especificado', { align: 'justify' });
    doc.moveDown();

    // Disponibilidad
    doc.fontSize(14).fillColor('#1a1a4b').text('Disponibilidad');
    doc.fontSize(11).fillColor('#333');
    doc.text(`Días: ${(cuidadora.dias_disponibles || []).join(', ') || 'No especificado'}`);
    doc.text(`Modalidad: ${(cuidadora.modalidad || []).join(', ') || 'No especificado'}`);
    doc.moveDown();

    // Experiencia
    doc.fontSize(14).fillColor('#1a1a4b').text('Experiencia y Formación');
    doc.fontSize(11).fillColor('#333');
    doc.text(`Años de experiencia: ${cuidadora.años_experiencia || 'No especificado'}`);
    doc.text(`Nivel de formación: ${cuidadora.nivel_formacion || 'No especificado'}`);
    if (cuidadora.tiene_licencia) doc.text('Cuenta con licencia/certificación profesional.');
    doc.moveDown();

    // Calificación
    if (cuidadora.calificacion_promedio) {
      doc.fontSize(14).fillColor('#1a1a4b').text('Calificación Cuida Red');
      doc.fontSize(11).fillColor('#333');
      doc.text(`${cuidadora.calificacion_promedio} / 5`);
    }

    doc.end();
  } catch (err) {
    console.error('generarCV:', err.message);
    res.status(500).json({ error: 'No se pudo generar el CV' });
  }
};

// GET /api/cuidador/:cuidadoraId/resenas
exports.obtenerResenasCuidador = async (req, res) => {
  try {
    const { cuidadoraId } = req.params;
    const { data, error } = await supabase
      .from('resenas')
      .select(`
        id, calificacion, comentario, tag, creado_en,
        empleadoras!empleadora_id ( id, perfiles!inner ( nombre ) )
      `)
      .eq('cuidadora_id', cuidadoraId)
      .order('creado_en', { ascending: false });
    if (error) throw error;

    const promedio = data.length
      ? Math.round((data.reduce((sum, r) => sum + r.calificacion, 0) / data.length) * 10) / 10
      : 0;

    res.json({ resenas: data, promedio, total: data.length });
  } catch (err) {
    console.error('obtenerResenasCuidador:', err.message);
    res.status(500).json({ error: 'No se pudieron obtener las reseñas' });
  }
};

// GET /api/cuidador/:cuidadoraId/puntaje
exports.obtenerPuntaje = async (req, res) => {
  try {
    const { cuidadoraId } = req.params;

    const { data: cuidadora, error: e1 } = await supabase
      .from('cuidadoras')
      .select('nivel_formacion, años_experiencia, especialidades')
      .eq('id', cuidadoraId)
      .single();
    if (e1) throw e1;

    // --- 1. Formación profesional formal (0-25) ---
    const FORMACION_PUNTOS = { ninguna: 0, basicos_externos: 5, tecnico: 15, universitario: 25 };
    const formacion = FORMACION_PUNTOS[cuidadora.nivel_formacion] ?? 0;

    // --- 2. Certificación Cuida Red (0-25), según cursos completados ---
    // Trae todos los cursos activos con sus módulos, y el progreso de la cuidadora
    const { data: cursos, error: e2 } = await supabase
      .from('cursos')
      .select('id, categoria, archivado, modulos(id, archivado)')
      .eq('archivado', false);
    if (e2) throw e2;

    const { data: progreso, error: e3 } = await supabase
      .from('progreso_modulos')
      .select('curso_id, modulo_id')
      .eq('cuidadora_id', cuidadoraId);
    if (e3) throw e3;

    function cursoCompletado(curso) {
      const modulosActivos = (curso.modulos || []).filter((m) => !m.archivado);
      if (modulosActivos.length === 0) return false;
      const completadosDeEsteCurso = (progreso || []).filter((p) => p.curso_id === curso.id);
      return modulosActivos.every((m) => completadosDeEsteCurso.some((p) => p.modulo_id === m.id));
    }

    const elementalCompletado = (cursos || []).some((c) => c.categoria === 'obligatorio' && cursoCompletado(c));
    const cursosExpertosCompletados = (cursos || []).filter((c) => c.categoria === 'opcional' && cursoCompletado(c)).length;

    let certificacion = 0;
    if (elementalCompletado) {
      if (cursosExpertosCompletados >= 3) certificacion = 25;
      else if (cursosExpertosCompletados === 2) certificacion = 20;
      else if (cursosExpertosCompletados === 1) certificacion = 15;
      else certificacion = 10;
    }

    // --- 3. Experiencia profesional (0-25) ---
    const anos = cuidadora.años_experiencia || 0;
    let experiencia = 0;
    if (anos > 10) experiencia = 25;
    else if (anos >= 3) experiencia = 15;
    else if (anos >= 1) experiencia = 10;
    else experiencia = 0;

    // --- 4. Habilidades adicionales (0-25) ---
    const HABILIDADES_ADICIONALES = ['Arte', 'Deportes', 'Estimulación cognitiva', 'Idiomas', 'Tecnología básica'];
    const numHabilidades = (cuidadora.especialidades || []).filter((esp) =>
      HABILIDADES_ADICIONALES.includes(esp)
    ).length;

    let habilidades = 0;
    if (numHabilidades >= 5) habilidades = 25;
    else if (numHabilidades >= 3) habilidades = 15;
    else if (numHabilidades >= 1) habilidades = 5;
    else habilidades = 0;

    const total = formacion + certificacion + experiencia + habilidades;

    res.json({
      total,
      breakdown: [
        { label: 'Formación formal', value: formacion, max: 25 },
        { label: 'Certificación Cuida Red', value: certificacion, max: 25 },
        { label: 'Experiencia', value: experiencia, max: 25 },
        { label: 'Habilidades', value: habilidades, max: 25 },
      ],
    });
  } catch (err) {
    console.error('obtenerPuntaje:', err.message);
    res.status(500).json({ error: 'No se pudo calcular el puntaje' });
  }
};

const COL_DOC = {
  cedula: 'url_cedula',
  migratorio: 'url_certificado_migratorio',
  record_policial: 'url_record_policial',
  titulo: 'url_copia_titulo',
  certificaciones: 'url_certificados',
  cv: 'url_cv',
};

// GET /api/cuidador/:cuidadoraId/documentos
exports.obtenerDocumentos = async (req, res) => {
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

    const resultado = Object.keys(COL_DOC).map((tipo) => {
      const url = cuidadora[COL_DOC[tipo]] || null;
      const rev = (revisiones || []).find((r) => r.tipo === tipo);
      return {
        tipo,
        url,
        filename: url ? decodeURIComponent(url.split('/').pop()) : null,
        estado: rev?.estado || 'pendiente',
        nota: rev?.nota || null,
      };
    });

    res.json(resultado);
  } catch (err) {
    console.error('obtenerDocumentos:', err.message);
    res.status(500).json({ error: 'No se pudieron obtener los documentos' });
  }
};