const express = require('express');
const router = express.Router();
const { obtenerPerfilFamilia, obtenerConversacionesFamilia, 
    enviarMensajeFamilia, obtenerMensajesFamilia, obtenerServicioFamiliaDetalle, 
    obtenerServiciosFamilia, confirmarFamilia, expresarInteres, 
    obtenerSolicitudesPendientes, buscarCuidadoras, eliminarFamiliar, 
    agregarFamiliar, editarFamiliar, obtenerFamiliar, actualizarPerfilFamilia,
    obtenerResenaServicio, crearResena,
} = require('../controllers/familiaController');

router.get('/:empleadoraId/perfil', obtenerPerfilFamilia);
router.delete('/familiar/:familiarId', eliminarFamiliar);
router.post('/:empleadoraId/familiar', agregarFamiliar);
router.put('/familiar/:familiarId', editarFamiliar);
router.get('/familiar/:familiarId', obtenerFamiliar);
router.put('/:empleadoraId/perfil', actualizarPerfilFamilia);
router.get('/cuidadoras', buscarCuidadoras);
router.post('/interes', expresarInteres);
router.get('/:empleadoraId/solicitudes-pendientes', obtenerSolicitudesPendientes);
router.put('/solicitudes/:id/confirmar', confirmarFamilia);
router.get('/:empleadoraId/servicios', obtenerServiciosFamilia);
router.get('/servicio/:id', obtenerServicioFamiliaDetalle);
router.get('/solicitudes/:solicitudId/mensajes', obtenerMensajesFamilia);
router.post('/solicitudes/:solicitudId/mensajes', enviarMensajeFamilia);
router.get('/:empleadoraId/conversaciones', obtenerConversacionesFamilia);

router.get('/servicio/:id/resena', obtenerResenaServicio);
router.post('/servicio/:id/resena', crearResena);

module.exports = router;