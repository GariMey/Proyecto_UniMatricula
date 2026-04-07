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

// Rate limiting para seguridad
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});
app.use('/api/', limiter);

// ==================== CONFIGURACIÓN SQL SERVER ====================
// Configuración CORREGIDA - Usando Autenticación SQL (funciona)
const dbConfig = {
    server: 'Garita',           // Nombre del servidor (sin la instancia)
    port: 1433,                 // Puerto fijo 1433
    database: 'Matricula',
    user: 'sa',                 // Usuario SQL
    password: '1234',           // Contraseña
    options: {
        trustServerCertificate: true,  // Para desarrollo
        enableArithAbort: true,
        encrypt: false,                // Deshabilitar SSL para desarrollo
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
        console.log(`Autenticación: SQL (usuario: ${dbConfig.user})`);
        
        pool = await sql.connect(dbConfig);
        
        // Probar la conexión
        const result = await pool.request().query('SELECT @@SERVERNAME as servidor, GETDATE() as fecha, DB_NAME() as db');
        console.log('✅ Conectado a SQL Server');
        console.log(`   Servidor: ${result.recordset[0].servidor}`);
        console.log(`   Base de datos: ${result.recordset[0].db}`);
        console.log(`   Fecha del servidor: ${result.recordset[0].fecha}`);
        
        if (reconnectInterval) {
            clearInterval(reconnectInterval);
            reconnectInterval = null;
        }
        
        return pool;
    } catch (err) {
        console.error('❌ Error conectando a SQL Server:', err.message);
        
        // Reintentar cada 10 segundos
        if (!reconnectInterval) {
            reconnectInterval = setInterval(() => {
                console.log('🔄 Reintentando conexión...');
                connectDB();
            }, 10000);
        }
        
        return null;
    }
}

// Iniciar conexión
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
                nombre_db: result.recordset[0].database,
                config: {
                    server: dbConfig.server,
                    port: dbConfig.port,
                    database: dbConfig.database,
                    auth: 'SQL Authentication'
                }
            });
        } else {
            res.status(503).json({ status: 'ERROR', database: 'Desconectado' });
        }
    } catch (error) {
        res.status(500).json({ status: 'ERROR', message: error.message });
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
                WHERE u.correo_institucional = @email
            `);
        
        let usuario = result.recordset[0];
        
        if (!usuario && role === 'student') {
            const insertResult = await pool.request()
                .input('nombre', sql.NVarChar, email.split('@')[0])
                .input('email', sql.NVarChar, email)
                .input('id_rol', sql.Int, 1)
                .query(`
                    INSERT INTO Usuario (nombre, correo_institucional, id_rol, estado)
                    VALUES (@nombre, @email, @id_rol, 'Activo');
                    SELECT SCOPE_IDENTITY() as id_usuario;
                `);
            
            const newUserId = insertResult.recordset[0].id_usuario;
            
            await pool.request()
                .input('id_usuario', sql.Int, newUserId)
                .input('carnet', sql.NVarChar, `DEMO${newUserId}`)
                .query(`
                    INSERT INTO Estudiante (id_usuario, carnet, estado_academico)
                    VALUES (@id_usuario, @carnet, 'Activo')
                `);
            
            usuario = {
                id_usuario: newUserId,
                nombre: email.split('@')[0],
                correo_institucional: email,
                estado: 'Activo',
                rol_nombre: 'Estudiante',
                id_rol: 1
            };
        }
        
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

app.get('/api/auth/estudiante', verificarToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Base de datos no disponible' });
        }
        
        const result = await pool.request()
            .input('id_usuario', sql.Int, req.usuario.id_usuario)
            .query(`
                SELECT e.id_estudiante, e.carnet, e.estado_academico,
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
        
        const { periodo_id, carrera } = req.query;
        
        let query = `
            SELECT s.id_seccion, s.id_curso, s.id_periodo, s.docente, s.aula, s.horario, s.cupo,
                   ISNULL(s.cupo - COUNT(m.id_matricula), s.cupo) as disponibles,
                   c.codigo, c.nombre as curso_nombre, c.creditos,
                   p.nombre as programa_nombre
            FROM Seccion s
            JOIN Curso c ON s.id_curso = c.id_curso
            JOIN ProgramaAcademico p ON c.id_programa = p.id_programa
            LEFT JOIN Matricula m ON s.id_seccion = m.id_seccion AND m.estado IN ('Pendiente', 'Confirmada')
            WHERE (@periodo_id IS NULL OR s.id_periodo = @periodo_id)
        `;
        
        const request = pool.request();
        request.input('periodo_id', sql.Int, periodo_id || 1);
        
        if (carrera && carrera !== '') {
            query += ` AND p.nombre = @carrera`;
            request.input('carrera', sql.NVarChar, carrera);
        }
        
        query += ` GROUP BY s.id_seccion, s.id_curso, s.id_periodo, s.docente, s.aula, s.horario, s.cupo, c.codigo, c.nombre, c.creditos, p.nombre`;
        
        const result = await request.query(query);
        res.json(result.recordset);
        
    } catch (error) {
        console.error('Error en /oferta/secciones:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== API DE MATRÍCULAS ====================
app.post('/api/matriculas', verificarToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Base de datos no disponible' });
        }
        
        const { id_seccion, id_estudiante } = req.body;
        
        // Verificar cupo disponible
        const cupoCheck = await pool.request()
            .input('id_seccion', sql.Int, id_seccion)
            .query(`
                SELECT s.cupo, COUNT(m.id_matricula) as matriculados
                FROM Seccion s
                LEFT JOIN Matricula m ON s.id_seccion = m.id_seccion AND m.estado IN ('Pendiente', 'Confirmada')
                WHERE s.id_seccion = @id_seccion
                GROUP BY s.cupo
            `);
        
        if (cupoCheck.recordset.length > 0) {
            const disponibles = cupoCheck.recordset[0].cupo - cupoCheck.recordset[0].matriculados;
            if (disponibles <= 0) {
                return res.status(400).json({ error: 'No hay cupos disponibles' });
            }
        }
        
        // Crear matrícula
        const result = await pool.request()
            .input('id_estudiante', sql.Int, id_estudiante)
            .input('id_seccion', sql.Int, id_seccion)
            .input('estado', sql.NVarChar, 'Pendiente')
            .query(`
                INSERT INTO Matricula (id_estudiante, id_seccion, fecha_matricula, estado)
                VALUES (@id_estudiante, @id_seccion, GETDATE(), @estado);
                SELECT SCOPE_IDENTITY() as id_matricula;
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

// ==================== API DE PAGOS ====================
app.get('/api/pagos/mis-facturas', verificarToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Base de datos no disponible' });
        }
        
        const { id_estudiante } = req.query;
        
        const result = await pool.request()
            .input('id_estudiante', sql.Int, id_estudiante)
            .query(`
                SELECT id_factura, monto, fecha_emision, fecha_vencimiento, estado
                FROM Factura
                WHERE id_estudiante = @id_estudiante
                ORDER BY fecha_vencimiento ASC
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
        
        const { id_factura, monto_pagado } = req.body;
        
        const result = await pool.request()
            .input('id_factura', sql.Int, id_factura)
            .input('monto_pagado', sql.Decimal(10,2), monto_pagado)
            .input('fecha_pago', sql.DateTime, new Date())
            .query(`
                UPDATE Factura 
                SET estado = 'Pagada', 
                    fecha_pago = @fecha_pago
                WHERE id_factura = @id_factura AND monto = @monto_pagado;
                
                SELECT @@ROWCOUNT as filas_afectadas;
            `);
        
        if (result.recordset[0].filas_afectadas > 0) {
            res.json({ success: true, message: 'Pago procesado exitosamente' });
        } else {
            res.status(400).json({ error: 'No se pudo procesar el pago' });
        }
        
    } catch (error) {
        console.error('Error en /pagos/procesar:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== API DE REPORTES ====================
app.get('/api/reportes/matriculas', verificarToken, verificarRol(['Administrador', 'Coordinador']), async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Base de datos no disponible' });
        }
        
        const result = await pool.request()
            .query(`
                SELECT p.nombre as periodo, 
                       COUNT(m.id_matricula) as total_matriculas,
                       COUNT(DISTINCT m.id_estudiante) as total_estudiantes
                FROM Matricula m
                JOIN Seccion s ON m.id_seccion = s.id_seccion
                JOIN PeriodoAcademico p ON s.id_periodo = p.id_periodo
                GROUP BY p.nombre, p.id_periodo
                ORDER BY p.id_periodo DESC
            `);
        
        res.json(result.recordset);
        
    } catch (error) {
        console.error('Error en /reportes/matriculas:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/reportes/financieros', verificarToken, verificarRol(['Administrador', 'Coordinador']), async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Base de datos no disponible' });
        }
        
        const result = await pool.request()
            .query(`
                SELECT 
                    SUM(CASE WHEN estado = 'Pagada' THEN monto ELSE 0 END) as total_pagado,
                    SUM(CASE WHEN estado = 'Pendiente' THEN monto ELSE 0 END) as total_pendiente,
                    COUNT(CASE WHEN estado = 'Pagada' THEN 1 END) as facturas_pagadas,
                    COUNT(CASE WHEN estado = 'Pendiente' THEN 1 END) as facturas_pendientes
                FROM Factura
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
    console.log(`   POST   /api/auth/login - Iniciar sesión`);
    console.log(`   GET    /api/auth/estudiante - Info estudiante`);
    console.log(`   GET    /api/oferta/secciones - Ver oferta académica`);
    console.log(`   POST   /api/matriculas - Registrar matrícula`);
    console.log(`   GET    /api/pagos/mis-facturas - Ver facturas`);
    console.log(`   POST   /api/pagos/procesar - Procesar pago`);
    console.log(`   GET    /api/reportes/matriculas - Reporte matrículas`);
    console.log(`   GET    /api/reportes/financieros - Reporte financiero`);
    console.log(`\n🔗 Probar conexión: http://localhost:${PORT}/api/health\n`);
});

// Manejar cierre graceful
process.on('SIGINT', async () => {
    console.log('\n🛑 Cerrando servidor...');
    if (pool) {
        await pool.close();
        console.log('✅ Conexión a BD cerrada');
    }
    process.exit(0);
});