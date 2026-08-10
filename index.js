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
  const siteUrl = process.env.SITE_URL || 'https://cuidared-backend-production.up.railway.app';
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>CuidaRed - Restablecer contraseña</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: system-ui, -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f0f4f8; padding: 20px; }
        .card { background: #fff; border-radius: 16px; padding: 36px 28px; max-width: 420px; width: 100%; box-shadow: 0 4px 24px rgba(0,0,0,0.08); text-align: center; }
        h2 { color: #1a73e8; margin-bottom: 6px; font-size: 24px; }
        .subtitle { color: #666; font-size: 14px; margin-bottom: 24px; }
        .btn { display: inline-block; padding: 14px 28px; background: #1a73e8; color: #fff; text-decoration: none; border-radius: 10px; font-size: 16px; font-weight: 600; border: none; cursor: pointer; width: 100%; }
        .btn:hover { background: #1557b0; }
        .btn-outline { background: transparent; color: #1a73e8; border: 2px solid #1a73e8; }
        .btn-outline:hover { background: #f0f7ff; }
        .divider { display: flex; align-items: center; gap: 12px; margin: 24px 0; color: #aaa; font-size: 13px; }
        .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: #e0e0e0; }
        .form-group { text-align: left; margin-bottom: 14px; }
        .form-group label { display: block; font-size: 13px; color: #555; margin-bottom: 4px; font-weight: 600; }
        .form-group input { width: 100%; padding: 12px 14px; border: 1.5px solid #ddd; border-radius: 10px; font-size: 15px; outline: none; transition: border 0.2s; }
        .form-group input:focus { border-color: #1a73e8; }
        .error { color: #e53935; font-size: 13px; margin-top: 8px; text-align: left; }
        .success { color: #2e7d32; font-size: 14px; margin-top: 16px; }
        .hidden { display: none; }
        .pw-reqs { text-align: left; margin-top: 8px; font-size: 12px; color: #888; }
        .pw-reqs .met { color: #2e7d32; }
        .pw-reqs .unmet { color: #e53935; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>CuidaRed</h2>
        <p class="subtitle" id="status">Verificando enlace...</p>

        <div id="appSection" class="hidden">
          <a id="appLink" href="#" class="btn">Abrir en la app</a>
          <div class="divider"><span>o restablece aquí</span></div>
        </div>

        <form id="webForm" class="hidden" onsubmit="return handleReset(event)">
          <div class="form-group">
            <label for="password">Nueva contraseña</label>
            <input type="password" id="password" placeholder="Mínimo 8 caracteres" autocomplete="new-password" oninput="checkPwReqs()">
          </div>
          <div class="pw-reqs" id="pwReqs">
            <div id="reqLen" class="unmet">• Mínimo 8 caracteres</div>
            <div id="reqUpper" class="unmet">• Una letra mayúscula</div>
            <div id="reqNum" class="unmet">• Un número</div>
            <div id="reqSpecial" class="unmet">• Un carácter especial</div>
          </div>
          <div class="form-group" style="margin-top:14px">
            <label for="confirm">Confirmar contraseña</label>
            <input type="password" id="confirm" placeholder="Repite la contraseña" autocomplete="new-password">
          </div>
          <div id="formError" class="error hidden"></div>
          <div id="formSuccess" class="success hidden"></div>
          <button type="submit" id="submitBtn" class="btn" style="margin-top:8px">Restablecer contraseña</button>
        </form>

        <div id="errorSection" class="hidden">
          <p style="color:#e53935;font-size:14px;margin-top:16px">El enlace no es válido o ya fue utilizado. Solicita uno nuevo desde la app.</p>
        </div>
      </div>

      <script>
        var BACKEND_URL = '${siteUrl}';
        var accessToken = null;

        (function() {
          var hash = window.location.hash.substring(1);
          var params = new URLSearchParams(hash);
          accessToken = params.get('access_token');

          if (accessToken) {
            document.getElementById('status').textContent = 'Elige cómo restablecer tu contraseña:';
            document.getElementById('appSection').classList.remove('hidden');
            document.getElementById('webForm').classList.remove('hidden');
            document.getElementById('appLink').href = 'cuidaredfrontend://reset-password?accessToken=' + encodeURIComponent(accessToken);
            document.getElementById('appLink').addEventListener('click', function() {
              setTimeout(function() {
                document.getElementById('status').textContent = 'Si la app no se abrió, usa el formulario de abajo.';
              }, 2000);
            });
          } else {
            document.getElementById('status').textContent = 'Error: El enlace no es válido.';
            document.getElementById('status').style.color = '#e53935';
            document.getElementById('errorSection').classList.remove('hidden');
          }
        })();

        function checkPwReqs() {
          var pw = document.getElementById('password').value;
          document.getElementById('reqLen').className = pw.length >= 8 ? 'met' : 'unmet';
          document.getElementById('reqUpper').className = /[A-Z]/.test(pw) ? 'met' : 'unmet';
          document.getElementById('reqNum').className = /\\d/.test(pw) ? 'met' : 'unmet';
          document.getElementById('reqSpecial').className = /[^A-Za-z0-9]/.test(pw) ? 'met' : 'unmet';
        }

        function handleReset(e) {
          e.preventDefault();
          var pw = document.getElementById('password').value;
          var confirm = document.getElementById('confirm').value;
          var errEl = document.getElementById('formError');
          var okEl = document.getElementById('formSuccess');
          var btn = document.getElementById('submitBtn');

          errEl.classList.add('hidden');
          okEl.classList.add('hidden');

          if (pw.length < 8) { errEl.textContent = 'La contraseña debe tener al menos 8 caracteres.'; errEl.classList.remove('hidden'); return false; }
          if (!/[A-Z]/.test(pw)) { errEl.textContent = 'Debe contener al menos una mayúscula.'; errEl.classList.remove('hidden'); return false; }
          if (!/\\d/.test(pw)) { errEl.textContent = 'Debe contener al menos un número.'; errEl.classList.remove('hidden'); return false; }
          if (!/[^A-Za-z0-9]/.test(pw)) { errEl.textContent = 'Debe contener al menos un carácter especial.'; errEl.classList.remove('hidden'); return false; }
          if (pw !== confirm) { errEl.textContent = 'Las contraseñas no coinciden.'; errEl.classList.remove('hidden'); return false; }

          btn.textContent = 'Procesando...';
          btn.disabled = true;

          fetch(BACKEND_URL + '/api/auth/restablecer-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken: accessToken, nuevaPassword: pw })
          })
          .then(function(r) { return r.json(); })
          .then(function(data) {
            if (data.mensaje) {
              document.getElementById('webForm').classList.add('hidden');
              document.getElementById('status').textContent = 'Contraseña restablecida correctamente.';
              document.getElementById('status').style.color = '#2e7d32';
              okEl.textContent = 'Ya puedes iniciar sesión con tu nueva contraseña desde la app.';
              okEl.classList.remove('hidden');
            } else {
              errEl.textContent = data.error || 'No se pudo restablecer la contraseña.';
              errEl.classList.remove('hidden');
              btn.textContent = 'Restablecer contraseña';
              btn.disabled = false;
            }
          })
          .catch(function() {
            errEl.textContent = 'Error de conexión. Intenta de nuevo.';
            errEl.classList.remove('hidden');
            btn.textContent = 'Restablecer contraseña';
            btn.disabled = false;
          });

          return false;
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