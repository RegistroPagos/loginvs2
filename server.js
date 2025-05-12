require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

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

app.listen(PORT, () => {
  console.log(`Servidor iniciado en http://localhost:${PORT}`);
});
