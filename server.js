require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});
app.use('/api/', limiter);

// ==================== CONFIGURACIÓN MYSQL ====================
const dbConfig = {
    host: 'tiusr20pl.cuc-carrera-ti.ac.cr',
    port: 3306,
    database: 'MatriculaUNI',
    user: 'matricula_user',
    password: 'XPf^mf0fly1@Q1ey',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 30000
};

let pool = null;

async function connectDB() {
    try {
        pool = mysql.createPool(dbConfig);
        const conn = await pool.getConnection();
        const [rows] = await conn.query('SELECT DATABASE() as db, NOW() as fecha');
        console.log('✅ Conectado a MySQL');
        console.log(`   Base de datos: ${rows[0].db}`);
        conn.release();
    } catch (err) {
        console.error('❌ Error conectando a MySQL:', err.message);
        setTimeout(() => {
            console.log('🔄 Reintentando conexión...');
            connectDB();
        }, 10000);
    }
}

connectDB();

// ==================== MIDDLEWARE ====================
function verificarToken(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Token no proporcionado' });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'unimatricula_secret_2025');
        req.usuario = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido' });
    }
}

function verificarRol(rolesPermitidos) {
    return (req, res, next) => {
        if (!req.usuario) return res.status(401).json({ error: 'No autenticado' });
        if (!rolesPermitidos.includes(req.usuario.rol)) {
            return res.status(403).json({ error: 'Permisos insuficientes' });
        }
        next();
    };
}

// ==================== HEALTH CHECK ====================
app.get('/api/health', async (req, res) => {
    try {
        if (pool) {
            const [rows] = await pool.execute('SELECT NOW() as fecha, DATABASE() as `database`');
            res.json({
                status: 'OK',
                database: 'Conectado',
                fecha: rows[0].fecha,
                nombre_db: rows[0].database
            });
        } else {
            res.status(503).json({ status: 'ERROR', database: 'Desconectado' });
        }
    } catch (error) {
        res.status(500).json({ status: 'ERROR', message: error.message });
    }
});

// ==================== API DE CARRERAS ====================
app.get('/api/carreras', async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' });

        const [rows] = await pool.execute(
            'SELECT id_programa, nombre, codigo FROM ProgramaAcademico ORDER BY nombre'
        );
        res.json(rows);
    } catch (error) {
        console.error('Error en /carreras:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== API DE CURSOS Y PERIODOS ====================
app.get('/api/cursos', async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' });

        const [rows] = await pool.execute(`
            SELECT c.id_curso, c.codigo, c.nombre, c.creditos, c.costo_credito, c.id_programa,
                   p.nombre as programa_nombre
            FROM Curso c
            LEFT JOIN ProgramaAcademico p ON c.id_programa = p.id_programa
            ORDER BY c.codigo
        `);
        res.json(rows);
    } catch (error) {
        console.error('Error en /cursos:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/periodos', async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' });

        const [rows] = await pool.execute(
            'SELECT id_periodo, nombre, anio, fecha_inicio, fecha_fin, activo FROM PeriodoAcademico ORDER BY anio DESC, id_periodo DESC'
        );
        res.json(rows);
    } catch (error) {
        console.error('Error en /periodos:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/cursos', async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' });

        const { codigo, nombre, creditos, costo_credito, horas_semana, id_programa } = req.body;
        if (!codigo || !nombre || !creditos || !costo_credito) {
            return res.status(400).json({ error: 'Campos obligatorios: codigo, nombre, creditos, costo_credito' });
        }

        const [result] = await pool.execute(
            'INSERT INTO Curso (codigo, nombre, creditos, costo_credito, horas_semana, id_programa) VALUES (?, ?, ?, ?, ?, ?)',
            [codigo, nombre, creditos, costo_credito, horas_semana || null, id_programa || null]
        );
        res.json({ success: true, id_curso: result.insertId });
    } catch (error) {
        console.error('Error creando curso:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/periodos', async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' });

        const { nombre, anio, fecha_inicio, fecha_fin } = req.body;
        if (!nombre || !anio || !fecha_inicio || !fecha_fin) {
            return res.status(400).json({ error: 'Todos los campos son obligatorios' });
        }

        const [result] = await pool.execute(
            'INSERT INTO PeriodoAcademico (nombre, anio, fecha_inicio, fecha_fin, activo) VALUES (?, ?, ?, ?, 1)',
            [nombre, anio, fecha_inicio, fecha_fin]
        );
        res.json({ success: true, id_periodo: result.insertId });
    } catch (error) {
        console.error('Error creando periodo:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== API DE AUTENTICACIÓN ====================
app.post('/api/auth/login', async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' });

        const { email, password, role } = req.body;

        const [rows] = await pool.execute(`
            SELECT u.id_usuario, u.nombre, u.correo_institucional, u.estado,
                   r.nombre as rol_nombre, r.id_rol
            FROM Usuario u
            JOIN Rol r ON u.id_rol = r.id_rol
            WHERE u.correo_institucional = ? AND u.estado = 'Activo'
        `, [email]);

        const usuario = rows[0];
        if (!usuario) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const token = jwt.sign(
            { id_usuario: usuario.id_usuario, nombre: usuario.nombre, rol: usuario.rol_nombre, id_rol: usuario.id_rol },
            process.env.JWT_SECRET || 'unimatricula_secret_2025',
            { expiresIn: '8h' }
        );

        res.json({
            success: true,
            token,
            usuario: {
                id_usuario: usuario.id_usuario,
                nombre: usuario.nombre,
                email: usuario.correo_institucional,
                rol: usuario.rol_nombre,
                id_rol: usuario.id_rol
            }
        });
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' });

        const { nombre, email, carnet, password, id_programa, rol } = req.body;
        const rolId = (rol === 'admin') ? 2 : 1;

        const [existing] = await pool.execute(
            'SELECT id_usuario FROM Usuario WHERE correo_institucional = ?',
            [email]
        );
        if (existing.length > 0) {
            return res.status(400).json({ error: 'El correo ya está registrado' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const [insertResult] = await pool.execute(
            "INSERT INTO Usuario (nombre, correo_institucional, contrasena_hash, id_rol, estado) VALUES (?, ?, ?, ?, 'Activo')",
            [nombre, email, hashedPassword, rolId]
        );
        const newUserId = insertResult.insertId;

        if (rolId === 1) {
            await pool.execute(
                "INSERT INTO Estudiante (id_usuario, carnet, estado_academico, id_programa) VALUES (?, ?, 'Activo', ?)",
                [newUserId, carnet || `ADM${newUserId}`, id_programa || null]
            );
        }

        res.json({ success: true, message: 'Usuario registrado exitosamente' });
    } catch (error) {
        console.error('Error en register:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/auth/estudiante', verificarToken, async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' });

        const [rows] = await pool.execute(`
            SELECT e.id_estudiante, e.carnet, e.estado_academico, e.id_programa,
                   IFNULL((
                       SELECT SUM(f.monto) FROM Factura f
                       WHERE f.id_estudiante = e.id_estudiante AND f.estado = 'Pendiente'
                   ), 0) as montoDeuda
            FROM Estudiante e
            WHERE e.id_usuario = ?
        `, [req.usuario.id_usuario]);

        res.json({ success: true, estudiante: rows[0] || null });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== API DE OFERTA ====================
app.get('/api/oferta/secciones', verificarToken, async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' });

        const { periodo_id } = req.query;

        const [rows] = await pool.execute(`
            SELECT s.id_seccion, s.id_curso, s.id_periodo, s.docente, s.aula, s.horario, s.cupo, s.numero_seccion,
                   IFNULL(s.cupo - (
                       SELECT COUNT(*) FROM Matricula m
                       WHERE m.id_seccion = s.id_seccion AND m.estado IN ('Confirmada', 'Pendiente')
                   ), s.cupo) as disponibles,
                   c.codigo, c.nombre as curso_nombre, c.creditos, c.costo_credito,
                   p.nombre as programa_nombre, p.id_programa,
                   pa.nombre as periodo_nombre
            FROM Seccion s
            JOIN Curso c ON s.id_curso = c.id_curso
            JOIN ProgramaAcademico p ON c.id_programa = p.id_programa
            JOIN PeriodoAcademico pa ON s.id_periodo = pa.id_periodo
            WHERE (? IS NULL OR s.id_periodo = ?)
            ORDER BY c.codigo
        `, [periodo_id ? parseInt(periodo_id) : null, periodo_id ? parseInt(periodo_id) : null]);

        res.json(rows);
    } catch (error) {
        console.error('Error en /oferta/secciones:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== API DE MATRÍCULAS ====================
app.get('/api/matriculas/mis-matriculas', verificarToken, async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' });

        const [rows] = await pool.execute(`
            SELECT m.id_matricula, m.id_seccion, m.fecha_matricula, m.estado,
                   c.id_curso, c.codigo, c.nombre as curso_nombre, c.creditos,
                   s.docente, s.aula, s.horario,
                   (c.creditos * c.costo_credito) as monto,
                   pa.nombre as periodo_nombre, pa.anio as periodo_anio
            FROM Matricula m
            JOIN Seccion s ON m.id_seccion = s.id_seccion
            JOIN Curso c ON s.id_curso = c.id_curso
            JOIN PeriodoAcademico pa ON s.id_periodo = pa.id_periodo
            JOIN Estudiante e ON m.id_estudiante = e.id_estudiante
            JOIN Usuario u ON e.id_usuario = u.id_usuario
            WHERE u.id_usuario = ? AND m.estado != 'Cancelada'
            ORDER BY m.fecha_matricula DESC
        `, [req.usuario.id_usuario]);

        res.json(rows);
    } catch (error) {
        console.error('Error en /matriculas/mis-matriculas:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/matriculas', verificarToken, async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' });

        const { id_seccion } = req.body;

        const [estRows] = await pool.execute(
            'SELECT id_estudiante FROM Estudiante WHERE id_usuario = ?',
            [req.usuario.id_usuario]
        );
        if (estRows.length === 0) {
            return res.status(400).json({ error: 'No se encontró información del estudiante' });
        }
        const id_estudiante = estRows[0].id_estudiante;

        const [cupoRows] = await pool.execute(`
            SELECT s.cupo, COUNT(m.id_matricula) as matriculados
            FROM Seccion s
            LEFT JOIN Matricula m ON s.id_seccion = m.id_seccion AND m.estado IN ('Confirmada', 'Pendiente')
            WHERE s.id_seccion = ?
            GROUP BY s.cupo
        `, [id_seccion]);

        if (cupoRows.length > 0) {
            const disponibles = cupoRows[0].cupo - cupoRows[0].matriculados;
            if (disponibles <= 0) {
                return res.status(400).json({ error: 'No hay cupos disponibles' });
            }
        }

        const [yaSeccion] = await pool.execute(`
            SELECT id_matricula FROM Matricula
            WHERE id_estudiante = ? AND id_seccion = ? AND estado IN ('Confirmada', 'Pendiente')
        `, [id_estudiante, id_seccion]);

        if (yaSeccion.length > 0) {
            return res.status(400).json({ error: 'Ya está matriculado en esta sección' });
        }

        const [yaCurso] = await pool.execute(`
            SELECT m.id_matricula
            FROM Matricula m
            JOIN Seccion s  ON m.id_seccion  = s.id_seccion
            JOIN Seccion s2 ON s2.id_seccion = ?
            WHERE m.id_estudiante = ?
              AND s.id_curso    = s2.id_curso
              AND s.id_periodo  = s2.id_periodo
              AND m.estado IN ('Confirmada', 'Pendiente')
        `, [id_seccion, id_estudiante]);

        if (yaCurso.length > 0) {
            return res.status(400).json({ error: 'Ya está matriculado en este curso en el período actual' });
        }

        const [cursoRows] = await pool.execute(`
            SELECT c.id_curso, c.nombre, c.creditos, c.costo_credito
            FROM Seccion s
            JOIN Curso c ON s.id_curso = c.id_curso
            WHERE s.id_seccion = ?
        `, [id_seccion]);

        const monto = cursoRows[0].creditos * cursoRows[0].costo_credito;

        const [insertResult] = await pool.execute(
            "INSERT INTO Matricula (id_estudiante, id_seccion, fecha_matricula, estado) VALUES (?, ?, NOW(), 'Confirmada')",
            [id_estudiante, id_seccion]
        );

        const fechaVencimiento = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        await pool.execute(
            "INSERT INTO Factura (id_estudiante, monto, fecha_emision, fecha_vencimiento, estado) VALUES (?, ?, NOW(), ?, 'Pendiente')",
            [id_estudiante, monto, fechaVencimiento]
        );

        res.json({
            success: true,
            id_matricula: insertResult.insertId,
            message: 'Matrícula registrada exitosamente'
        });
    } catch (error) {
        console.error('Error en /matriculas:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/matriculas/:id', verificarToken, async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' });

        const id_matricula = req.params.id;

        const [checkRows] = await pool.execute(`
            SELECT m.id_matricula, m.id_estudiante, m.estado
            FROM Matricula m
            JOIN Estudiante e ON m.id_estudiante = e.id_estudiante
            WHERE m.id_matricula = ? AND e.id_usuario = ?
        `, [id_matricula, req.usuario.id_usuario]);

        if (checkRows.length === 0) {
            return res.status(404).json({ error: 'Matrícula no encontrada' });
        }

        const [pagadoRows] = await pool.execute(`
            SELECT f.id_factura
            FROM Factura f
            JOIN Matricula m ON f.id_estudiante = m.id_estudiante
            JOIN Pago p ON p.id_factura = f.id_factura
            WHERE m.id_matricula = ?
              AND f.estado = 'Pagada'
              AND p.estado = 'Completado'
            LIMIT 1
        `, [id_matricula]);

        if (pagadoRows.length > 0) {
            return res.status(400).json({ error: 'No se puede cancelar la matrícula porque el curso ya fue pagado' });
        }

        await pool.execute(
            "UPDATE Matricula SET estado = 'Cancelada' WHERE id_matricula = ?",
            [id_matricula]
        );

        await pool.execute(`
            UPDATE Factura f
            JOIN Matricula m ON f.id_estudiante = m.id_estudiante
            SET f.estado = 'Cancelada'
            WHERE m.id_matricula = ?
              AND f.estado = 'Pendiente'
              AND f.id_factura = (
                  SELECT id_factura FROM (
                      SELECT f2.id_factura
                      FROM Factura f2
                      WHERE f2.id_estudiante = m.id_estudiante
                        AND f2.estado = 'Pendiente'
                      ORDER BY f2.fecha_emision DESC
                      LIMIT 1
                  ) AS sub
              )
        `, [id_matricula]);

        res.json({ success: true, message: 'Matrícula cancelada' });
    } catch (error) {
        console.error('Error eliminando matrícula:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== API DE PAGOS ====================
app.get('/api/pagos/mis-facturas', verificarToken, async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' });

        const [rows] = await pool.execute(`
            SELECT f.id_factura, f.monto, f.fecha_emision, f.fecha_vencimiento, f.estado,
                   'Matrícula' as concepto
            FROM Factura f
            JOIN Estudiante e ON f.id_estudiante = e.id_estudiante
            JOIN Usuario u ON e.id_usuario = u.id_usuario
            WHERE u.id_usuario = ?
            ORDER BY f.fecha_vencimiento ASC
        `, [req.usuario.id_usuario]);

        res.json(rows);
    } catch (error) {
        console.error('Error en /pagos/mis-facturas:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/pagos/procesar', verificarToken, async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' });

        const { id_factura, metodo_pago, referencia } = req.body;

        const [factRows] = await pool.execute(
            "SELECT monto, id_estudiante FROM Factura WHERE id_factura = ? AND estado = 'Pendiente'",
            [id_factura]
        );
        if (factRows.length === 0) {
            return res.status(400).json({ error: 'Factura no encontrada o ya pagada' });
        }

        const { monto, id_estudiante } = factRows[0];

        await pool.execute(
            "INSERT INTO Pago (id_factura, monto, fecha_pago, metodo_pago, referencia, estado) VALUES (?, ?, NOW(), ?, ?, 'Completado')",
            [id_factura, monto, metodo_pago, referencia || 'N/A']
        );

        await pool.execute(
            "UPDATE Factura SET estado = 'Pagada', fecha_pago = NOW() WHERE id_factura = ?",
            [id_factura]
        );

        res.json({ success: true, message: 'Pago procesado exitosamente' });
    } catch (error) {
        console.error('Error en /pagos/procesar:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== API DE ADMIN ====================
app.get('/api/admin/usuarios', verificarToken, verificarRol(['Administrador']), async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' });

        const [rows] = await pool.execute(`
            SELECT u.id_usuario, u.nombre, u.correo_institucional, u.estado, u.fecha_registro,
                   r.nombre as rol_nombre, r.id_rol,
                   e.carnet, e.estado_academico, e.id_programa,
                   p.nombre as programa_nombre
            FROM Usuario u
            JOIN Rol r ON u.id_rol = r.id_rol
            LEFT JOIN Estudiante e ON u.id_usuario = e.id_usuario
            LEFT JOIN ProgramaAcademico p ON e.id_programa = p.id_programa
            ORDER BY u.id_usuario
        `);

        res.json(rows);
    } catch (error) {
        console.error('Error en /admin/usuarios:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/matriculas', verificarToken, verificarRol(['Administrador']), async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' });

        const [rows] = await pool.execute(`
            SELECT m.id_matricula, m.fecha_matricula, m.estado,
                   u.nombre as estudiante_nombre, u.correo_institucional,
                   e.carnet,
                   c.nombre as curso_nombre, c.codigo, c.creditos,
                   s.docente, s.aula, s.horario,
                   (c.creditos * c.costo_credito) as monto,
                   pa.nombre as periodo_nombre, pa.anio as periodo_anio
            FROM Matricula m
            JOIN Estudiante e ON m.id_estudiante = e.id_estudiante
            JOIN Usuario u ON e.id_usuario = u.id_usuario
            JOIN Seccion s ON m.id_seccion = s.id_seccion
            JOIN Curso c ON s.id_curso = c.id_curso
            JOIN PeriodoAcademico pa ON s.id_periodo = pa.id_periodo
            WHERE m.estado != 'Cancelada'
            ORDER BY m.fecha_matricula DESC
        `);

        res.json(rows);
    } catch (error) {
        console.error('Error en /admin/matriculas:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/facturas', verificarToken, verificarRol(['Administrador']), async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' });

        const [rows] = await pool.execute(`
            SELECT f.id_factura, f.monto, f.fecha_emision, f.fecha_vencimiento, f.fecha_pago, f.estado,
                   u.nombre as estudiante_nombre, u.correo_institucional, e.carnet
            FROM Factura f
            JOIN Estudiante e ON f.id_estudiante = e.id_estudiante
            JOIN Usuario u ON e.id_usuario = u.id_usuario
            ORDER BY f.fecha_emision DESC
        `);

        res.json(rows);
    } catch (error) {
        console.error('Error en /admin/facturas:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/matriculas', verificarToken, verificarRol(['Administrador']), async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' });

        const { id_estudiante, id_seccion } = req.body;

        const [cupoRows] = await pool.execute(`
            SELECT s.cupo, COUNT(m.id_matricula) as matriculados
            FROM Seccion s
            LEFT JOIN Matricula m ON s.id_seccion = m.id_seccion AND m.estado IN ('Confirmada', 'Pendiente')
            WHERE s.id_seccion = ?
            GROUP BY s.cupo
        `, [id_seccion]);

        if (cupoRows.length > 0) {
            const disponibles = cupoRows[0].cupo - cupoRows[0].matriculados;
            if (disponibles <= 0) {
                return res.status(400).json({ error: 'No hay cupos disponibles' });
            }
        }

        const [cursoRows] = await pool.execute(`
            SELECT c.creditos, c.costo_credito
            FROM Seccion s
            JOIN Curso c ON s.id_curso = c.id_curso
            WHERE s.id_seccion = ?
        `, [id_seccion]);

        const monto = cursoRows[0].creditos * cursoRows[0].costo_credito;

        const [insertResult] = await pool.execute(
            "INSERT INTO Matricula (id_estudiante, id_seccion, fecha_matricula, estado) VALUES (?, ?, NOW(), 'Confirmada')",
            [id_estudiante, id_seccion]
        );

        const fechaVencimiento = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        await pool.execute(
            "INSERT INTO Factura (id_estudiante, monto, fecha_emision, fecha_vencimiento, estado) VALUES (?, ?, NOW(), ?, 'Pendiente')",
            [id_estudiante, monto, fechaVencimiento]
        );

        res.json({ success: true, id_matricula: insertResult.insertId });
    } catch (error) {
        console.error('Error en /admin/matriculas POST:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/secciones', verificarToken, verificarRol(['Administrador']), async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' });

        const { id_curso, id_periodo, numero_seccion, docente, aula, horario, cupo } = req.body;

        const [result] = await pool.execute(
            'INSERT INTO Seccion (id_curso, id_periodo, numero_seccion, docente, aula, horario, cupo) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [id_curso, id_periodo, numero_seccion, docente, aula, horario, cupo]
        );

        res.json({ success: true, id_seccion: result.insertId });
    } catch (error) {
        console.error('Error creando sección:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/secciones/:id', verificarToken, verificarRol(['Administrador']), async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' });

        const id_seccion = req.params.id;
        const { docente, aula, horario, cupo } = req.body;

        await pool.execute(
            'UPDATE Seccion SET docente=?, aula=?, horario=?, cupo=? WHERE id_seccion=?',
            [docente, aula, horario, cupo, id_seccion]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Error actualizando sección:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/secciones/:id', verificarToken, verificarRol(['Administrador']), async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' });

        const id_seccion = req.params.id;

        const [checkRows] = await pool.execute(
            'SELECT COUNT(*) as total FROM Matricula WHERE id_seccion = ?',
            [id_seccion]
        );
        if (checkRows[0].total > 0) {
            return res.status(400).json({ error: 'No se puede eliminar una sección con matrículas' });
        }

        await pool.execute('DELETE FROM Seccion WHERE id_seccion = ?', [id_seccion]);

        res.json({ success: true });
    } catch (error) {
        console.error('Error eliminando sección:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/usuarios/:id/rol', verificarToken, verificarRol(['Administrador']), async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' });

        const id_usuario = req.params.id;
        const { rol } = req.body;
        const rolId = rol === 'admin' ? 2 : 1;

        await pool.execute(
            'UPDATE Usuario SET id_rol = ? WHERE id_usuario = ?',
            [rolId, id_usuario]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Error cambiando rol:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/usuarios/:id', verificarToken, verificarRol(['Administrador']), async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' });

        const id_usuario = req.params.id;

        const [estRows] = await pool.execute(
            'SELECT id_estudiante FROM Estudiante WHERE id_usuario = ?',
            [id_usuario]
        );

        if (estRows.length > 0) {
            const id_estudiante = estRows[0].id_estudiante;

            const [matRows] = await pool.execute(
                "SELECT COUNT(*) as total FROM Matricula WHERE id_estudiante = ? AND estado != 'Cancelada'",
                [id_estudiante]
            );
            if (matRows[0].total > 0) {
                return res.status(400).json({ error: 'No se puede eliminar un usuario con matrículas activas' });
            }

            await pool.execute('DELETE FROM Matricula WHERE id_estudiante = ?', [id_estudiante]);
            await pool.execute('DELETE FROM Factura WHERE id_estudiante = ?', [id_estudiante]);
            await pool.execute('DELETE FROM Estudiante WHERE id_estudiante = ?', [id_estudiante]);
        }

        await pool.execute('DELETE FROM Usuario WHERE id_usuario = ?', [id_usuario]);

        res.json({ success: true });
    } catch (error) {
        console.error('Error eliminando usuario:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== API DE REPORTES ====================
app.get('/api/reportes/matriculas', verificarToken, verificarRol(['Administrador']), async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' });

        const [rows] = await pool.execute(`
            SELECT pa.nombre as periodo, pa.anio,
                   COUNT(m.id_matricula) as total_matriculas,
                   COUNT(DISTINCT m.id_estudiante) as total_estudiantes
            FROM Matricula m
            JOIN Seccion s ON m.id_seccion = s.id_seccion
            JOIN PeriodoAcademico pa ON s.id_periodo = pa.id_periodo
            WHERE m.estado != 'Cancelada'
            GROUP BY pa.nombre, pa.anio, pa.id_periodo
            ORDER BY pa.id_periodo DESC
        `);

        res.json(rows);
    } catch (error) {
        console.error('Error en /reportes/matriculas:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/reportes/financieros', verificarToken, verificarRol(['Administrador']), async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' });

        const [rows] = await pool.execute(`
            SELECT
                IFNULL(SUM(CASE WHEN f.estado = 'Pagada' THEN f.monto ELSE 0 END), 0) as total_pagado,
                IFNULL(SUM(CASE WHEN f.estado = 'Pendiente' THEN f.monto ELSE 0 END), 0) as total_pendiente,
                COUNT(CASE WHEN f.estado = 'Pagada' THEN 1 END) as facturas_pagadas,
                COUNT(CASE WHEN f.estado = 'Pendiente' THEN 1 END) as facturas_pendientes
            FROM Factura f
        `);

        res.json(rows[0]);
    } catch (error) {
        console.error('Error en /reportes/financieros:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== INICIAR SERVIDOR ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🚀 Servidor API corriendo en http://localhost:${PORT}`);
    console.log(`📋 Endpoints disponibles:`);
    console.log(`   GET    /api/health`);
    console.log(`   GET    /api/carreras`);
    console.log(`   POST   /api/auth/login`);
    console.log(`   POST   /api/auth/register`);
    console.log(`   GET    /api/auth/estudiante`);
    console.log(`   GET    /api/oferta/secciones`);
    console.log(`   GET    /api/matriculas/mis-matriculas`);
    console.log(`   POST   /api/matriculas`);
    console.log(`   DELETE /api/matriculas/:id`);
    console.log(`   GET    /api/pagos/mis-facturas`);
    console.log(`   POST   /api/pagos/procesar`);
    console.log(`   GET    /api/admin/usuarios`);
    console.log(`   GET    /api/admin/matriculas`);
    console.log(`   GET    /api/admin/facturas`);
    console.log(`   POST   /api/admin/matriculas`);
    console.log(`   POST   /api/admin/secciones`);
    console.log(`   PUT    /api/admin/secciones/:id`);
    console.log(`   DELETE /api/admin/secciones/:id`);
    console.log(`   PUT    /api/admin/usuarios/:id/rol`);
    console.log(`   DELETE /api/admin/usuarios/:id`);
    console.log(`   GET    /api/reportes/matriculas`);
    console.log(`   GET    /api/reportes/financieros`);
});

process.on('SIGINT', async () => {
    console.log('\n🛑 Cerrando servidor...');
    if (pool) {
        await pool.end();
        console.log('✅ Conexión a BD cerrada');
    }
    process.exit(0);
});