require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const db = require('./db');
const multer = require('multer');
const { DateTime } = require('luxon');

const horaPeru = DateTime.now()
  .setZone('America/Lima')
  .toFormat("yyyy-MM-dd HH:mm:ss");
const upload = multer({ dest: 'uploads/' });
const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static('uploads'));


app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true
}));

app.get('/', (req, res) => {
  res.render('login');
});

app.post('/login', (req, res) => {
  const { dni, contraseña } = req.body;

  db.query('SELECT * FROM usuario WHERE dni_usuario = ?', [dni], async (err, results) => {
    if (err) throw err;

    if (results.length > 0) {
      const user = results[0];
      const validPassword = contraseña === user.contraseña;

      if (validPassword) {
        req.session.user = user;

        if (user.tipo_usuario === 'administrador') {
          res.redirect('/admin');
        } else if (user.tipo_usuario === 'trabajador') {
          res.redirect('/trabajador');
        } else {
          res.send('Tipo de usuario no reconocido');
        }
      } else {
        res.send('Contraseña incorrecta');
      }
    } else {
      res.send('Usuario no encontrado');
    }
  });
});

app.get('/admin', (req, res) => {
  if (req.session.user?.tipo_usuario === 'administrador') {
    res.render('admin', { user: req.session.user });
  } else {
    res.redirect('/');
  }
});

app.get('/trabajador', (req, res) => {
  if (req.session.user?.tipo_usuario === 'trabajador') {
    res.render('trabajador', { user: req.session.user });
  } else {
    res.redirect('/');
  }
});
app.get('/prestamo', (req, res) => {
  if (req.session.user?.tipo_usuario === 'trabajador') {
    res.render('prestamo', { user: req.session.user });
  } else {
    res.redirect('/');
  }
});

app.post('/registrar-cliente', (req, res) => {
  const { nombre_cliente, dni_cliente, telefono_cliente, direccion_cliente } = req.body;

  db.query(
    'INSERT INTO cliente (nombre_cliente, dni_cliente, telefono_cliente, direccion_cliente) VALUES (?, ?, ?, ?)',
    [nombre_cliente, dni_cliente, telefono_cliente, direccion_cliente],
    (err, result) => {
      if (err) {
        console.error('Error al registrar cliente:', err);
        return res.send('Error al registrar cliente.');
      }

      res.send('Cliente registrado correctamente. <a href="/trabajador1">Registrar otro</a>');
    }
  );
});

app.get('/historial', (req, res) => {
  if (req.session.user?.tipo_usuario === 'trabajador') {
    const idUsuario = req.session.user.id_usuario; // Obtén el ID del usuario en sesión

    db.query(`
      SELECT 
        pago.monto_pagado, 
        pago.fecha_pago, 
        cliente.nombre_cliente, 
        usuario.nombre_usuario AS nombre_trabajador
      FROM pago
      JOIN deuda ON pago.id_deuda = deuda.id_deuda
      JOIN cliente ON deuda.id_cliente = cliente.id_cliente
      JOIN usuario ON pago.id_usuario = usuario.id_usuario
      WHERE pago.id_usuario = ? -- Filtra por el ID del usuario en sesión
      ORDER BY pago.fecha_pago DESC
    `, [idUsuario], (err, resultados) => {
      if (err) {
        console.error('Error al recuperar los pagos:', err);
        return res.status(500).send('Error al recuperar los pagos');
      }
      // Pasa los resultados a la vista
      res.render('historial', { pagos: resultados,DateTime });
    });
  } else {
    res.redirect('/');
  }
});

app.get('/api/cliente', (req, res) => {
  const dni = req.query.dni;

  db.query('SELECT * FROM cliente WHERE dni_cliente = ?', [dni], (err, clienteResults) => {
    if (err) return res.json({ success: false, error: err });

    if (clienteResults.length === 0) {
      return res.json({ success: false, message: 'Cliente no encontrado' });
    }

    const cliente = clienteResults[0];

    db.query('SELECT * FROM deuda WHERE id_cliente = ? AND monto_deuda > 0', [cliente.id_cliente], (err, deudaResults) => {

      if (err) return res.json({ success: false, error: err });

      res.json({ success: true, cliente, deudas: deudaResults });
    });
  });
});

app.post('/registrar-pago', upload.single('comprobante_pago'), (req, res) => {
  const { id_deuda, monto_pagado, metodo_pago, id_usuario } = req.body;
  const comprobante = metodo_pago === 'yape' && req.file ? req.file.filename : 'efectivo';

  db.query('SELECT monto_deuda FROM deuda WHERE id_deuda = ?', [id_deuda], (err, results) => {
    if (err) return res.send('Error al verificar la deuda');

    if (results.length === 0) return res.send('Deuda no encontrada');

    const montoActual = results[0].monto_deuda;

    const monto = parseFloat(monto_pagado);

    if (monto <= 0) {
      return res.send('El monto debe ser mayor a 0');
    }

    if (monto > montoActual) {
      return res.send(`El monto pagado (S/.${monto}) no puede ser mayor a la deuda actual (S/.${montoActual})`);
    }


    db.query('INSERT INTO pago (id_deuda, id_usuario, monto_pagado, fecha_pago, comprobante_pago) VALUES (?, ?, ?, ?, ?)',
      [id_deuda, id_usuario, monto_pagado, horaPeru, comprobante], (err2, result) => {
        if (err2) return res.send('Error al registrar el pago');

        db.query('UPDATE deuda SET monto_deuda = monto_deuda - ? WHERE id_deuda = ?', [monto_pagado, id_deuda], (err3) => {
          if (err3) return res.send('Error al actualizar la deuda');

          // Enviar respuesta exitosa con id_pago para redirigir
          res.send(`OK:${result.insertId}`);
        });
      });
  });
});


app.get('/comprobante', (req, res) => {
  const id_pago = req.query.id_pago;

  db.query(`
    SELECT pago.*, cliente.nombre_cliente, cliente.dni_cliente, deuda.monto_deuda
    FROM pago
    JOIN deuda ON pago.id_deuda = deuda.id_deuda
    JOIN cliente ON deuda.id_cliente = cliente.id_cliente
    WHERE pago.id_pago = ?`,
    [id_pago], (err, results) => {
      if (err) throw err;

      if (results.length === 0) return res.send("Pago no encontrado.");

      const pago = results[0];
      res.render('comprobante', { pago });
    });
});


app.listen(PORT, () => {
  console.log(`Servidor iniciado en http://localhost:${PORT}`);
});
