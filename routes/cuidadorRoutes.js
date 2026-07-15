const express = require('express');
const router = express.Router();
const { marcarModuloCompletado, obtenerProgreso } = require('../controllers/cuidadorController');

router.post('/progreso', marcarModuloCompletado);
router.get('/:cuidadoraId/progreso', obtenerProgreso);

module.exports = router;