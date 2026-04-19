require('dotenv').config();
const express = require('express');
const sql = require('mssql');
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

// ==================== CONFIGURACIÓN SQL SERVER ====================
const dbConfig = {
    server: 'localhost',
    port: 1433,
    database: 'MatriculaUNI',
    user: 'sa',
    password: '1234',
    options: {
        trustServerCertificate: true,
        enableArithAbort: true,
        encrypt: false,
        connectTimeout: 30000,
        requestTimeout: 30000
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

let pool = null;
let reconnectInterval = null;

async function connectDB() {
    try {
        if (pool) {
            try {
                await pool.close();
            } catch(e) {}
        }
        
        console.log('Conectando a SQL Server...');
        console.log(`Servidor: ${dbConfig.server}:${dbConfig.port}`);
        console.log(`Base de datos: ${dbConfig.database}`);
        
        pool = await sql.connect(dbConfig);
        
        const result = await pool.request().query('SELECT @@SERVERNAME as servidor, GETDATE() as fecha, DB_NAME() as db');
        console.log('✅ Conectado a SQL Server');
        console.log(`   Servidor: ${result.recordset[0].servidor}`);
        console.log(`   Base de datos: ${result.recordset[0].db}`);
        
        if (reconnectInterval) {
            clearInterval(reconnectInterval);
            reconnectInterval = null;
        }
        
        return pool;
    } catch (err) {
        console.error('❌ Error conectando a SQL Server:', err.message);
        
        if (!reconnectInterval) {
            reconnectInterval = setInterval(() => {
                console.log('🔄 Reintentando conexión...');
                connectDB();
            }, 10000);
        }
        return null;
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
            const result = await pool.request().query('SELECT GETDATE() as fecha, DB_NAME() as database');
            res.json({ 
                status: 'OK', 
                database: 'Conectado',
                fecha: result.recordset[0].fecha,
                nombre_db: result.recordset[0].database
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
        if (!pool) {
            return res.status(503).json({ error: 'Base de datos no disponible' });
        }
        
        const result = await pool.request()
            .query('SELECT id_programa, nombre, codigo FROM ProgramaAcademico ORDER BY nombre');
        
        res.json(result.recordset);
    } catch (error) {
        console.error('Error en /carreras:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== API DE CURSOS Y PERIODOS ====================
app.get('/api/cursos', async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' });
        const result = await pool.request()
            .query(`
                SELECT c.id_curso, c.codigo, c.nombre, c.creditos, c.costo_credito, c.id_programa,
                       p.nombre as programa_nombre
                FROM Curso c
                LEFT JOIN ProgramaAcademico p ON c.id_programa = p.id_programa
                ORDER BY c.codigo
            `);
        res.json(result.recordset);
    } catch (error) {
        console.error('Error en /cursos:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/periodos', async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' });
        const result = await pool.request()
            .query('SELECT id_periodo, nombre, anio, fecha_inicio, fecha_fin, activo FROM PeriodoAcademico ORDER BY anio DESC, id_periodo DESC');
        res.json(result.recordset);
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
        const result = await pool.request()
            .input('codigo', sql.NVarChar, codigo)
            .input('nombre', sql.NVarChar, nombre)
            .input('creditos', sql.Int, creditos)
            .input('costo_credito', sql.Decimal(10,2), costo_credito)
            .input('horas_semana', sql.Int, horas_semana || null)
            .input('id_programa', sql.Int, id_programa || null)
            .query(`
                INSERT INTO Curso (codigo, nombre, creditos, costo_credito, horas_semana, id_programa)
                VALUES (@codigo, @nombre, @creditos, @costo_credito, @horas_semana, @id_programa);
                SELECT SCOPE_IDENTITY() as id_curso;
            `);
        res.json({ success: true, id_curso: result.recordset[0].id_curso });
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
        const result = await pool.request()
            .input('nombre', sql.NVarChar, nombre)
            .input('anio', sql.Int, anio)
            .input('fecha_inicio', sql.Date, fecha_inicio)
            .input('fecha_fin', sql.Date, fecha_fin)
            .query(`
                INSERT INTO PeriodoAcademico (nombre, anio, fecha_inicio, fecha_fin, activo)
                VALUES (@nombre, @anio, @fecha_inicio, @fecha_fin, 1);
                SELECT SCOPE_IDENTITY() as id_periodo;
            `);
        res.json({ success: true, id_periodo: result.recordset[0].id_periodo });
    } catch (error) {
        console.error('Error creando periodo:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== API DE AUTENTICACIÓN ====================
app.post('/api/auth/login', async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Base de datos no disponible' });
        }
        
        const { email, password, role } = req.body;
        
        const result = await pool.request()
            .input('email', sql.NVarChar, email)
            .query(`
                SELECT u.id_usuario, u.nombre, u.correo_institucional, u.estado,
                       r.nombre as rol_nombre, r.id_rol
                FROM Usuario u
                JOIN Rol r ON u.id_rol = r.id_rol
                WHERE u.correo_institucional = @email AND u.estado = 'Activo'
            `);
        
        let usuario = result.recordset[0];
        
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
        if (!pool) {
            return res.status(503).json({ error: 'Base de datos no disponible' });
        }
        
        const { nombre, email, carnet, password, id_programa, rol } = req.body;
        const rolId = (rol === 'admin') ? 2 : 1;
        
        const existingUser = await pool.request()
            .input('email', sql.NVarChar, email)
            .query('SELECT id_usuario FROM Usuario WHERE correo_institucional = @email');
        
        if (existingUser.recordset.length > 0) {
            return res.status(400).json({ error: 'El correo ya está registrado' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const insertResult = await pool.request()
            .input('nombre', sql.NVarChar, nombre)
            .input('email', sql.NVarChar, email)
            .input('password', sql.NVarChar, hashedPassword)
            .input('id_rol', sql.Int, rolId)
            .query(`
                INSERT INTO Usuario (nombre, correo_institucional, contrasena_hash, id_rol, estado)
                VALUES (@nombre, @email, @password, @id_rol, 'Activo');
                SELECT SCOPE_IDENTITY() as id_usuario;
            `);
        
        const newUserId = insertResult.recordset[0].id_usuario;
        
        if (rolId === 1) {
            await pool.request()
                .input('id_usuario', sql.Int, newUserId)
                .input('carnet', sql.NVarChar, carnet || `ADM${newUserId}`)
                .input('id_programa', sql.Int, id_programa || null)
                .query(`
                    INSERT INTO Estudiante (id_usuario, carnet, estado_academico, id_programa)
                    VALUES (@id_usuario, @carnet, 'Activo', @id_programa)
                `);
        }
        
        res.json({ success: true, message: 'Usuario registrado exitosamente' });
        
    } catch (error) {
        console.error('Error en register:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/auth/estudiante', verificarToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Base de datos no disponible' });
        }
        
        const result = await pool.request()
            .input('id_usuario', sql.Int, req.usuario.id_usuario)
            .query(`
                SELECT e.id_estudiante, e.carnet, e.estado_academico, e.id_programa,
                       ISNULL((
                           SELECT SUM(f.monto) FROM Factura f 
                           WHERE f.id_estudiante = e.id_estudiante AND f.estado = 'Pendiente'
                       ), 0) as montoDeuda
                FROM Estudiante e
                WHERE e.id_usuario = @id_usuario
            `);
        
        if (result.recordset.length > 0) {
            res.json({ success: true, estudiante: result.recordset[0] });
        } else {
            res.json({ success: true, estudiante: null });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== API DE OFERTA ====================
app.get('/api/oferta/secciones', verificarToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Base de datos no disponible' });
        }
        
        const { periodo_id } = req.query;
        
        const result = await pool.request()
            .input('periodo_id', sql.Int, periodo_id ? parseInt(periodo_id) : null)
            .query(`
                SELECT s.id_seccion, s.id_curso, s.id_periodo, s.docente, s.aula, s.horario, s.cupo, s.numero_seccion,
                       ISNULL(s.cupo - (
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
                WHERE (@periodo_id IS NULL OR s.id_periodo = @periodo_id)
                ORDER BY c.codigo
            `);
        
        res.json(result.recordset);
        
    } catch (error) {
        console.error('Error en /oferta/secciones:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== API DE MATRÍCULAS ====================
app.get('/api/matriculas/mis-matriculas', verificarToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Base de datos no disponible' });
        }
        
        const result = await pool.request()
            .input('id_usuario', sql.Int, req.usuario.id_usuario)
            .query(`
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
                WHERE u.id_usuario = @id_usuario AND m.estado != 'Cancelada'
                ORDER BY m.fecha_matricula DESC
            `);
        
        res.json(result.recordset);
        
    } catch (error) {
        console.error('Error en /matriculas/mis-matriculas:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/matriculas', verificarToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Base de datos no disponible' });
        }
        
        const { id_seccion } = req.body;
        
        const estudianteResult = await pool.request()
            .input('id_usuario', sql.Int, req.usuario.id_usuario)
            .query('SELECT id_estudiante FROM Estudiante WHERE id_usuario = @id_usuario');
        
        if (estudianteResult.recordset.length === 0) {
            return res.status(400).json({ error: 'No se encontró información del estudiante' });
        }
        
        const id_estudiante = estudianteResult.recordset[0].id_estudiante;
        
        const cupoCheck = await pool.request()
            .input('id_seccion', sql.Int, id_seccion)
            .query(`
                SELECT s.cupo, COUNT(m.id_matricula) as matriculados
                FROM Seccion s
                LEFT JOIN Matricula m ON s.id_seccion = m.id_seccion AND m.estado IN ('Confirmada', 'Pendiente')
                WHERE s.id_seccion = @id_seccion
                GROUP BY s.cupo
            `);
        
        if (cupoCheck.recordset.length > 0) {
            const disponibles = cupoCheck.recordset[0].cupo - cupoCheck.recordset[0].matriculados;
            if (disponibles <= 0) {
                return res.status(400).json({ error: 'No hay cupos disponibles' });
            }
        }
        
        const yaMatriculadoSeccion = await pool.request()
            .input('id_estudiante', sql.Int, id_estudiante)
            .input('id_seccion', sql.Int, id_seccion)
            .query(`
                SELECT id_matricula FROM Matricula 
                WHERE id_estudiante = @id_estudiante AND id_seccion = @id_seccion AND estado IN ('Confirmada', 'Pendiente')
            `);
        
        if (yaMatriculadoSeccion.recordset.length > 0) {
            return res.status(400).json({ error: 'Ya está matriculado en esta sección' });
        }

        const yaMatriculadoCurso = await pool.request()
            .input('id_estudiante', sql.Int, id_estudiante)
            .input('id_seccion', sql.Int, id_seccion)
            .query(`
                SELECT m.id_matricula
                FROM Matricula m
                JOIN Seccion s  ON m.id_seccion  = s.id_seccion
                JOIN Seccion s2 ON s2.id_seccion = @id_seccion
                WHERE m.id_estudiante = @id_estudiante
                  AND s.id_curso    = s2.id_curso
                  AND s.id_periodo  = s2.id_periodo
                  AND m.estado IN ('Confirmada', 'Pendiente')
            `);

        if (yaMatriculadoCurso.recordset.length > 0) {
            return res.status(400).json({ error: 'Ya está matriculado en este curso en el período actual' });
        }
        
        const cursoInfo = await pool.request()
            .input('id_seccion', sql.Int, id_seccion)
            .query(`
                SELECT c.id_curso, c.nombre, c.creditos, c.costo_credito
                FROM Seccion s
                JOIN Curso c ON s.id_curso = c.id_curso
                WHERE s.id_seccion = @id_seccion
            `);
        
        const monto = cursoInfo.recordset[0].creditos * cursoInfo.recordset[0].costo_credito;
        
        const result = await pool.request()
            .input('id_estudiante', sql.Int, id_estudiante)
            .input('id_seccion', sql.Int, id_seccion)
            .input('estado', sql.NVarChar, 'Confirmada')
            .query(`
                INSERT INTO Matricula (id_estudiante, id_seccion, fecha_matricula, estado)
                VALUES (@id_estudiante, @id_seccion, GETDATE(), @estado);
                SELECT SCOPE_IDENTITY() as id_matricula;
            `);
        
        await pool.request()
            .input('id_estudiante', sql.Int, id_estudiante)
            .input('monto', sql.Decimal(10,2), monto)
            .input('fecha_vencimiento', sql.Date, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
            .query(`
                INSERT INTO Factura (id_estudiante, monto, fecha_emision, fecha_vencimiento, estado)
                VALUES (@id_estudiante, @monto, GETDATE(), @fecha_vencimiento, 'Pendiente')
            `);
        
        res.json({ 
            success: true, 
            id_matricula: result.recordset[0].id_matricula,
            message: 'Matrícula registrada exitosamente'
        });
        
    } catch (error) {
        console.error('Error en /matriculas:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/matriculas/:id', verificarToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Base de datos no disponible' });
        }
        
        const id_matricula = req.params.id;

        const matriculaCheck = await pool.request()
            .input('id_matricula', sql.Int, id_matricula)
            .input('id_usuario', sql.Int, req.usuario.id_usuario)
            .query(`
                SELECT m.id_matricula, m.id_estudiante, m.estado
                FROM Matricula m
                JOIN Estudiante e ON m.id_estudiante = e.id_estudiante
                WHERE m.id_matricula = @id_matricula AND e.id_usuario = @id_usuario
            `);

        if (matriculaCheck.recordset.length === 0) {
            return res.status(404).json({ error: 'Matrícula no encontrada' });
        }

        const matricula = matriculaCheck.recordset[0];

        const pagadoCheck = await pool.request()
            .input('id_matricula', sql.Int, id_matricula)
            .query(`
                SELECT TOP 1 f.id_factura
                FROM Factura f
                JOIN Matricula m ON f.id_estudiante = m.id_estudiante
                JOIN Pago p ON p.id_factura = f.id_factura
                WHERE m.id_matricula = @id_matricula
                  AND f.estado = 'Pagada'
                  AND p.estado = 'Completado'
            `);

        if (pagadoCheck.recordset.length > 0) {
            return res.status(400).json({ error: 'No se puede cancelar la matrícula porque el curso ya fue pagado' });
        }


        await pool.request()
            .input('id_matricula', sql.Int, id_matricula)
            .query(`
                UPDATE Matricula SET estado = 'Cancelada' WHERE id_matricula = @id_matricula
            `);

        await pool.request()
            .input('id_matricula', sql.Int, id_matricula)
            .query(`
                UPDATE f SET f.estado = 'Cancelada'
                FROM Factura f
                JOIN Matricula m ON f.id_estudiante = m.id_estudiante
                WHERE m.id_matricula = @id_matricula
                  AND f.estado = 'Pendiente'
                  AND f.id_factura = (
                      SELECT TOP 1 f2.id_factura
                      FROM Factura f2
                      WHERE f2.id_estudiante = m.id_estudiante
                        AND f2.estado = 'Pendiente'
                      ORDER BY f2.fecha_emision DESC
                  )
            `);
        
        res.json({ success: true, message: 'Matrícula cancelada' });
        
    } catch (error) {
        console.error('Error eliminando matrícula:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== API DE PAGOS ====================
app.get('/api/pagos/mis-facturas', verificarToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Base de datos no disponible' });
        }
        
        const result = await pool.request()
            .input('id_usuario', sql.Int, req.usuario.id_usuario)
            .query(`
                SELECT f.id_factura, f.monto, f.fecha_emision, f.fecha_vencimiento, f.estado,
                       'Matrícula' as concepto
                FROM Factura f
                JOIN Estudiante e ON f.id_estudiante = e.id_estudiante
                JOIN Usuario u ON e.id_usuario = u.id_usuario
                WHERE u.id_usuario = @id_usuario
                ORDER BY f.fecha_vencimiento ASC
            `);
        
        res.json(result.recordset);
        
    } catch (error) {
        console.error('Error en /pagos/mis-facturas:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/pagos/procesar', verificarToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Base de datos no disponible' });
        }
        
        const { id_factura, metodo_pago, referencia } = req.body;
        
        const facturaResult = await pool.request()
            .input('id_factura', sql.Int, id_factura)
            .query(`SELECT monto, id_estudiante FROM Factura WHERE id_factura = @id_factura AND estado = 'Pendiente'`);
        
        if (facturaResult.recordset.length === 0) {
            return res.status(400).json({ error: 'Factura no encontrada o ya pagada' });
        }
        
        const { monto, id_estudiante } = facturaResult.recordset[0];
        
        await pool.request()
            .input('id_factura', sql.Int, id_factura)
            .input('monto', sql.Decimal(10,2), monto)
            .input('metodo_pago', sql.NVarChar, metodo_pago)
            .input('referencia', sql.NVarChar, referencia || 'N/A')
            .query(`
                INSERT INTO Pago (id_factura, monto, fecha_pago, metodo_pago, referencia, estado)
                VALUES (@id_factura, @monto, GETDATE(), @metodo_pago, @referencia, 'Completado')
            `);
        
        await pool.request()
            .input('id_factura', sql.Int, id_factura)
            .query(`
                UPDATE Factura 
                SET estado = 'Pagada', fecha_pago = GETDATE()
                WHERE id_factura = @id_factura
            `);
        
        res.json({ success: true, message: 'Pago procesado exitosamente' });
        
    } catch (error) {
        console.error('Error en /pagos/procesar:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== API DE ADMIN ====================
app.get('/api/admin/usuarios', verificarToken, verificarRol(['Administrador']), async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Base de datos no disponible' });
        }
        
        const result = await pool.request()
            .query(`
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
        
        res.json(result.recordset);
        
    } catch (error) {
        console.error('Error en /admin/usuarios:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/matriculas', verificarToken, verificarRol(['Administrador']), async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Base de datos no disponible' });
        }
        
        const result = await pool.request()
            .query(`
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
        
        res.json(result.recordset);
        
    } catch (error) {
        console.error('Error en /admin/matriculas:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/facturas', verificarToken, verificarRol(['Administrador']), async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Base de datos no disponible' });
        }
        
        const result = await pool.request()
            .query(`
                SELECT f.id_factura, f.monto, f.fecha_emision, f.fecha_vencimiento, f.fecha_pago, f.estado,
                       u.nombre as estudiante_nombre, u.correo_institucional, e.carnet
                FROM Factura f
                JOIN Estudiante e ON f.id_estudiante = e.id_estudiante
                JOIN Usuario u ON e.id_usuario = u.id_usuario
                ORDER BY f.fecha_emision DESC
            `);
        
        res.json(result.recordset);
        
    } catch (error) {
        console.error('Error en /admin/facturas:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/matriculas', verificarToken, verificarRol(['Administrador']), async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Base de datos no disponible' });
        }
        
        const { id_estudiante, id_seccion } = req.body;
        
        const cupoCheck = await pool.request()
            .input('id_seccion', sql.Int, id_seccion)
            .query(`
                SELECT s.cupo, COUNT(m.id_matricula) as matriculados
                FROM Seccion s
                LEFT JOIN Matricula m ON s.id_seccion = m.id_seccion AND m.estado IN ('Confirmada', 'Pendiente')
                WHERE s.id_seccion = @id_seccion
                GROUP BY s.cupo
            `);
        
        if (cupoCheck.recordset.length > 0) {
            const disponibles = cupoCheck.recordset[0].cupo - cupoCheck.recordset[0].matriculados;
            if (disponibles <= 0) {
                return res.status(400).json({ error: 'No hay cupos disponibles' });
            }
        }
        
        const cursoInfo = await pool.request()
            .input('id_seccion', sql.Int, id_seccion)
            .query(`
                SELECT c.creditos, c.costo_credito
                FROM Seccion s
                JOIN Curso c ON s.id_curso = c.id_curso
                WHERE s.id_seccion = @id_seccion
            `);
        
        const monto = cursoInfo.recordset[0].creditos * cursoInfo.recordset[0].costo_credito;
        
        const result = await pool.request()
            .input('id_estudiante', sql.Int, id_estudiante)
            .input('id_seccion', sql.Int, id_seccion)
            .input('estado', sql.NVarChar, 'Confirmada')
            .query(`
                INSERT INTO Matricula (id_estudiante, id_seccion, fecha_matricula, estado)
                VALUES (@id_estudiante, @id_seccion, GETDATE(), @estado);
                SELECT SCOPE_IDENTITY() as id_matricula;
            `);
        
        await pool.request()
            .input('id_estudiante', sql.Int, id_estudiante)
            .input('monto', sql.Decimal(10,2), monto)
            .input('fecha_vencimiento', sql.Date, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
            .query(`
                INSERT INTO Factura (id_estudiante, monto, fecha_emision, fecha_vencimiento, estado)
                VALUES (@id_estudiante, @monto, GETDATE(), @fecha_vencimiento, 'Pendiente')
            `);
        
        res.json({ success: true, id_matricula: result.recordset[0].id_matricula });
        
    } catch (error) {
        console.error('Error en /admin/matriculas POST:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/secciones', verificarToken, verificarRol(['Administrador']), async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Base de datos no disponible' });
        }
        
        const { id_curso, id_periodo, numero_seccion, docente, aula, horario, cupo } = req.body;
        
        const result = await pool.request()
            .input('id_curso', sql.Int, id_curso)
            .input('id_periodo', sql.Int, id_periodo)
            .input('numero_seccion', sql.Int, numero_seccion)
            .input('docente', sql.NVarChar, docente)
            .input('aula', sql.NVarChar, aula)
            .input('horario', sql.NVarChar, horario)
            .input('cupo', sql.Int, cupo)
            .query(`
                INSERT INTO Seccion (id_curso, id_periodo, numero_seccion, docente, aula, horario, cupo)
                VALUES (@id_curso, @id_periodo, @numero_seccion, @docente, @aula, @horario, @cupo);
                SELECT SCOPE_IDENTITY() as id_seccion;
            `);
        
        res.json({ success: true, id_seccion: result.recordset[0].id_seccion });
        
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
        await pool.request()
            .input('id_seccion', sql.Int, id_seccion)
            .input('docente', sql.NVarChar, docente)
            .input('aula', sql.NVarChar, aula)
            .input('horario', sql.NVarChar, horario)
            .input('cupo', sql.Int, cupo)
            .query(`
                UPDATE Seccion SET docente=@docente, aula=@aula, horario=@horario, cupo=@cupo
                WHERE id_seccion=@id_seccion
            `);
        res.json({ success: true });
    } catch (error) {
        console.error('Error actualizando sección:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/secciones/:id', verificarToken, verificarRol(['Administrador']), async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Base de datos no disponible' });
        }
        
        const id_seccion = req.params.id;
        
        const tieneMatriculas = await pool.request()
            .input('id_seccion', sql.Int, id_seccion)
            .query('SELECT COUNT(*) as total FROM Matricula WHERE id_seccion = @id_seccion');
        
        if (tieneMatriculas.recordset[0].total > 0) {
            return res.status(400).json({ error: 'No se puede eliminar una sección con matrículas' });
        }
        
        await pool.request()
            .input('id_seccion', sql.Int, id_seccion)
            .query('DELETE FROM Seccion WHERE id_seccion = @id_seccion');
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Error eliminando sección:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/usuarios/:id/rol', verificarToken, verificarRol(['Administrador']), async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Base de datos no disponible' });
        }
        
        const id_usuario = req.params.id;
        const { rol } = req.body;
        
        const rolId = rol === 'admin' ? 2 : 1;
        
        await pool.request()
            .input('id_usuario', sql.Int, id_usuario)
            .input('id_rol', sql.Int, rolId)
            .query('UPDATE Usuario SET id_rol = @id_rol WHERE id_usuario = @id_usuario');
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Error cambiando rol:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/usuarios/:id', verificarToken, verificarRol(['Administrador']), async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Base de datos no disponible' });
        }
        
        const id_usuario = req.params.id;
        
        const estudianteCheck = await pool.request()
            .input('id_usuario', sql.Int, id_usuario)
            .query('SELECT id_estudiante FROM Estudiante WHERE id_usuario = @id_usuario');

        if (estudianteCheck.recordset.length > 0) {
            const id_estudiante = estudianteCheck.recordset[0].id_estudiante;

            const tieneMatriculas = await pool.request()
                .input('id_estudiante', sql.Int, id_estudiante)
                .query('SELECT COUNT(*) as total FROM Matricula WHERE id_estudiante = @id_estudiante AND estado != \'Cancelada\'');

            if (tieneMatriculas.recordset[0].total > 0) {
                return res.status(400).json({ error: 'No se puede eliminar un usuario con matrículas activas' });
            }

            await pool.request()
                .input('id_estudiante', sql.Int, id_estudiante)
                .query('DELETE FROM Matricula WHERE id_estudiante = @id_estudiante');

            await pool.request()
                .input('id_estudiante', sql.Int, id_estudiante)
                .query('DELETE FROM Factura WHERE id_estudiante = @id_estudiante');

            await pool.request()
                .input('id_estudiante', sql.Int, id_estudiante)
                .query('DELETE FROM Estudiante WHERE id_estudiante = @id_estudiante');
        }

        await pool.request()
            .input('id_usuario', sql.Int, id_usuario)
            .query('DELETE FROM Usuario WHERE id_usuario = @id_usuario');
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Error eliminando usuario:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== API DE REPORTES ====================
app.get('/api/reportes/matriculas', verificarToken, verificarRol(['Administrador']), async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Base de datos no disponible' });
        }
        
        const result = await pool.request()
            .query(`
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
        
        res.json(result.recordset);
        
    } catch (error) {
        console.error('Error en /reportes/matriculas:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/reportes/financieros', verificarToken, verificarRol(['Administrador']), async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Base de datos no disponible' });
        }
        
        const result = await pool.request()
            .query(`
                SELECT 
                    ISNULL(SUM(CASE WHEN f.estado = 'Pagada' THEN f.monto ELSE 0 END), 0) as total_pagado,
                    ISNULL(SUM(CASE WHEN f.estado = 'Pendiente' THEN f.monto ELSE 0 END), 0) as total_pendiente,
                    COUNT(CASE WHEN f.estado = 'Pagada' THEN 1 END) as facturas_pagadas,
                    COUNT(CASE WHEN f.estado = 'Pendiente' THEN 1 END) as facturas_pendientes
                FROM Factura f
            `);
        
        res.json(result.recordset[0]);
        
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
    console.log(`   GET    /api/health - Verificar estado`);
    console.log(`   GET    /api/carreras - Listar carreras`);
    console.log(`   POST   /api/auth/login - Iniciar sesión`);
    console.log(`   POST   /api/auth/register - Registrar usuario`);
    console.log(`   GET    /api/auth/estudiante - Info estudiante`);
    console.log(`   GET    /api/oferta/secciones - Ver oferta académica`);
    console.log(`   GET    /api/matriculas/mis-matriculas - Mis matrículas`);
    console.log(`   POST   /api/matriculas - Registrar matrícula`);
    console.log(`   DELETE /api/matriculas/:id - Cancelar matrícula`);
    console.log(`   GET    /api/pagos/mis-facturas - Ver facturas`);
    console.log(`   POST   /api/pagos/procesar - Procesar pago`);
    console.log(`   GET    /api/admin/usuarios - Listar usuarios`);
    console.log(`   GET    /api/admin/matriculas - Listar matrículas`);
    console.log(`   GET    /api/admin/facturas - Listar facturas`);
    console.log(`   POST   /api/admin/matriculas - Crear matrícula admin`);
    console.log(`   POST   /api/admin/secciones - Crear sección`);
    console.log(`   DELETE /api/admin/secciones/:id - Eliminar sección`);
    console.log(`   PUT    /api/admin/usuarios/:id/rol - Cambiar rol`);
    console.log(`   DELETE /api/admin/usuarios/:id - Eliminar usuario`);
    console.log(`   GET    /api/reportes/matriculas - Reporte matrículas`);
    console.log(`   GET    /api/reportes/financieros - Reporte financiero`);
});

process.on('SIGINT', async () => {
    console.log('\n🛑 Cerrando servidor...');
    if (pool) {
        await pool.close();
        console.log('✅ Conexión a BD cerrada');
    }
    process.exit(0);
});