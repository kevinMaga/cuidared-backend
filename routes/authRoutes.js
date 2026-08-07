const express = require('express');
const router = express.Router();
const {
  registro,
  login,
  logout,
  completarPerfilCuidadora,
  crearAdmin,
  completarPerfilFamilia,
  solicitarRecuperacion,
  verificarCodigoRecuperacion,
  restablecerPassword,
} = require('../controllers/authController');

router.post('/registro', registro);
router.post('/login', login);
router.post('/logout', logout);
router.post('/completar-perfil-cuidadora', completarPerfilCuidadora);
router.post('/crear-admin', crearAdmin);
router.post('/completar-perfil-familia', completarPerfilFamilia);
router.post('/solicitar-recuperacion', solicitarRecuperacion);
router.post('/verificar-codigo', verificarCodigoRecuperacion);
router.post('/restablecer-password', restablecerPassword);

const multer = require('multer');
const { subirDocumento } = require('../controllers/authController');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB, como dice tu UI
});
router.post('/subir-documento', upload.single('documento'), subirDocumento);

module.exports = router;