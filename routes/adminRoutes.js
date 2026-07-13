const express = require('express');
const router = express.Router();
const {
  listarCursos, obtenerCurso, crearCurso, editarCurso, archivarCurso,
  crearModulo, editarModulo, archivarModulo, subirVideo, getDashboardMetrics, listarValidaciones, revisarDocumento,
} = require('../controllers/adminController');
const multer = require('multer');
const { subirDocumento } = require('../controllers/authController');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB, como dice tu UI
});



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
router.post('/upload-video', upload.single('video'), subirVideo);

router.get('/validaciones', listarValidaciones);
router.patch('/validaciones/:cuidadoraId/documento', revisarDocumento);


module.exports = router;


