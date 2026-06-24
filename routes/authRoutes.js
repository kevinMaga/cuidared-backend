const express = require('express');
const router = express.Router();
const { registro, login, logout, completarPerfilCuidadora, crearAdmin } = require('../controllers/authController');

router.post('/registro', registro);
router.post('/login', login);
router.post('/logout', logout);
router.post('/completar-perfil-cuidadora', completarPerfilCuidadora);
router.post('/crear-admin', crearAdmin);

module.exports = router;