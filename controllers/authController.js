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

    if (error) return res.status(401).json({ error: 'Correo o contraseña incorrectos' });

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

module.exports = { registro, login, logout };