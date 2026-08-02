const express = require('express');
const router = express.Router();
const {
  marcarModuloCompletado,
  obtenerProgreso,
  obtenerPerfilCuidadora,
  actualizarPerfilCuidadora,
  obtenerOportunidades,
  responderOportunidad,
  obtenerOportunidadesAceptadas,
  confirmarCuidadora,
  obtenerServiciosCuidador,
  obtenerServicioCuidadorDetalle,
  obtenerMensajesCuidador,
  enviarMensajeCuidador,
  obtenerConversacionesCuidador,
  generarCV, obtenerResenasCuidador,
  obtenerPuntaje, obtenerDocumentos,
} = require('../controllers/cuidadorController');

router.post('/progreso', marcarModuloCompletado);
router.get('/:cuidadoraId/progreso', obtenerProgreso);
router.get('/:cuidadoraId/perfil', obtenerPerfilCuidadora);
router.put('/:cuidadoraId/perfil', actualizarPerfilCuidadora);
router.get('/:cuidadoraId/oportunidades', obtenerOportunidades);
router.put('/oportunidades/:id/responder', responderOportunidad);
router.get('/:cuidadoraId/oportunidades-aceptadas', obtenerOportunidadesAceptadas);
router.put('/oportunidades/:id/confirmar', confirmarCuidadora);
router.get('/:cuidadoraId/servicios', obtenerServiciosCuidador);
router.get('/servicio/:id', obtenerServicioCuidadorDetalle);
router.get('/solicitudes/:solicitudId/mensajes', obtenerMensajesCuidador);
router.post('/solicitudes/:solicitudId/mensajes', enviarMensajeCuidador);
router.get('/:cuidadoraId/conversaciones', obtenerConversacionesCuidador);
router.get('/:cuidadoraId/cv', generarCV);
router.get('/:cuidadoraId/resenas', obtenerResenasCuidador);
router.get('/:cuidadoraId/puntaje', obtenerPuntaje);
router.get('/:cuidadoraId/documentos', obtenerDocumentos);

module.exports = router;