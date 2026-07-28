const express = require('express');
const router = express.Router();
const {
  obtenerNotificaciones,
  marcarLeida,
  marcarTodasLeidas,
} = require('../controllers/notificacionesController');

router.get('/:usuarioId', obtenerNotificaciones);
router.put('/:id/leida', marcarLeida);
router.put('/marcar-todas/:usuarioId', marcarTodasLeidas);

module.exports = router;