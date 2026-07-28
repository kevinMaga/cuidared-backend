const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// POST /api/avatar/generar-preview  (multipart, campo "foto")
// body adicional: estilo, prompt
exports.generarAvatarPreview = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se envió ninguna foto' });
    const { estilo, prompt } = req.body;

    const estiloPrompts = {
      clinico: 'estilo profesional clínico, colores azules suaves, uniforme médico',
      calido: 'estilo cálido y amigable, colores pastel, ambiente acogedor',
      activo: 'estilo dinámico y enérgico, colores vivos, actitud activa',
    };
    const estiloTexto = estiloPrompts[estilo] || estiloPrompts.calido;

    const promptFinal = `Convierte esta foto en un avatar de perfil estilo caricatura/animado 3D amigable y profesional. Mantén el género, tono de piel y rasgos generales de la persona. ${estiloTexto}. ${prompt || ''}. Fondo simple y neutro, estilo ilustración digital moderna, sin texto.`;

    const imageFile = await OpenAI.toFile(req.file.buffer, req.file.originalname || 'foto.jpg', {
      type: req.file.mimetype || 'image/jpeg',
    });

    const result = await openai.images.edit({
      model: 'gpt-image-1',
      image: imageFile,
      prompt: promptFinal,
      size: '1024x1024',
    });

    const imageBase64 = result.data[0].b64_json;
    res.json({ imageBase64 });
  } catch (err) {
    console.error('generarAvatarPreview:', err.message);
    res.status(500).json({ error: 'No se pudo generar el avatar' });
  }
};

// POST /api/avatar/guardar  body: { usuarioId, imageBase64 }
exports.guardarAvatar = async (req, res) => {
  try {
    const { usuarioId, imageBase64 } = req.body;
    if (!usuarioId || !imageBase64) return res.status(400).json({ error: 'Faltan datos' });

    const buffer = Buffer.from(imageBase64, 'base64');
    const nombreArchivo = `avatar-${usuarioId}-${Date.now()}.png`;

    const { error: eUpload } = await supabase.storage
      .from('avatares')
      .upload(nombreArchivo, buffer, { contentType: 'image/png', upsert: true });
    if (eUpload) throw eUpload;

    const { data: pub } = supabase.storage.from('avatares').getPublicUrl(nombreArchivo);

    const { error: eUpdate } = await supabase
      .from('perfiles')
      .update({ avatar_url: pub.publicUrl })
      .eq('id', usuarioId);
    if (eUpdate) throw eUpdate;

    res.json({ avatarUrl: pub.publicUrl });
  } catch (err) {
    console.error('guardarAvatar:', err.message);
    res.status(500).json({ error: 'No se pudo guardar el avatar' });
  }
};