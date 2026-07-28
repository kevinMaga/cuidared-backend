const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// REGISTRO
const registro = async (req, res) => {
  const { correo, password, nombre, rol, telefono } = req.body;

  try {
    // 1. Crear usuario en Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: correo,
      password: password,
    });

    if (authError) return res.status(400).json({ error: authError.message });

    const userId = authData.user.id;

    // 2. Crear perfil en la tabla perfiles
    const { error: perfilError } = await supabase
      .from('perfiles')
      .insert({
        id: userId,
        rol: rol,
        nombre: nombre,
        telefono: telefono,
        correo: correo,
      });

    if (perfilError) return res.status(400).json({ error: perfilError.message });

    // 3. Crear registro en la tabla según el rol
    if (rol === 'cuidadora') {
      await supabase.from('cuidadoras').insert({ id: userId });
    } else if (rol === 'empleadora') {
      await supabase.from('empleadoras').insert({ id: userId });
    }

    res.status(201).json({
      mensaje: 'Usuario registrado correctamente',
      usuario: { id: userId, correo, nombre, rol }
    });

  } catch (error) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// LOGIN
const login = async (req, res) => {
  const { correo, password } = req.body;

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: correo,
      password: password,
    });

    if (error) {
      console.error('Error de login:', error.message, error.status);
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }
    // Obtener perfil con el rol
    const { data: perfil } = await supabase
      .from('perfiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    res.json({
      mensaje: 'Login exitoso',
      token: data.session.access_token,
      usuario: {
        id: data.user.id,
        correo: data.user.email,
        nombre: perfil.nombre,
        rol: perfil.rol,
      }
    });

  } catch (error) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// CERRAR SESIÓN
const logout = async (req, res) => {
  try {
    await supabase.auth.signOut();
    res.json({ mensaje: 'Sesión cerrada correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// COMPLETAR PERFIL DE CUIDADORA
const completarPerfilCuidadora = async (req, res) => {
  const { userId, datos } = req.body;

  try {
    const { error } = await supabase
      .from('cuidadoras')
      .update({
        nivel_formacion: datos.nivel_formacion,
        titulo_academico: datos.titulo_academico,
        certificaciones_adicionales: datos.certificaciones_adicionales,
        años_experiencia: datos.años_experiencia,

        referencia_1_nombre: datos.referencia_1_nombre,
        referencia_1_telefono: datos.referencia_1_telefono,
        referencia_2_nombre: datos.referencia_2_nombre,
        referencia_2_telefono: datos.referencia_2_telefono,
        referencia_3_nombre: datos.referencia_3_nombre,
        referencia_3_telefono: datos.referencia_3_telefono,

        especialidades: datos.especialidades,
        provincia: datos.coverageProvince,
        zonas_cobertura: datos.zonas_cobertura,
        modalidad: datos.modalidad,
        dias_disponibles: datos.dias_disponibles,
        idiomas: datos.idiomas,
        tiene_licencia: datos.tiene_licencia,

        acepto_compromiso_etico: datos.acepto_compromiso_etico,
        acepto_terminos: datos.acepto_terminos,
      })
      .eq('id', userId);

    if (error) return res.status(400).json({ error: error.message });

    // Actualizar provincia y ciudad en perfiles
    await supabase
      .from('perfiles')
      .update({
        provincia: datos.coverageProvince,
        ciudad: datos.coverageCity,
      })
      .eq('id', userId);

    res.json({ mensaje: 'Perfil de cuidadora completado correctamente' });

  } catch (error) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Mapea el tipo de documento a su columna en la tabla cuidadoras
const COLUMNAS_DOC = {
  cedula: 'url_cedula',
  migratorio: 'url_certificado_migratorio',
  record_policial: 'url_record_policial',
  titulo: 'url_copia_titulo',
  certificaciones: 'url_certificados',
  cv: 'url_cv',
};

// POST /api/auth/subir-documento  (multipart: campo "documento")
// body: cuidadoraId, tipo
const subirDocumento = async (req, res) => {
  try {
    const { cuidadoraId, tipo } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No se envió ningún archivo' });
    if (!cuidadoraId) return res.status(400).json({ error: 'Falta cuidadoraId' });

    const columna = COLUMNAS_DOC[tipo];
    if (!columna) return res.status(400).json({ error: 'Tipo de documento no válido' });

    // Nombre único: cada tipo sobrescribe al anterior de esa cuidadora
    const ext = req.file.originalname.split('.').pop();
    const nombreArchivo = `${cuidadoraId}/${tipo}-${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('documentos-cuidadoras')
      .upload(nombreArchivo, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });
    if (upErr) throw upErr;

    const { data: pub } = supabase.storage
      .from('documentos-cuidadoras')
      .getPublicUrl(nombreArchivo);

    // Guarda la URL en la columna que toca
    const { error: updErr } = await supabase
      .from('cuidadoras')
      .update({ [columna]: pub.publicUrl })
      .eq('id', cuidadoraId);
    if (updErr) throw updErr;

    // Al (re)subir un documento, su revisión vuelve a "pendiente"
    // para que el admin lo revise de nuevo.
    await supabase
      .from('revisiones_documentos')
      .upsert(
        { cuidadora_id: cuidadoraId, tipo, estado: 'pendiente', nota: null },
        { onConflict: 'cuidadora_id,tipo' }
      );

    res.status(201).json({ url: pub.publicUrl, nombre: req.file.originalname });
  } catch (err) {
    console.error('subirDocumento:', err.message);
    res.status(500).json({ error: 'No se pudo subir el documento' });
  }
};

// CREAR ADMINISTRADOR (uso interno, protegido por clave secreta)
const crearAdmin = async (req, res) => {
  const { correo, password, nombre, telefono, claveSecreta } = req.body;

  // Protección: solo se puede crear admin con la clave correcta
  if (claveSecreta !== process.env.ADMIN_SECRET_KEY) {
    return res.status(403).json({ error: 'No autorizado para crear administradores' });
  }

  try {
    // 1. Crear usuario en Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: correo,
      password: password,
    });

    if (authError) return res.status(400).json({ error: authError.message });

    const userId = authData.user.id;

    // 2. Crear perfil con rol admin
    const { error: perfilError } = await supabase
      .from('perfiles')
      .insert({
        id: userId,
        rol: 'admin',
        nombre: nombre,
        telefono: telefono,
        correo: correo,
        verificado: true,
      });

    if (perfilError) return res.status(400).json({ error: perfilError.message });

    // 3. Crear registro en tabla admins
    const { error: adminError } = await supabase
      .from('admins')
      .insert({
        id: userId,
        nombre_organizacion: 'CUIDA RED',
        puede_verificar: true,
        puede_moderar_chat: true,
      });

    if (adminError) return res.status(400).json({ error: adminError.message });

    res.status(201).json({
      mensaje: 'Administrador creado correctamente',
      usuario: { id: userId, correo, nombre, rol: 'admin' }
    });

  } catch (error) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
const completarPerfilFamilia = async (req, res) => {
  const { userId, datos } = req.body;

  try {
    // 1. Guardar datos de la empleadora
    const { error: empError } = await supabase
      .from('empleadoras')
      .update({
        tipo_registro: datos.registerType || 'personal',
        cedula: datos.idNumber,
        direccion: datos.address,
        sector: datos.sector,
        composicion_hogar: datos.household,
        nombre_empresa: datos.companyName || null,
        referencia_direccion: datos.addressReference,
        tipo_vivienda: datos.housingType,
        caracteristicas_vivienda: datos.housingDetails,
        tiene_mascotas: datos.hasPets ?? false,
        acepto_terminos: datos.termsAccepted ?? false,
      })
      .eq('id', userId);
    if (empError) return res.status(400).json({ error: empError.message });

    // 2. Actualizar ciudad/provincia en perfiles
    await supabase
      .from('perfiles')
      .update({ ciudad: datos.city, provincia: datos.province })
      .eq('id', userId);

    // 3. Insertar los familiares (uno por cada uno)
    if (Array.isArray(datos.familyMembers) && datos.familyMembers.length > 0) {
      const filas = datos.familyMembers.map((m) => ({
        empleadora_id: userId,
        nombre: m.name,
        parentesco: m.relationship,
        edad: m.age ? parseInt(m.age, 10) : null,
        tipos_cuidado: m.careTypes || [],
      }));
      const { error: famError } = await supabase.from('familiares').insert(filas);
      if (famError) return res.status(400).json({ error: famError.message });
    }

    res.json({ mensaje: 'Perfil de familia completado correctamente' });
  } catch (error) {
    console.error('completarPerfilFamilia:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = { registro, login, logout, completarPerfilCuidadora, crearAdmin, subirDocumento,completarPerfilFamilia };