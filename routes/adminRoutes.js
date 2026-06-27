const express = require('express');
const router = express.Router();
const {
  listarCursos, obtenerCurso, crearCurso, editarCurso, archivarCurso,
  crearModulo, editarModulo, archivarModulo, getDashboardMetrics
} = require('../controllers/adminController');

router.get('/dashboard-metrics', getDashboardMetrics);
// Cursos
router.get('/cursos', listarCursos);
router.get('/cursos/:id', obtenerCurso);
router.post('/cursos', crearCurso);
router.put('/cursos/:id', editarCurso);
router.patch('/cursos/:id/archivar', archivarCurso);

// Módulos
router.post('/cursos/:cursoId/modulos', crearModulo);
router.put('/modulos/:id', editarModulo);
router.patch('/modulos/:id/archivar', archivarModulo);

module.exports = router;


