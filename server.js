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
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100 // máximo 100 peticiones por IP
});
app.use('/api/', limiter);

// ==================== CONFIGURACIÓN SQL SERVER ====================
const dbConfig = {
    server: process.env.DB_SERVER || 'GARITA\\PRINCIPAL',
    database: process.env.DB_DATABASE || 'Matricula',
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '1234',
    port: parseInt(process.env.DB_PORT) || 5022,
    options: {
        encrypt: true,
        trustServerCertificate: true,
        enableArithAbort: true
    },
    connectionTimeout: 30000,
    requestTimeout: 30000
};

let pool = null;

async function connectDB() {
    try {
        pool = await sql.connect(dbConfig);
        console.log('✅ Conectado a SQL Server - Base de datos: Matricula');
        return pool;
    } catch (err) {
        console.error('❌ Error conectando a SQL Server:', err.message);
        console.log('Verifique que:');
        console.log('1. SQL Server esté ejecutándose');
        console.log('2. La base de datos "Matricula" exista');
        console.log('3. Las credenciales sean correctas');
        setTimeout(connectDB, 5000);
        return null;
    }
}

connectDB();

// ==================== MIDDLEWARE DE AUTENTICACIÓN ====================
function verificarToken(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Token no proporcionado' });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
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

// ==================== API DE AUTENTICACIÓN ====================

// Login con SSO simulado
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password, role } = req.body;
        
        // Buscar usuario por correo
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
        
        // Si no existe y es estudiante, crear demo
        if (!usuario && role === 'student') {
            const insertResult = await pool.request()
                .input('nombre', sql.NVarChar, 'Estudiante Demo')
                .input('email', sql.NVarChar, email)
                .input('id_rol', sql.Int, 1)
                .query(`
                    INSERT INTO Usuario (nombre, correo_institucional, id_rol, estado)
                    VALUES (@nombre, @email, @id_rol, 'Activo');
                    SELECT SCOPE_IDENTITY() as id_usuario;
                `);
            
            const newUserId = insertResult.recordset[0].id_usuario;
            
            // Crear estudiante asociado
            await pool.request()
                .input('id_usuario', sql.Int, newUserId)
                .input('carnet', sql.NVarChar, `DEMO${newUserId}`)
                .query(`
                    INSERT INTO Estudiante (id_usuario, carnet, estado_academico)
                    VALUES (@id_usuario, @carnet, 'Activo')
                `);
            
            usuario = {
                id_usuario: newUserId,
                nombre: 'Estudiante Demo',
                correo_institucional: email,
                estado: 'Activo',
                rol_nombre: 'Estudiante',
                id_rol: 1
            };
        }
        
        if (!usuario) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }
        
        if (usuario.estado !== 'Activo') {
            return res.status(401).json({ error: 'Usuario inactivo' });
        }
        
        // Generar token JWT
        const token = jwt.sign(
            { 
                id_usuario: usuario.id_usuario, 
                nombre: usuario.nombre, 
                rol: usuario.rol_nombre,
                id_rol: usuario.id_rol
            },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );
        
        // Registrar en auditoría
        await pool.request()
            .input('id_usuario', sql.Int, usuario.id_usuario)
            .input('accion', sql.NVarChar, 'Inicio de sesión exitoso')
            .query(`INSERT INTO Auditoria (id_usuario, accion, fecha) VALUES (@id_usuario, @accion, GETDATE())`);
        
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
        res.status(500).json({ error: 'Error en el servidor' });
    }
});

// Obtener estudiante actual
app.get('/api/auth/estudiante', verificarToken, async (req, res) => {
    try {
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

// ==================== API DE DASHBOARD ====================

app.get('/api/dashboard/stats', verificarToken, async (req, res) => {
    try {
        const { id_rol, id_usuario } = req.usuario;
        
        if (id_rol === 1) { // Estudiante
            const estudianteResult = await pool.request()
                .input('id_usuario', sql.Int, id_usuario)
                .query(`SELECT id_estudiante FROM Estudiante WHERE id_usuario = @id_usuario`);
            
            if (estudianteResult.recordset.length === 0) {
                return res.json({ matriculas: 0, creditos: 0, deuda: 0 });
            }
            
            const id_estudiante = estudianteResult.recordset[0].id_estudiante;
            
            const stats = await pool.request()
                .input('id_estudiante', sql.Int, id_estudiante)
                .query(`
                    SELECT 
                        COUNT(DISTINCT m.id_matricula) as total_matriculas,
                        SUM(c.creditos) as total_creditos,
                        ISNULL((SELECT SUM(monto) FROM Factura WHERE id_estudiante = @id_estudiante AND estado = 'Pendiente'), 0) as deuda
                    FROM Matricula m
                    JOIN Seccion s ON m.id_seccion = s.id_seccion
                    JOIN Curso c ON s.id_curso = c.id_curso
                    WHERE m.id_estudiante = @id_estudiante AND m.estado = 'Confirmada'
                `);
            
            res.json(stats.recordset[0]);
            
        } else { // Admin
            const stats = await pool.request()
                .query(`
                    SELECT 
                        (SELECT COUNT(*) FROM Estudiante) as total_estudiantes,
                        (SELECT COUNT(*) FROM Matricula) as total_matriculas,
                        ISNULL((SELECT SUM(monto) FROM Factura WHERE estado = 'Pagada'), 0) as total_ingresos
                `);
            res.json(stats.recordset[0]);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== API DE OFERTA ACADÉMICA ====================

app.get('/api/oferta/secciones', verificarToken, async (req, res) => {
    try {
        const { periodo_id, carrera } = req.query;
        
        let query = `
            SELECT s.id_seccion, s.id_curso, s.id_periodo, s.docente, s.aula, s.horario, s.cupo,
                   (s.cupo - COUNT(m.id_matricula)) as disponibles,
                   c.codigo, c.nombre as curso_nombre, c.creditos,
                   p.nombre as programa_nombre
            FROM Seccion s
            JOIN Curso c ON s.id_curso = c.id_curso
            JOIN ProgramaAcademico p ON c.id_programa = p.id_programa
            LEFT JOIN Matricula m ON s.id_seccion = m.id_seccion AND m.estado IN ('Pendiente', 'Confirmada')
            WHERE s.id_periodo = @periodo_id
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
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/oferta/seccion', verificarToken, verificarRol(['AdminTI']), async (req, res) => {
    try {
        const { id_curso, id_periodo, docente, aula, horario, cupo, id_seccion } = req.body;
        
        if (id_seccion) {
            // Actualizar
            await pool.request()
                .input('id_seccion', sql.Int, id_seccion)
                .input('id_curso', sql.Int, id_curso)
                .input('id_periodo', sql.Int, id_periodo)
                .input('docente', sql.NVarChar, docente)
                .input('aula', sql.NVarChar, aula)
                .input('horario', sql.NVarChar, horario)
                .input('cupo', sql.Int, cupo)
                .query(`
                    UPDATE Seccion SET 
                        id_curso = @id_curso, id_periodo = @id_periodo,
                        docente = @docente, aula = @aula, horario = @horario, cupo = @cupo
                    WHERE id_seccion = @id_seccion
                `);
        } else {
            // Crear nueva
            await pool.request()
                .input('id_curso', sql.Int, id_curso)
                .input('id_periodo', sql.Int, id_periodo)
                .input('docente', sql.NVarChar, docente)
                .input('aula', sql.NVarChar, aula)
                .input('horario', sql.NVarChar, horario)
                .input('cupo', sql.Int, cupo)
                .query(`
                    INSERT INTO Seccion (id_curso, id_periodo, docente, aula, horario, cupo)
                    VALUES (@id_curso, @id_periodo, @docente, @aula, @horario, @cupo)
                `);
        }
        
        await registrarAuditoriaAPI(req.usuario.id_usuario, `Creó/Editó sección`);
        res.json({ success: true });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/oferta/seccion/:id', verificarToken, verificarRol(['AdminTI']), async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar que no tenga matrículas
        const check = await pool.request()
            .input('id_seccion', sql.Int, id)
            .query(`SELECT COUNT(*) as total FROM Matricula WHERE id_seccion = @id_seccion`);
        
        if (check.recordset[0].total > 0) {
            return res.status(400).json({ error: 'No se puede eliminar la sección porque tiene matrículas asociadas' });
        }
        
        await pool.request()
            .input('id_seccion', sql.Int, id)
            .query(`DELETE FROM Seccion WHERE id_seccion = @id_seccion`);
        
        await registrarAuditoriaAPI(req.usuario.id_usuario, `Eliminó sección ${id}`);
        res.json({ success: true });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== API DE MATRÍCULAS ====================

app.get('/api/matriculas/mis', verificarToken, async (req, res) => {
    try {
        const estudianteResult = await pool.request()
            .input('id_usuario', sql.Int, req.usuario.id_usuario)
            .query(`SELECT id_estudiante FROM Estudiante WHERE id_usuario = @id_usuario`);
        
        if (estudianteResult.recordset.length === 0) {
            return res.json([]);
        }
        
        const result = await pool.request()
            .input('id_estudiante', sql.Int, estudianteResult.recordset[0].id_estudiante)
            .query(`
                SELECT m.id_matricula, m.fecha, m.estado,
                       s.id_seccion, s.horario, s.aula, s.docente,
                       c.id_curso, c.codigo, c.nombre as curso_nombre, c.creditos,
                       p.nombre as periodo_nombre
                FROM Matricula m
                JOIN Seccion s ON m.id_seccion = s.id_seccion
                JOIN Curso c ON s.id_curso = c.id_curso
                JOIN Periodo p ON s.id_periodo = p.id_periodo
                WHERE m.id_estudiante = @id_estudiante
                ORDER BY m.fecha DESC
            `);
        
        res.json(result.recordset);
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/matriculas', verificarToken, async (req, res) => {
    try {
        const { secciones_ids } = req.body;
        
        if (!secciones_ids || secciones_ids.length === 0) {
            return res.status(400).json({ error: 'Debe seleccionar al menos una sección' });
        }
        
        // Obtener estudiante
        const estudianteResult = await pool.request()
            .input('id_usuario', sql.Int, req.usuario.id_usuario)
            .query(`SELECT id_estudiante FROM Estudiante WHERE id_usuario = @id_usuario`);
        
        if (estudianteResult.recordset.length === 0) {
            return res.status(400).json({ error: 'No se encontró información del estudiante' });
        }
        
        const id_estudiante = estudianteResult.recordset[0].id_estudiante;
        
        // Verificar deuda
        const deudaResult = await pool.request()
            .input('id_estudiante', sql.Int, id_estudiante)
            .query(`SELECT SUM(monto) as deuda FROM Factura WHERE id_estudiante = @id_estudiante AND estado = 'Pendiente'`);
        
        if (deudaResult.recordset[0].deuda > 0) {
            return res.status(400).json({ error: 'No puede matricularse porque tiene una deuda pendiente' });
        }
        
        let totalCreditos = 0;
        const matriculasCreadas = [];
        
        for (const id_seccion of secciones_ids) {
            // Verificar cupo
            const cupoResult = await pool.request()
                .input('id_seccion', sql.Int, id_seccion)
                .query(`
                    SELECT s.cupo, COUNT(m.id_matricula) as inscritos
                    FROM Seccion s
                    LEFT JOIN Matricula m ON s.id_seccion = m.id_seccion AND m.estado IN ('Pendiente', 'Confirmada')
                    WHERE s.id_seccion = @id_seccion
                    GROUP BY s.cupo
                `);
            
            if (cupoResult.recordset.length > 0) {
                const disponibles = cupoResult.recordset[0].cupo - cupoResult.recordset[0].inscritos;
                if (disponibles <= 0) {
                    return res.status(400).json({ error: `No hay cupos disponibles para una de las secciones seleccionadas` });
                }
            }
            
            // Obtener créditos del curso
            const cursoResult = await pool.request()
                .input('id_seccion', sql.Int, id_seccion)
                .query(`
                    SELECT c.creditos FROM Seccion s
                    JOIN Curso c ON s.id_curso = c.id_curso
                    WHERE s.id_seccion = @id_seccion
                `);
            
            if (cursoResult.recordset.length > 0) {
                totalCreditos += cursoResult.recordset[0].creditos;
            }
            
            // Crear matrícula
            const insertResult = await pool.request()
                .input('id_estudiante', sql.Int, id_estudiante)
                .input('id_seccion', sql.Int, id_seccion)
                .input('fecha', sql.Date, new Date())
                .query(`
                    INSERT INTO Matricula (id_estudiante, id_seccion, fecha, estado)
                    VALUES (@id_estudiante, @id_seccion, @fecha, 'Pendiente');
                    SELECT SCOPE_IDENTITY() as id_matricula;
                `);
            
            matriculasCreadas.push(insertResult.recordset[0].id_matricula);
        }
        
        // Calcular monto y crear factura
        const monto = totalCreditos * 60000;
        const facturaResult = await pool.request()
            .input('id_estudiante', sql.Int, id_estudiante)
            .input('monto', sql.Decimal(10,2), monto)
            .input('fecha_emision', sql.Date, new Date())
            .query(`
                INSERT INTO Factura (id_estudiante, monto, fecha_emision, estado)
                VALUES (@id_estudiante, @monto, @fecha_emision, 'Pendiente');
                SELECT SCOPE_IDENTITY() as id_factura;
            `);
        
        await registrarAuditoriaAPI(req.usuario.id_usuario, `Realizó matrícula con ${secciones_ids.length} cursos`);
        
        res.json({ 
            success: true, 
            id_matriculas: matriculasCreadas,
            id_factura: facturaResult.recordset[0].id_factura,
            monto_total: monto
        });
        
    } catch (error) {
        console.error('Error en matrícula:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== API DE PAGOS ====================

app.get('/api/pagos/mis-facturas', verificarToken, async (req, res) => {
    try {
        const estudianteResult = await pool.request()
            .input('id_usuario', sql.Int, req.usuario.id_usuario)
            .query(`SELECT id_estudiante FROM Estudiante WHERE id_usuario = @id_usuario`);
        
        if (estudianteResult.recordset.length === 0) {
            return res.json([]);
        }
        
        const result = await pool.request()
            .input('id_estudiante', sql.Int, estudianteResult.recordset[0].id_estudiante)
            .query(`
                SELECT f.id_factura, f.monto, f.fecha_emision, f.estado,
                       (SELECT SUM(p.monto) FROM Pago p WHERE p.id_factura = f.id_factura) as pagado
                FROM Factura f
                WHERE f.id_estudiante = @id_estudiante
                ORDER BY f.fecha_emision DESC
            `);
        
        res.json(result.recordset);
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/pagos/procesar', verificarToken, async (req, res) => {
    try {
        const { id_factura, metodo, referencia } = req.body;
        
        // Obtener factura
        const facturaResult = await pool.request()
            .input('id_factura', sql.Int, id_factura)
            .query(`SELECT id_estudiante, monto, estado FROM Factura WHERE id_factura = @id_factura`);
        
        if (facturaResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Factura no encontrada' });
        }
        
        const factura = facturaResult.recordset[0];
        
        if (factura.estado === 'Pagada') {
            return res.status(400).json({ error: 'La factura ya fue pagada' });
        }
        
        // Registrar pago
        await pool.request()
            .input('id_factura', sql.Int, id_factura)
            .input('fecha', sql.Date, new Date())
            .input('monto', sql.Decimal(10,2), factura.monto)
            .input('metodo', sql.NVarChar, metodo)
            .query(`
                INSERT INTO Pago (id_factura, fecha, monto, metodo)
                VALUES (@id_factura, @fecha, @monto, @metodo)
            `);
        
        // Actualizar factura
        await pool.request()
            .input('id_factura', sql.Int, id_factura)
            .query(`UPDATE Factura SET estado = 'Pagada' WHERE id_factura = @id_factura`);
        
        // Actualizar matrículas pendientes a confirmadas
        const estudiante = factura.id_estudiante;
        await pool.request()
            .input('id_estudiante', sql.Int, estudiante)
            .query(`
                UPDATE Matricula SET estado = 'Confirmada' 
                WHERE id_estudiante = @id_estudiante AND estado = 'Pendiente'
            `);
        
        await registrarAuditoriaAPI(req.usuario.id_usuario, `Realizó pago de factura ${id_factura}`);
        
        res.json({ success: true, message: 'Pago procesado exitosamente' });
        
    } catch (error) {
        console.error('Error en pago:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== API DE REPORTES ====================

app.get('/api/reportes/matriculas', verificarToken, verificarRol(['AdminTI', 'Registro']), async (req, res) => {
    try {
        const result = await pool.request().query(`
            SELECT m.id_matricula, u.nombre as estudiante, e.carnet, c.codigo as curso, 
                   m.fecha, m.estado, p.nombre as periodo
            FROM Matricula m
            JOIN Estudiante e ON m.id_estudiante = e.id_estudiante
            JOIN Usuario u ON e.id_usuario = u.id_usuario
            JOIN Seccion s ON m.id_seccion = s.id_seccion
            JOIN Curso c ON s.id_curso = c.id_curso
            JOIN Periodo p ON s.id_periodo = p.id_periodo
            ORDER BY m.fecha DESC
        `);
        res.json(result.recordset);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/reportes/financieros', verificarToken, verificarRol(['AdminTI', 'Tesoreria']), async (req, res) => {
    try {
        const result = await pool.request().query(`
            SELECT f.id_factura, u.nombre as estudiante, f.monto, f.fecha_emision, f.estado,
                   ISNULL(p.monto, 0) as pagado, p.metodo, p.fecha as fecha_pago
            FROM Factura f
            JOIN Estudiante e ON f.id_estudiante = e.id_estudiante
            JOIN Usuario u ON e.id_usuario = u.id_usuario
            LEFT JOIN Pago p ON f.id_factura = p.id_factura
            ORDER BY f.fecha_emision DESC
        `);
        res.json(result.recordset);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== API DE CATÁLOGOS ====================

app.get('/api/catalogos/cursos', verificarToken, async (req, res) => {
    try {
        const result = await pool.request().query(`
            SELECT c.id_curso, c.codigo, c.nombre, c.creditos, p.nombre as programa
            FROM Curso c
            JOIN ProgramaAcademico p ON c.id_programa = p.id_programa
            ORDER BY c.codigo
        `);
        res.json(result.recordset);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/catalogos/periodos', verificarToken, async (req, res) => {
    try {
        const result = await pool.request().query(`
            SELECT id_periodo, nombre, fecha_inicio, fecha_fin, estado
            FROM Periodo
            ORDER BY fecha_inicio DESC
        `);
        res.json(result.recordset);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/catalogos/programas', verificarToken, async (req, res) => {
    try {
        const result = await pool.request().query(`
            SELECT id_programa, nombre, nivel
            FROM ProgramaAcademico
        `);
        res.json(result.recordset);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== UTILIDADES ====================

async function registrarAuditoriaAPI(id_usuario, accion) {
    try {
        await pool.request()
            .input('id_usuario', sql.Int, id_usuario)
            .input('accion', sql.NVarChar, accion)
            .query(`INSERT INTO Auditoria (id_usuario, accion, fecha) VALUES (@id_usuario, @accion, GETDATE())`);
    } catch (error) {
        console.error('Error registrando auditoría:', error);
    }
}

// ==================== INICIAR SERVIDOR ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor API corriendo en http://localhost:${PORT}`);
    console.log(`📡 Endpoints disponibles:`);
    console.log(`   POST   /api/auth/login`);
    console.log(`   GET    /api/dashboard/stats`);
    console.log(`   GET    /api/oferta/secciones`);
    console.log(`   POST   /api/matriculas`);
    console.log(`   GET    /api/pagos/mis-facturas`);
    console.log(`   POST   /api/pagos/procesar`);
    console.log(`   GET    /api/reportes/matriculas`);
    console.log(`   GET    /api/reportes/financieros`);
});