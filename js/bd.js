// Importación de módulos
const express = require('express');
const sql = require('mssql');
const cors = require('cors');
require('dotenv').config();

// Crear aplicación Express
const app = express();
app.use(cors());
app.use(express.json());

// Configuración de conexión a SQL Server
// Configuración correcta
const dbConfig = {
    DB_USER: "garit",
    DB_PASSWORD: "1234",
    DB_HOST: "GARITA\\PRINCIPAL",   // el backslash debe ir doble
    DB_DATABASE: "NombreDeTuBase",
    DB_PORT: 1433,
    options: {
        encrypt: true,              // Para Azure o conexiones seguras
        trustServerCertificate: true // Cambia a false en producción
    }
};


// Pool de conexiones global
let poolPromise = null;

async function getPool() {
    if (!poolPromise) {
        poolPromise = sql.connect(dbConfig);
    }
    return poolPromise;
}

// ========== ENDPOINTS DE AUTENTICACIÓN ==========

/**
 * Login: recibe correo electrónico, busca el usuario y devuelve sus datos + rol
 * POST /api/login
 * Body: { correo: "usuario@universidad.edu" }
 */
app.post('/api/login', async (req, res) => {
    const { correo } = req.body;
    if (!correo) {
        return res.status(400).json({ error: 'Correo es requerido' });
    }

    try {
        const pool = await getPool();
        // Consulta que une Usuario, Rol y (si es estudiante) también datos de deuda
        const result = await pool.request()
            .input('correo', sql.NVarChar, correo)
            .query(`
                SELECT 
                    u.id_usuario, u.nombre, u.correo_institucional, u.estado,
                    r.id_rol, r.nombre AS rol_nombre,
                    e.id_estudiante, e.carnet, e.estado_academico, 
                    e.tiene_deuda, e.monto_deuda
                FROM Usuario u
                INNER JOIN Rol r ON u.id_rol = r.id_rol
                LEFT JOIN Estudiante e ON u.id_usuario = e.id_usuario
                WHERE u.correo_institucional = @correo AND u.estado = 'Activo'
            `);

        if (result.recordset.length === 0) {
            return res.status(401).json({ error: 'Credenciales inválidas o usuario inactivo' });
        }

        const usuario = result.recordset[0];
        // Registrar auditoría de login
        await pool.request()
            .input('id_usuario', sql.Int, usuario.id_usuario)
            .input('accion', sql.NVarChar, 'Inicio de sesión exitoso')
            .query(`INSERT INTO Auditoria (id_usuario, accion) VALUES (@id_usuario, @accion)`);

        res.json({
            success: true,
            usuario: {
                id_usuario: usuario.id_usuario,
                nombre: usuario.nombre,
                correo: usuario.correo_institucional,
                rol: usuario.rol_nombre,
                id_rol: usuario.id_rol,
                // Datos de estudiante (pueden ser null si es admin)
                id_estudiante: usuario.id_estudiante,
                carnet: usuario.carnet,
                tiene_deuda: usuario.tiene_deuda === 1,
                monto_deuda: usuario.monto_deuda || 0
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ========== ENDPOINTS PARA OFERTA ACADÉMICA (SECCIONES) ==========

/**
 * Obtener todas las secciones del periodo activo, con datos del curso y programa
 * GET /api/secciones?periodoId=1 (opcional)
 */
app.get('/api/secciones', async (req, res) => {
    const periodoId = req.query.periodoId || null;
    try {
        const pool = await getPool();
        let query = `
            SELECT 
                s.id_seccion, s.docente, s.aula, s.horario, s.cupo, s.inscritos,
                (s.cupo - s.inscritos) AS disponibles,
                c.id_curso, c.codigo, c.nombre, c.creditos,
                p.id_programa, p.nombre AS programa_nombre,
                pe.id_periodo, pe.nombre AS periodo_nombre
            FROM Seccion s
            INNER JOIN Curso c ON s.id_curso = c.id_curso
            INNER JOIN ProgramaAcademico p ON c.id_programa = p.id_programa
            INNER JOIN Periodo pe ON s.id_periodo = pe.id_periodo
            WHERE pe.estado = 'Activo'
        `;
        if (periodoId) {
            query += ` AND pe.id_periodo = @periodoId`;
        }
        const request = pool.request();
        if (periodoId) {
            request.input('periodoId', sql.Int, periodoId);
        }
        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener secciones' });
    }
});

/**
 * Crear nueva sección (solo admin)
 * POST /api/secciones
 * Body: { id_curso, id_periodo, docente, aula, horario, cupo }
 */
app.post('/api/secciones', async (req, res) => {
    const { id_curso, id_periodo, docente, aula, horario, cupo } = req.body;
    if (!id_curso || !id_periodo || !cupo) {
        return res.status(400).json({ error: 'Faltan datos obligatorios' });
    }
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('id_curso', sql.Int, id_curso)
            .input('id_periodo', sql.Int, id_periodo)
            .input('docente', sql.NVarChar, docente || '')
            .input('aula', sql.NVarChar, aula || '')
            .input('horario', sql.NVarChar, horario || '')
            .input('cupo', sql.Int, cupo)
            .query(`
                INSERT INTO Seccion (id_curso, id_periodo, docente, aula, horario, cupo, inscritos)
                VALUES (@id_curso, @id_periodo, @docente, @aula, @horario, @cupo, 0);
                SELECT SCOPE_IDENTITY() AS id_seccion;
            `);
        res.json({ success: true, id_seccion: result.recordset[0].id_seccion });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al crear sección' });
    }
});

// ========== ENDPOINTS PARA MATRÍCULAS ==========

/**
 * Obtener matrículas del estudiante autenticado (o todas si es admin)
 * GET /api/matriculas?estudianteId=xxx
 */
app.get('/api/matriculas', async (req, res) => {
    const { estudianteId, rol } = req.query;
    try {
        const pool = await getPool();
        let query = `
            SELECT 
                m.id_matricula, m.fecha, m.estado,
                s.id_seccion, s.horario, s.aula, s.docente,
                c.id_curso, c.codigo, c.nombre, c.creditos,
                pe.nombre AS periodo_nombre,
                u.nombre AS estudiante_nombre
            FROM Matricula m
            INNER JOIN Seccion s ON m.id_seccion = s.id_seccion
            INNER JOIN Curso c ON s.id_curso = c.id_curso
            INNER JOIN Periodo pe ON s.id_periodo = pe.id_periodo
            INNER JOIN Estudiante e ON m.id_estudiante = e.id_estudiante
            INNER JOIN Usuario u ON e.id_usuario = u.id_usuario
        `;
        if (estudianteId && rol !== 'AdminTI') {
            query += ` WHERE e.id_estudiante = @estudianteId`;
        }
        const request = pool.request();
        if (estudianteId && rol !== 'AdminTI') {
            request.input('estudianteId', sql.Int, estudianteId);
        }
        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener matrículas' });
    }
});

/**
 * Registrar nueva matrícula (varias secciones a la vez)
 * POST /api/matriculas
 * Body: { id_estudiante, secciones: [id_seccion1, id_seccion2], id_usuario_auditoria }
 */
app.post('/api/matriculas', async (req, res) => {
    const { id_estudiante, secciones, id_usuario_auditoria } = req.body;
    if (!id_estudiante || !secciones || secciones.length === 0) {
        return res.status(400).json({ error: 'Datos incompletos' });
    }
    try {
        const pool = await getPool();
        // Iniciar transacción
        const transaction = new sql.Transaction(await pool);
        await transaction.begin();
        try {
            const fechaHoy = new Date().toISOString().split('T')[0];
            let totalCreditos = 0;
            // Insertar cada matrícula y actualizar inscritos
            for (const id_seccion of secciones) {
                // Obtener créditos del curso asociado a la sección
                const creditosRes = await transaction.request()
                    .input('id_seccion', sql.Int, id_seccion)
                    .query(`
                        SELECT c.creditos 
                        FROM Seccion s 
                        INNER JOIN Curso c ON s.id_curso = c.id_curso 
                        WHERE s.id_seccion = @id_seccion
                    `);
                const creditos = creditosRes.recordset[0]?.creditos || 0;
                totalCreditos += creditos;

                // Insertar matrícula
                await transaction.request()
                    .input('id_estudiante', sql.Int, id_estudiante)
                    .input('id_seccion', sql.Int, id_seccion)
                    .input('fecha', sql.Date, fechaHoy)
                    .input('estado', sql.NVarChar, 'Pendiente')
                    .query(`
                        INSERT INTO Matricula (id_estudiante, id_seccion, fecha, estado)
                        VALUES (@id_estudiante, @id_seccion, @fecha, @estado)
                    `);

                // Incrementar inscritos en la sección
                await transaction.request()
                    .input('id_seccion', sql.Int, id_seccion)
                    .query(`UPDATE Seccion SET inscritos = inscritos + 1 WHERE id_seccion = @id_seccion`);
            }

            // Crear factura asociada
            const monto = totalCreditos * 60000; // ₡60,000 por crédito
            const facturaRes = await transaction.request()
                .input('id_estudiante', sql.Int, id_estudiante)
                .input('monto', sql.Decimal(10,2), monto)
                .input('fecha_emision', sql.Date, fechaHoy)
                .input('estado', sql.NVarChar, 'Pendiente')
                .query(`
                    INSERT INTO Factura (id_estudiante, monto, fecha_emision, estado)
                    VALUES (@id_estudiante, @monto, @fecha_emision, @estado);
                    SELECT SCOPE_IDENTITY() AS id_factura;
                `);
            const id_factura = facturaRes.recordset[0].id_factura;

            // Auditoría
            await transaction.request()
                .input('id_usuario', sql.Int, id_usuario_auditoria)
                .input('accion', sql.NVarChar, `Matrícula registrada para estudiante ${id_estudiante} con ${secciones.length} secciones, factura ${id_factura}`)
                .query(`INSERT INTO Auditoria (id_usuario, accion) VALUES (@id_usuario, @accion)`);

            await transaction.commit();
            res.json({ success: true, id_factura, monto });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al procesar matrícula' });
    }
});

// ========== ENDPOINTS PARA FACTURAS Y PAGOS ==========

/**
 * Obtener facturas de un estudiante (o todas para admin)
 * GET /api/facturas?estudianteId=xxx&rol=AdminTI
 */
app.get('/api/facturas', async (req, res) => {
    const { estudianteId, rol } = req.query;
    try {
        const pool = await getPool();
        let query = `
            SELECT 
                f.id_factura, f.monto, f.fecha_emision, f.estado,
                e.id_estudiante, u.nombre AS estudiante_nombre
            FROM Factura f
            INNER JOIN Estudiante e ON f.id_estudiante = e.id_estudiante
            INNER JOIN Usuario u ON e.id_usuario = u.id_usuario
        `;
        if (estudianteId && rol !== 'AdminTI') {
            query += ` WHERE e.id_estudiante = @estudianteId`;
        }
        const request = pool.request();
        if (estudianteId && rol !== 'AdminTI') {
            request.input('estudianteId', sql.Int, estudianteId);
        }
        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener facturas' });
    }
});

/**
 * Registrar un pago y actualizar factura
 * POST /api/pagos
 * Body: { id_factura, metodo, referencia, id_usuario_auditoria }
 */
app.post('/api/pagos', async (req, res) => {
    const { id_factura, metodo, referencia, id_usuario_auditoria } = req.body;
    if (!id_factura || !metodo) {
        return res.status(400).json({ error: 'Factura y método son obligatorios' });
    }
    try {
        const pool = await getPool();
        const transaction = new sql.Transaction(await pool);
        await transaction.begin();
        try {
            // Obtener monto de la factura
            const facturaRes = await transaction.request()
                .input('id_factura', sql.Int, id_factura)
                .query(`SELECT monto, id_estudiante FROM Factura WHERE id_factura = @id_factura`);
            if (facturaRes.recordset.length === 0) {
                throw new Error('Factura no encontrada');
            }
            const { monto, id_estudiante } = facturaRes.recordset[0];
            const fechaHoy = new Date().toISOString().split('T')[0];

            // Insertar pago
            await transaction.request()
                .input('id_factura', sql.Int, id_factura)
                .input('fecha', sql.Date, fechaHoy)
                .input('monto', sql.Decimal(10,2), monto)
                .input('metodo', sql.NVarChar, metodo)
                .query(`
                    INSERT INTO Pago (id_factura, fecha, monto, metodo)
                    VALUES (@id_factura, @fecha, @monto, @metodo)
                `);

            // Actualizar factura a Pagada
            await transaction.request()
                .input('id_factura', sql.Int, id_factura)
                .query(`UPDATE Factura SET estado = 'Pagada' WHERE id_factura = @id_factura`);

            // Actualizar deuda del estudiante a 0 si ya no tiene facturas pendientes
            const pendientesRes = await transaction.request()
                .input('id_estudiante', sql.Int, id_estudiante)
                .query(`SELECT COUNT(*) AS pendientes FROM Factura WHERE id_estudiante = @id_estudiante AND estado = 'Pendiente'`);
            if (pendientesRes.recordset[0].pendientes === 0) {
                await transaction.request()
                    .input('id_estudiante', sql.Int, id_estudiante)
                    .query(`UPDATE Estudiante SET tiene_deuda = 0, monto_deuda = 0 WHERE id_estudiante = @id_estudiante`);
            }

            // Auditoría
            await transaction.request()
                .input('id_usuario', sql.Int, id_usuario_auditoria)
                .input('accion', sql.NVarChar, `Pago registrado para factura ${id_factura} por ${monto}`)
                .query(`INSERT INTO Auditoria (id_usuario, accion) VALUES (@id_usuario, @accion)`);

            await transaction.commit();
            res.json({ success: true });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al procesar pago' });
    }
});

// ========== INICIAR SERVIDOR ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor backend corriendo en http://localhost:${PORT}`);
});