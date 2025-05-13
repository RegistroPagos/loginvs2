require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const db = require('./db');
const multer = require('multer');
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

app.get('/api/cliente', (req, res) => {
  const dni = req.query.dni;

  db.query('SELECT * FROM cliente WHERE dni_cliente = ?', [dni], (err, clienteResults) => {
    if (err) return res.json({ success: false, error: err });

    if (clienteResults.length === 0) {
      return res.json({ success: false, message: 'Cliente no encontrado' });
    }

    const cliente = clienteResults[0];

    db.query('SELECT * FROM deuda WHERE id_cliente = ?', [cliente.id_cliente], (err, deudaResults) => {
      if (err) return res.json({ success: false, error: err });

      res.json({ success: true, cliente, deudas: deudaResults });
    });
  });
});

app.post('/registrar-pago', upload.single('comprobante_pago'), (req, res) => {
  const { id_deuda, monto_pagado, metodo_pago, id_usuario } = req.body;
  const comprobante = metodo_pago === 'yape' && req.file ? req.file.filename : 'efectivo';

  db.query('INSERT INTO pago (id_deuda, id_usuario, monto_pagado, comprobante_pago) VALUES (?, ?, ?, ?)',
    [id_deuda, id_usuario, monto_pagado, comprobante], (err, result) => {
      if (err) throw err;

      // luego actualiza la deuda
      db.query('UPDATE deuda SET monto_deuda = monto_deuda - ? WHERE id_deuda = ?', [monto_pagado, id_deuda], (err2) => {
        if (err2) throw err2;

        // redirigir a comprobante
        res.redirect(`/comprobante?id_pago=${result.insertId}`);
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
