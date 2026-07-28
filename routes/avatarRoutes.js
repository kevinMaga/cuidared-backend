const express = require('express');
const router = express.Router();
const multer = require('multer');
const { generarAvatarPreview, guardarAvatar } = require('../controllers/avatarController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

router.post('/generar-preview', upload.single('foto'), generarAvatarPreview);
router.post('/guardar', guardarAvatar);

module.exports = router;