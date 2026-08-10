const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const cuidadorController = require('./routes/cuidadorRoutes');


const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'CuidaRed backend corriendo ✓' });
});

// Callback para magic link de Supabase - redirige a la app Expo
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><title>CuidaRed</title></head>
    <body style="font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f0f4f8">
      <div style="text-align:center">
        <h2 style="color:#1a73e8">CuidaRed</h2>
        <p id="msg">Procesando autenticación...</p>
      </div>
      <script>
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        const type = params.get('type');
        
        if (accessToken) {
          window.location.href = 'cuidaredfrontend://reset-password?accessToken=' + encodeURIComponent(accessToken);
        } else {
          document.getElementById('msg').textContent = 'Error: No se pudo procesar el enlace. Intenta de nuevo.';
          document.getElementById('msg').style.color = 'red';
        }
      </script>
    </body>
    </html>
  `);
});

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/cuidador', cuidadorController);
app.use('/api/familia', require('./routes/familiaRoutes'));
app.use('/api/notificaciones', require('./routes/notificacionesRoutes'));
app.use('/api/avatar', require('./routes/avatarRoutes'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});