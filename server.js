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

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

// ==================== CONFIGURACIÓN ====================
const CONFIG = {
    LIMITE_CREDITOS_POR_PERIODO: 18,
    DIAS_GRACIA_PAGO: 30,
    COSTO_POR_CREDITO_DEFAULT: 60000
};

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
        if (pool) { try { await pool.close(); } catch(e) {} }
        console.log('Conectando a SQL Server...');
        pool = await sql.connect(dbConfig);
        const result = await pool.request().query('SELECT @@SERVERNAME as servidor, GETDATE() as fecha, DB_NAME() as db');
        console.log('✅ Conectado a SQL Server');
        console.log(`   Base de datos: ${result.recordset[0].db}`);
        if (reconnectInterval) { clearInterval(reconnectInterval); reconnectInterval = null; }
        return pool;
    } catch (err) {
        console.error('❌ Error conectando a SQL Server:', err.message);
        if (!reconnectInterval) { reconnectInterval = setInterval(() => { console.log('🔄 Reintentando...'); connectDB(); }, 10000); }
        return null;
    }
}
connectDB();

// ==================== FUNCIÓN BITÁCORA ====================
async function registrarBitacora(req, accion, entidad, id_entidad = null, detalle = null, datosAnteriores = null, datosNuevos = null) {
    try {
        if (!pool) return;
        let id_usuario = null, nombre_usuario = 'Sistema', rol_usuario = 'Sistema';
        if (req.usuario) {
            id_usuario = req.usuario.id_usuario;
            nombre_usuario = req.usuario.nombre;
            rol_usuario = req.usuario.rol;
        }
        const ip_address = req.ip || req.connection.remoteAddress || null;
        const user_agent = req.headers['user-agent'] || null;
        await pool.request()
            .input('id_usuario', sql.Int, id_usuario)
            .input('nombre_usuario', sql.NVarChar, nombre_usuario)
            .input('rol_usuario', sql.NVarChar, rol_usuario)
            .input('accion', sql.NVarChar, accion)
            .input('entidad', sql.NVarChar, entidad)
            .input('id_entidad', sql.Int, id_entidad)
            .input('detalle', sql.NVarChar, detalle)
            .input('ip_address', sql.NVarChar, ip_address)
            .input('user_agent', sql.NVarChar, user_agent)
            .input('datos_anteriores', sql.NVarChar, datosAnteriores ? JSON.stringify(datosAnteriores) : null)
            .input('datos_nuevos', sql.NVarChar, datosNuevos ? JSON.stringify(datosNuevos) : null)
            .query(`INSERT INTO bitacora_auditoria (id_usuario, nombre_usuario, rol_usuario, accion, entidad, id_entidad, detalle, ip_address, user_agent, datos_anteriores, datos_nuevos) VALUES (@id_usuario, @nombre_usuario, @rol_usuario, @accion, @entidad, @id_entidad, @detalle, @ip_address, @user_agent, @datos_anteriores, @datos_nuevos)`);
        console.log(`[BITÁCORA] ${accion} - ${entidad} por ${nombre_usuario}`);
    } catch (error) { console.error('Error registrando bitácora:', error); }
}

// ==================== FUNCIONES AUXILIARES ====================
async function obtenerCreditosSeccion(id_seccion) {
    const result = await pool.request().input('id_seccion', sql.Int, id_seccion).query(`SELECT c.creditos, s.id_periodo FROM Seccion s JOIN Curso c ON s.id_curso = c.id_curso WHERE s.id_seccion = @id_seccion`);
    if (result.recordset.length === 0) throw new Error('Sección no encontrada');
    return { creditos: result.recordset[0].creditos, id_periodo: result.recordset[0].id_periodo };
}

async function verificarLimiteCreditos(id_estudiante, id_periodo, nuevosCreditos) {
    const result = await pool.request().input('id_estudiante', sql.Int, id_estudiante).input('id_periodo', sql.Int, id_periodo).query(`SELECT SUM(c.creditos) as total_creditos_actuales FROM Matricula m JOIN Seccion s ON m.id_seccion = s.id_seccion JOIN Curso c ON s.id_curso = c.id_curso WHERE m.id_estudiante = @id_estudiante AND s.id_periodo = @id_periodo AND m.estado IN ('Confirmada', 'Pendiente')`);
    const creditosActuales = result.recordset[0]?.total_creditos_actuales || 0;
    const totalCreditos = creditosActuales + nuevosCreditos;
    return { valido: totalCreditos <= CONFIG.LIMITE_CREDITOS_POR_PERIODO, creditosActuales, creditosNuevos: nuevosCreditos, totalCreditos, limite: CONFIG.LIMITE_CREDITOS_POR_PERIODO, disponibles: CONFIG.LIMITE_CREDITOS_POR_PERIODO - creditosActuales };
}

function verificarConflictoHorario(horario1, horario2) {
    function parseHorario(horario) {
        if (!horario) return [];
        const resultados = [];
        const partes = horario.split(/[\s,]+/);
        let diasActual = [], horarioActual = null;
        const diasSemana = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
        for (let i = 0; i < partes.length; i++) {
            const parte = partes[i];
            const diaMatch = parte.match(/^(Lun|Mar|Mie|Jue|Vie|Sab|Dom)(?:-([A-Z][a-z]{2}))?$/i);
            if (diaMatch) {
                if (diasActual.length > 0 && horarioActual) resultados.push({ dias: diasActual, horario: horarioActual });
                if (diaMatch[2]) {
                    const inicio = diaMatch[1], fin = diaMatch[2];
                    const inicioIdx = diasSemana.findIndex(d => d === inicio), finIdx = diasSemana.findIndex(d => d === fin);
                    diasActual = diasSemana.slice(inicioIdx, finIdx + 1);
                } else { diasActual = [diaMatch[1]]; }
                horarioActual = null;
            }
            const horarioMatch = parte.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
            if (horarioMatch) horarioActual = { inicio: horarioMatch[1], fin: horarioMatch[2] };
        }
        if (diasActual.length > 0 && horarioActual) resultados.push({ dias: diasActual, horario: horarioActual });
        return resultados;
    }
    function horaToMinutos(hora) { const [h, m] = hora.split(':').map(Number); return h * 60 + m; }
    function haySuperposicion(rango1, rango2) {
        const inicio1 = horaToMinutos(rango1.inicio), fin1 = horaToMinutos(rango1.fin);
        const inicio2 = horaToMinutos(rango2.inicio), fin2 = horaToMinutos(rango2.fin);
        return (inicio1 < fin2 && inicio2 < fin1);
    }
    const horarios1 = parseHorario(horario1), horarios2 = parseHorario(horario2);
    for (const h1 of horarios1) for (const h2 of horarios2) {
        const diasComunes = h1.dias.filter(dia => h2.dias.includes(dia));
        if (diasComunes.length > 0 && haySuperposicion(h1.horario, h2.horario)) return true;
    }
    return false;
}

// ==================== MIDDLEWARE ====================
function verificarToken(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token no proporcionado' });
    try { req.usuario = jwt.verify(token, process.env.JWT_SECRET || 'unimatricula_secret_2025'); next(); } catch (error) { return res.status(401).json({ error: 'Token inválido' }); }
}

function verificarRol(rolesPermitidos) { return (req, res, next) => { if (!req.usuario) return res.status(401).json({ error: 'No autenticado' }); if (!rolesPermitidos.includes(req.usuario.rol)) return res.status(403).json({ error: 'Permisos insuficientes' }); next(); }; }

// ==================== HEALTH CHECK ====================
app.get('/api/health', async (req, res) => { try { if (pool) { const result = await pool.request().query('SELECT GETDATE() as fecha, DB_NAME() as database'); res.json({ status: 'OK', database: 'Conectado', fecha: result.recordset[0].fecha, nombre_db: result.recordset[0].database }); } else { res.status(503).json({ status: 'ERROR', database: 'Desconectado' }); } } catch (error) { res.status(500).json({ status: 'ERROR', message: error.message }); } });

// ==================== API DE CARRERAS ====================
app.get('/api/carreras', async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const result = await pool.request().query('SELECT id_programa, nombre, codigo FROM ProgramaAcademico ORDER BY nombre'); res.json(result.recordset); } catch (error) { console.error('Error en /carreras:', error); res.status(500).json({ error: error.message }); } });

app.post('/api/carreras', verificarToken, verificarRol(['Administrador']), async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const { nombre, codigo } = req.body; if (!nombre || !codigo) return res.status(400).json({ error: 'Nombre y código son obligatorios' }); try { const result = await pool.request().input('nombre', sql.NVarChar, nombre).input('codigo', sql.NVarChar, codigo).query(`INSERT INTO ProgramaAcademico (nombre, codigo) VALUES (@nombre, @codigo); SELECT SCOPE_IDENTITY() as id;`); await registrarBitacora(req, 'CREAR', 'Carrera', result.recordset[0].id, `Carrera creada: ${nombre} (${codigo})`); res.json({ success: true, id_programa: result.recordset[0].id }); } catch (error) { if (error.message.includes('UNIQUE')) res.status(400).json({ error: 'Ya existe una carrera con ese código' }); else throw error; } } catch (error) { res.status(500).json({ error: error.message }); } });

app.put('/api/carreras/:id', verificarToken, verificarRol(['Administrador']), async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const id = req.params.id; const { nombre, codigo } = req.body; const datosAnteriores = await pool.request().input('id', sql.Int, id).query('SELECT nombre, codigo FROM ProgramaAcademico WHERE id_programa = @id'); await pool.request().input('id', sql.Int, id).input('nombre', sql.NVarChar, nombre).input('codigo', sql.NVarChar, codigo).query(`UPDATE ProgramaAcademico SET nombre = @nombre, codigo = @codigo WHERE id_programa = @id`); await registrarBitacora(req, 'EDITAR', 'Carrera', id, `Carrera editada`, datosAnteriores.recordset[0], { nombre, codigo }); res.json({ success: true }); } catch (error) { res.status(500).json({ error: error.message }); } });

app.delete('/api/carreras/:id', verificarToken, verificarRol(['Administrador']), async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const id = req.params.id; const tieneCursos = await pool.request().input('id', sql.Int, id).query('SELECT COUNT(*) as total FROM Curso WHERE id_programa = @id'); if (tieneCursos.recordset[0].total > 0) return res.status(400).json({ error: 'No se puede eliminar una carrera con cursos asociados' }); await pool.request().input('id', sql.Int, id).query('DELETE FROM ProgramaAcademico WHERE id_programa = @id'); await registrarBitacora(req, 'ELIMINAR', 'Carrera', id, `Carrera eliminada`); res.json({ success: true }); } catch (error) { res.status(500).json({ error: error.message }); } });

// ==================== API DE CURSOS ====================
app.get('/api/cursos', async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const result = await pool.request().query(`SELECT c.id_curso, c.codigo, c.nombre, c.creditos, c.costo_credito, c.id_programa, p.nombre as programa_nombre, c.descripcion, c.estado FROM Curso c LEFT JOIN ProgramaAcademico p ON c.id_programa = p.id_programa ORDER BY c.codigo`); res.json(result.recordset); } catch (error) { console.error('Error en /cursos:', error); res.status(500).json({ error: error.message }); } });

app.get('/api/cursos/buscar', verificarToken, async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const { search, estado, id_programa } = req.query; let query = 'SELECT * FROM Curso WHERE 1=1'; if (search) query += ` AND (codigo LIKE '%${search}%' OR nombre LIKE '%${search}%')`; if (estado && estado !== 'todos') query += ` AND estado = '${estado}'`; if (id_programa) query += ` AND id_programa = ${id_programa}`; query += ' ORDER BY codigo'; const result = await pool.request().query(query); res.json(result.recordset); } catch (error) { res.status(500).json({ error: error.message }); } });

app.post('/api/cursos', verificarToken, verificarRol(['Administrador']), async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const { codigo, nombre, creditos, costo_credito, id_programa, descripcion } = req.body; if (!codigo || !nombre || !creditos) return res.status(400).json({ error: 'Código, nombre y créditos son obligatorios' }); if (creditos <= 0) return res.status(400).json({ error: 'Créditos deben ser mayores que 0' }); try { const result = await pool.request().input('codigo', sql.NVarChar, codigo).input('nombre', sql.NVarChar, nombre).input('creditos', sql.Int, creditos).input('costo_credito', sql.Decimal, costo_credito || CONFIG.COSTO_POR_CREDITO_DEFAULT).input('id_programa', sql.Int, id_programa || null).input('descripcion', sql.NVarChar, descripcion || null).query(`INSERT INTO Curso (codigo, nombre, creditos, costo_credito, id_programa, descripcion, estado) VALUES (@codigo, @nombre, @creditos, @costo_credito, @id_programa, @descripcion, 'Activo'); SELECT SCOPE_IDENTITY() as id;`); const id_curso = result.recordset[0].id; await registrarBitacora(req, 'CREAR', 'Curso', id_curso, `Curso creado: ${codigo} - ${nombre} (${creditos} créditos)`); res.json({ success: true, id_curso }); } catch (error) { if (error.message.includes('UNIQUE')) res.status(400).json({ error: 'Ya existe un curso con ese código' }); else throw error; } } catch (error) { res.status(500).json({ error: error.message }); } });

app.put('/api/cursos/:id', verificarToken, verificarRol(['Administrador']), async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const id_curso = req.params.id; const datosAnteriores = await pool.request().input('id_curso', sql.Int, id_curso).query('SELECT codigo, nombre, creditos, costo_credito, id_programa, descripcion FROM Curso WHERE id_curso = @id_curso'); const { codigo, nombre, creditos, costo_credito, id_programa, descripcion } = req.body; await pool.request().input('id_curso', sql.Int, id_curso).input('codigo', sql.NVarChar, codigo).input('nombre', sql.NVarChar, nombre).input('creditos', sql.Int, creditos).input('costo_credito', sql.Decimal, costo_credito).input('id_programa', sql.Int, id_programa).input('descripcion', sql.NVarChar, descripcion).query(`UPDATE Curso SET codigo = @codigo, nombre = @nombre, creditos = @creditos, costo_credito = @costo_credito, id_programa = @id_programa, descripcion = @descripcion WHERE id_curso = @id_curso`); await registrarBitacora(req, 'EDITAR', 'Curso', id_curso, `Curso editado: ${codigo}`, datosAnteriores.recordset[0], { codigo, nombre, creditos, costo_credito, id_programa, descripcion }); res.json({ success: true }); } catch (error) { res.status(500).json({ error: error.message }); } });

app.put('/api/cursos/:id/estado', verificarToken, verificarRol(['Administrador']), async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const id_curso = req.params.id; const { estado } = req.body; if (estado === 'Inactivo') { const planResult = await pool.request().input('id_curso', sql.Int, id_curso).query('SELECT COUNT(*) as total FROM plan_estudio_curso WHERE id_curso = @id_curso'); const matriculaResult = await pool.request().input('id_curso', sql.Int, id_curso).query('SELECT COUNT(*) as total FROM matricula_detalle WHERE id_curso = @id_curso'); if (planResult.recordset[0].total > 0 || matriculaResult.recordset[0].total > 0) { await pool.request().input('id_curso', sql.Int, id_curso).input('estado', sql.NVarChar, estado).query('UPDATE Curso SET estado = @estado WHERE id_curso = @id_curso'); await registrarBitacora(req, 'INACTIVAR', 'Curso', id_curso, `Curso inactivado (tiene asociaciones)`); return res.json({ success: true, message: 'Curso inactivado' }); } } await pool.request().input('id_curso', sql.Int, id_curso).input('estado', sql.NVarChar, estado).query('UPDATE Curso SET estado = @estado WHERE id_curso = @id_curso'); await registrarBitacora(req, estado === 'Activo' ? 'ACTIVAR' : 'INACTIVAR', 'Curso', id_curso, `Curso ${estado === 'Activo' ? 'activado' : 'inactivado'}`); res.json({ success: true }); } catch (error) { res.status(500).json({ error: error.message }); } });

// ==================== API DE PERIODOS ====================
app.get('/api/periodos', async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const result = await pool.request().query(`SELECT id_periodo, nombre, anio, fecha_inicio, fecha_fin, estado as activo FROM PeriodoAcademico ORDER BY anio DESC, id_periodo DESC`); res.json(result.recordset); } catch (error) { console.error('Error en /periodos:', error); res.status(500).json({ error: error.message }); } });

// ==================== API DE AUTENTICACIÓN ====================
app.post('/api/auth/login', async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const { email, password } = req.body; const result = await pool.request().input('email', sql.NVarChar, email).query(`SELECT u.id_usuario, u.nombre, u.correo_institucional, u.estado, r.nombre as rol_nombre, r.id_rol FROM Usuario u JOIN Rol r ON u.id_rol = r.id_rol WHERE u.correo_institucional = @email`); let usuario = result.recordset[0]; if (!usuario) { await registrarBitacora(req, 'LOGIN_FALLIDO', 'Usuario', null, `Intento de login con email: ${email}`); return res.status(401).json({ error: 'Credenciales inválidas' }); } const token = jwt.sign({ id_usuario: usuario.id_usuario, nombre: usuario.nombre, rol: usuario.rol_nombre, id_rol: usuario.id_rol }, process.env.JWT_SECRET || 'unimatricula_secret_2025', { expiresIn: '8h' }); await registrarBitacora(req, 'LOGIN_EXITOSO', 'Usuario', usuario.id_usuario, `Usuario ${usuario.nombre} inició sesión`); res.json({ success: true, token, usuario: { id_usuario: usuario.id_usuario, nombre: usuario.nombre, email: usuario.correo_institucional, rol: usuario.rol_nombre, id_rol: usuario.id_rol } }); } catch (error) { console.error('Error en login:', error); res.status(500).json({ error: error.message }); } });

app.post('/api/auth/register', async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const { nombre, email, carnet, password, id_programa } = req.body; const existingUser = await pool.request().input('email', sql.NVarChar, email).query('SELECT id_usuario FROM Usuario WHERE correo_institucional = @email'); if (existingUser.recordset.length > 0) return res.status(400).json({ error: 'El correo ya está registrado' }); const hashedPassword = await bcrypt.hash(password, 10); const insertResult = await pool.request().input('nombre', sql.NVarChar, nombre).input('email', sql.NVarChar, email).input('password', sql.NVarChar, hashedPassword).input('id_rol', sql.Int, 1).query(`INSERT INTO Usuario (nombre, correo_institucional, contrasena_hash, id_rol, estado) VALUES (@nombre, @email, @password, @id_rol, 'Activo'); SELECT SCOPE_IDENTITY() as id_usuario;`); const newUserId = insertResult.recordset[0].id_usuario; await pool.request().input('id_usuario', sql.Int, newUserId).input('carnet', sql.NVarChar, carnet).input('id_programa', sql.Int, id_programa || 1).query(`INSERT INTO Estudiante (id_usuario, carnet, estado_academico, id_programa) VALUES (@id_usuario, @carnet, 'Activo', @id_programa)`); await registrarBitacora(req, 'CREAR', 'Usuario', newUserId, `Usuario registrado: ${nombre} (${email})`); res.json({ success: true, message: 'Usuario registrado exitosamente' }); } catch (error) { console.error('Error en register:', error); res.status(500).json({ error: error.message }); } });

app.get('/api/auth/estudiante', verificarToken, async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const result = await pool.request().input('id_usuario', sql.Int, req.usuario.id_usuario).query(`SELECT e.id_estudiante, e.carnet, e.estado_academico, e.id_programa, ISNULL((SELECT SUM(f.monto) FROM Factura f WHERE f.id_estudiante = e.id_estudiante AND f.estado = 'Pendiente'), 0) as montoDeuda FROM Estudiante e WHERE e.id_usuario = @id_usuario`); res.json({ success: true, estudiante: result.recordset[0] || null }); } catch (error) { res.status(500).json({ error: error.message }); } });

// ==================== API DE OFERTA ====================
app.get('/api/oferta/secciones', verificarToken, async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const { periodo_id } = req.query; const result = await pool.request().input('periodo_id', sql.Int, periodo_id || 1).query(`SELECT s.id_seccion, s.id_curso, s.id_periodo, s.docente, s.aula, s.horario, s.cupo, s.numero_seccion, ISNULL(s.cupo - (SELECT COUNT(*) FROM Matricula m WHERE m.id_seccion = s.id_seccion AND m.estado IN ('Confirmada', 'Pendiente')), s.cupo) as disponibles, c.codigo, c.nombre as curso_nombre, c.creditos, c.costo_credito, p.nombre as programa_nombre, p.id_programa, pa.nombre as periodo_nombre FROM Seccion s JOIN Curso c ON s.id_curso = c.id_curso JOIN ProgramaAcademico p ON c.id_programa = p.id_programa JOIN PeriodoAcademico pa ON s.id_periodo = pa.id_periodo WHERE (@periodo_id IS NULL OR s.id_periodo = @periodo_id) ORDER BY c.codigo`); res.json(result.recordset); } catch (error) { console.error('Error en /oferta/secciones:', error); res.status(500).json({ error: error.message }); } });

// ==================== API DE MATRÍCULAS ====================
app.get('/api/matriculas/mis-matriculas', verificarToken, async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const result = await pool.request().input('id_usuario', sql.Int, req.usuario.id_usuario).query(`SELECT m.id_matricula, m.id_seccion, m.fecha_matricula, m.estado, c.id_curso, c.codigo, c.nombre as curso_nombre, c.creditos, s.docente, s.aula, s.horario, (c.creditos * c.costo_credito) as monto, pa.nombre as periodo_nombre, pa.anio as periodo_anio FROM Matricula m JOIN Seccion s ON m.id_seccion = s.id_seccion JOIN Curso c ON s.id_curso = c.id_curso JOIN PeriodoAcademico pa ON s.id_periodo = pa.id_periodo JOIN Estudiante e ON m.id_estudiante = e.id_estudiante JOIN Usuario u ON e.id_usuario = u.id_usuario WHERE u.id_usuario = @id_usuario AND m.estado != 'Cancelada' ORDER BY m.fecha_matricula DESC`); res.json(result.recordset); } catch (error) { console.error('Error en /matriculas/mis-matriculas:', error); res.status(500).json({ error: error.message }); } });

app.post('/api/matriculas', verificarToken, async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const { id_seccion } = req.body; const estudianteResult = await pool.request().input('id_usuario', sql.Int, req.usuario.id_usuario).query('SELECT id_estudiante FROM Estudiante WHERE id_usuario = @id_usuario'); if (estudianteResult.recordset.length === 0) return res.status(400).json({ error: 'No se encontró información del estudiante' }); const id_estudiante = estudianteResult.recordset[0].id_estudiante; const seccionInfo = await obtenerCreditosSeccion(id_seccion); const creditosNuevos = seccionInfo.creditos; const id_periodo = seccionInfo.id_periodo; const cupoCheck = await pool.request().input('id_seccion', sql.Int, id_seccion).query(`SELECT s.cupo, COUNT(m.id_matricula) as matriculados FROM Seccion s LEFT JOIN Matricula m ON s.id_seccion = m.id_seccion AND m.estado IN ('Confirmada', 'Pendiente') WHERE s.id_seccion = @id_seccion GROUP BY s.cupo`); if (cupoCheck.recordset.length > 0) { const disponibles = cupoCheck.recordset[0].cupo - cupoCheck.recordset[0].matriculados; if (disponibles <= 0) return res.status(400).json({ error: 'No hay cupos disponibles' }); } const yaMatriculado = await pool.request().input('id_estudiante', sql.Int, id_estudiante).input('id_seccion', sql.Int, id_seccion).query(`SELECT id_matricula FROM Matricula WHERE id_estudiante = @id_estudiante AND id_seccion = @id_seccion AND estado IN ('Confirmada', 'Pendiente')`); if (yaMatriculado.recordset.length > 0) return res.status(400).json({ error: 'Ya está matriculado en esta sección' }); const yaCurso = await pool.request().input('id_estudiante', sql.Int, id_estudiante).input('id_seccion', sql.Int, id_seccion).query(`SELECT m.id_matricula FROM Matricula m JOIN Seccion s ON m.id_seccion = s.id_seccion JOIN Seccion s2 ON s2.id_seccion = @id_seccion WHERE m.id_estudiante = @id_estudiante AND s.id_curso = s2.id_curso AND s.id_periodo = s2.id_periodo AND m.estado IN ('Confirmada', 'Pendiente')`); if (yaCurso.recordset.length > 0) return res.status(400).json({ error: 'Ya está matriculado en este curso en el período actual' }); const nuevaSeccion = await pool.request().input('id_seccion', sql.Int, id_seccion).query(`SELECT s.horario FROM Seccion s WHERE s.id_seccion = @id_seccion`); const nuevoHorario = nuevaSeccion.recordset[0]?.horario || ''; const seccionesActuales = await pool.request().input('id_estudiante', sql.Int, id_estudiante).input('id_periodo', sql.Int, id_periodo).query(`SELECT s.horario, s.id_seccion, c.nombre as curso_nombre FROM Matricula m JOIN Seccion s ON m.id_seccion = s.id_seccion JOIN Curso c ON s.id_curso = c.id_curso WHERE m.id_estudiante = @id_estudiante AND s.id_periodo = @id_periodo AND m.estado IN ('Confirmada', 'Pendiente')`); for (const seccion of seccionesActuales.recordset) { if (verificarConflictoHorario(nuevoHorario, seccion.horario)) { return res.status(400).json({ error: `Conflicto de horario con el curso "${seccion.curso_nombre}" (Horario: ${seccion.horario})` }); } } const limiteCheck = await verificarLimiteCreditos(id_estudiante, id_periodo, creditosNuevos); if (!limiteCheck.valido) { return res.status(400).json({ error: `Límite de créditos excedido. Actualmente tiene ${limiteCheck.creditosActuales} créditos. No puede agregar ${creditosNuevos} créditos (límite ${CONFIG.LIMITE_CREDITOS_POR_PERIODO}). Quedan ${limiteCheck.disponibles} créditos.` }); } const cursoInfo = await pool.request().input('id_seccion', sql.Int, id_seccion).query(`SELECT c.id_curso, c.nombre, c.creditos, c.costo_credito FROM Seccion s JOIN Curso c ON s.id_curso = c.id_curso WHERE s.id_seccion = @id_seccion`); const monto = cursoInfo.recordset[0].creditos * cursoInfo.recordset[0].costo_credito; const result = await pool.request().input('id_estudiante', sql.Int, id_estudiante).input('id_seccion', sql.Int, id_seccion).input('estado', sql.NVarChar, 'Confirmada').query(`INSERT INTO Matricula (id_estudiante, id_seccion, fecha_matricula, estado) VALUES (@id_estudiante, @id_seccion, GETDATE(), @estado); SELECT SCOPE_IDENTITY() as id_matricula;`); const id_matricula = result.recordset[0].id_matricula; await registrarBitacora(req, 'MATRICULAR', 'Matricula', id_matricula, `Estudiante matriculado en sección ${id_seccion} (${creditosNuevos} créditos)`); const fechaVencimiento = new Date(Date.now() + CONFIG.DIAS_GRACIA_PAGO * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; await pool.request().input('id_estudiante', sql.Int, id_estudiante).input('monto', sql.Decimal(10,2), monto).input('fecha_vencimiento', sql.Date, fechaVencimiento).query(`INSERT INTO Factura (id_estudiante, monto, fecha_emision, fecha_vencimiento, estado) VALUES (@id_estudiante, @monto, GETDATE(), @fecha_vencimiento, 'Pendiente')`); res.json({ success: true, id_matricula, message: `Matrícula registrada. Total créditos: ${limiteCheck.totalCreditos}/${CONFIG.LIMITE_CREDITOS_POR_PERIODO}` }); } catch (error) { console.error('Error en /matriculas:', error); res.status(500).json({ error: error.message }); } });

app.delete('/api/matriculas/:id', verificarToken, async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const id_matricula = req.params.id; const matriculaInfo = await pool.request().input('id_matricula', sql.Int, id_matricula).query(`SELECT m.id_seccion, m.id_estudiante, s.id_periodo FROM Matricula m JOIN Seccion s ON m.id_seccion = s.id_seccion WHERE m.id_matricula = @id_matricula`); if (matriculaInfo.recordset.length === 0) return res.status(404).json({ error: 'Matrícula no encontrada' }); const pagadoCheck = await pool.request().input('id_matricula', sql.Int, id_matricula).query(`SELECT f.id_factura FROM Factura f JOIN Matricula m ON f.id_estudiante = m.id_estudiante JOIN Pago p ON p.id_factura = f.id_factura WHERE m.id_matricula = @id_matricula AND f.estado = 'Pagada' AND p.estado = 'Completado'`); if (pagadoCheck.recordset.length > 0) return res.status(400).json({ error: 'No se puede cancelar la matrícula porque ya fue pagada' }); await pool.request().input('id_matricula', sql.Int, id_matricula).query(`UPDATE Matricula SET estado = 'Cancelada' WHERE id_matricula = @id_matricula`); await registrarBitacora(req, 'CANCELAR_MATRICULA', 'Matricula', id_matricula, `Matrícula ${id_matricula} cancelada`); res.json({ success: true, message: 'Matrícula cancelada exitosamente' }); } catch (error) { console.error('Error eliminando matrícula:', error); res.status(500).json({ error: error.message }); } });

// ==================== API DE PAGOS ====================
app.get('/api/pagos/mis-facturas', verificarToken, async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const result = await pool.request().input('id_usuario', sql.Int, req.usuario.id_usuario).query(`SELECT f.id_factura, f.monto, f.fecha_emision, f.fecha_vencimiento, f.estado, 'Matrícula' as concepto FROM Factura f JOIN Estudiante e ON f.id_estudiante = e.id_estudiante JOIN Usuario u ON e.id_usuario = u.id_usuario WHERE u.id_usuario = @id_usuario ORDER BY f.fecha_vencimiento ASC`); res.json(result.recordset); } catch (error) { console.error('Error en /pagos/mis-facturas:', error); res.status(500).json({ error: error.message }); } });

app.post('/api/pagos/procesar', verificarToken, async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const { id_factura, metodo_pago, referencia } = req.body; const facturaResult = await pool.request().input('id_factura', sql.Int, id_factura).query(`SELECT monto, id_estudiante FROM Factura WHERE id_factura = @id_factura AND estado = 'Pendiente'`); if (facturaResult.recordset.length === 0) return res.status(400).json({ error: 'Factura no encontrada o ya pagada' }); const { monto, id_estudiante } = facturaResult.recordset[0]; await pool.request().input('id_factura', sql.Int, id_factura).input('monto', sql.Decimal(10,2), monto).input('metodo_pago', sql.NVarChar, metodo_pago).input('referencia', sql.NVarChar, referencia || 'N/A').query(`INSERT INTO Pago (id_factura, monto, fecha_pago, metodo_pago, referencia, estado) VALUES (@id_factura, @monto, GETDATE(), @metodo_pago, @referencia, 'Completado')`); await pool.request().input('id_factura', sql.Int, id_factura).query(`UPDATE Factura SET estado = 'Pagada', fecha_pago = GETDATE() WHERE id_factura = @id_factura`); await registrarBitacora(req, 'PAGO_REALIZADO', 'Factura', id_factura, `Pago de ${monto.toLocaleString()} realizado con ${metodo_pago}`); res.json({ success: true, message: 'Pago procesado exitosamente' }); } catch (error) { console.error('Error en /pagos/procesar:', error); res.status(500).json({ error: error.message }); } });

// ==================== API DE PLANES DE ESTUDIO ====================
app.get('/api/planes', verificarToken, async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const result = await pool.request().query(`SELECT p.*, COUNT(pc.id_plan_curso) as total_cursos FROM plan_estudio p LEFT JOIN plan_estudio_curso pc ON p.id_plan = pc.id_plan AND pc.estado = 'Activo' GROUP BY p.id_plan, p.nombre_plan, p.carrera, p.fecha_creacion, p.estado ORDER BY p.fecha_creacion DESC`); res.json(result.recordset); } catch (error) { res.status(500).json({ error: error.message }); } });

app.post('/api/planes', verificarToken, verificarRol(['Administrador']), async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const { nombre_plan, carrera } = req.body; if (!nombre_plan || !carrera) return res.status(400).json({ error: 'Nombre y carrera son obligatorios' }); try { const result = await pool.request().input('nombre_plan', sql.NVarChar, nombre_plan).input('carrera', sql.NVarChar, carrera).query(`INSERT INTO plan_estudio (nombre_plan, carrera) VALUES (@nombre_plan, @carrera); SELECT SCOPE_IDENTITY() as id;`); const id_plan = result.recordset[0].id; await registrarBitacora(req, 'CREAR', 'PlanEstudio', id_plan, `Plan creado: ${nombre_plan} (${carrera})`); res.json({ success: true, id_plan }); } catch (error) { if (error.message.includes('UNIQUE')) res.status(400).json({ error: 'Ya existe un plan con ese nombre' }); else throw error; } } catch (error) { res.status(500).json({ error: error.message }); } });

app.put('/api/planes/:id', verificarToken, verificarRol(['Administrador']), async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const { nombre_plan, carrera, estado } = req.body; const id_plan = req.params.id; const datosAnteriores = await pool.request().input('id_plan', sql.Int, id_plan).query('SELECT nombre_plan, carrera, estado FROM plan_estudio WHERE id_plan = @id_plan'); await pool.request().input('id_plan', sql.Int, id_plan).input('nombre_plan', sql.NVarChar, nombre_plan).input('carrera', sql.NVarChar, carrera).input('estado', sql.NVarChar, estado).query(`UPDATE plan_estudio SET nombre_plan = @nombre_plan, carrera = @carrera, estado = @estado WHERE id_plan = @id_plan`); await registrarBitacora(req, 'EDITAR', 'PlanEstudio', id_plan, `Plan editado`, datosAnteriores.recordset[0], { nombre_plan, carrera, estado }); res.json({ success: true }); } catch (error) { res.status(500).json({ error: error.message }); } });

app.delete('/api/planes/:id', verificarToken, verificarRol(['Administrador']), async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const id_plan = req.params.id; const datosPlan = await pool.request().input('id_plan', sql.Int, id_plan).query('SELECT nombre_plan, carrera FROM plan_estudio WHERE id_plan = @id_plan'); const result = await pool.request().input('id_plan', sql.Int, id_plan).query('SELECT COUNT(*) as total FROM matricula_cuatrimestre WHERE id_plan = @id_plan'); if (result.recordset[0].total > 0) { await pool.request().input('id_plan', sql.Int, id_plan).query('UPDATE plan_estudio SET estado = "Inactivo" WHERE id_plan = @id_plan'); await registrarBitacora(req, 'INACTIVAR', 'PlanEstudio', id_plan, `Plan inactivado: ${datosPlan.recordset[0]?.nombre_plan} (tiene matrículas)`); res.json({ success: true, message: 'Plan inactivado' }); } else { await pool.request().input('id_plan', sql.Int, id_plan).query('DELETE FROM plan_estudio WHERE id_plan = @id_plan'); await registrarBitacora(req, 'ELIMINAR', 'PlanEstudio', id_plan, `Plan eliminado: ${datosPlan.recordset[0]?.nombre_plan}`); res.json({ success: true, message: 'Plan eliminado' }); } } catch (error) { res.status(500).json({ error: error.message }); } });

app.get('/api/planes/:id/cursos', verificarToken, async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const id_plan = req.params.id; const result = await pool.request().input('id_plan', sql.Int, id_plan).query(`SELECT pc.*, c.codigo, c.nombre as curso_nombre, c.creditos as curso_creditos FROM plan_estudio_curso pc JOIN Curso c ON pc.id_curso = c.id_curso WHERE pc.id_plan = @id_plan AND pc.estado = 'Activo' ORDER BY pc.cuatrimestre, c.codigo`); res.json(result.recordset); } catch (error) { res.status(500).json({ error: error.message }); } });

app.post('/api/planes/:id/cursos', verificarToken, verificarRol(['Administrador']), async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const id_plan = req.params.id; const { id_curso, cuatrimestre, creditos, requisito } = req.body; if (!id_curso || !cuatrimestre || !creditos) return res.status(400).json({ error: 'Curso, cuatrimestre y créditos son obligatorios' }); if (cuatrimestre < 1 || cuatrimestre > 12) return res.status(400).json({ error: 'Cuatrimestre debe ser entre 1 y 12' }); if (creditos <= 0) return res.status(400).json({ error: 'Créditos deben ser mayores que 0' }); try { const result = await pool.request().input('id_plan', sql.Int, id_plan).input('id_curso', sql.Int, id_curso).input('cuatrimestre', sql.Int, cuatrimestre).input('creditos', sql.Int, creditos).input('requisito', sql.NVarChar, requisito || null).query(`INSERT INTO plan_estudio_curso (id_plan, id_curso, cuatrimestre, creditos, requisito) VALUES (@id_plan, @id_curso, @cuatrimestre, @creditos, @requisito); SELECT SCOPE_IDENTITY() as id;`); await registrarBitacora(req, 'AGREGAR_CURSO_PLAN', 'PlanEstudio', id_plan, `Curso ${id_curso} agregado al plan (cuatrimestre ${cuatrimestre})`); res.json({ success: true, id_plan_curso: result.recordset[0].id }); } catch (error) { if (error.message.includes('UNIQUE')) res.status(400).json({ error: 'El curso ya está agregado a este plan' }); else throw error; } } catch (error) { res.status(500).json({ error: error.message }); } });

app.delete('/api/planes/:id/cursos/:id_curso', verificarToken, verificarRol(['Administrador']), async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const { id_plan, id_curso } = req.params; await pool.request().input('id_plan', sql.Int, id_plan).input('id_curso', sql.Int, id_curso).query('DELETE FROM plan_estudio_curso WHERE id_plan = @id_plan AND id_curso = @id_curso'); await registrarBitacora(req, 'QUITAR_CURSO_PLAN', 'PlanEstudio', id_plan, `Curso ${id_curso} removido del plan`); res.json({ success: true }); } catch (error) { res.status(500).json({ error: error.message }); } });

// ==================== API DE ADMIN ====================
app.get('/api/admin/usuarios', verificarToken, verificarRol(['Administrador']), async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const result = await pool.request().query(`SELECT u.id_usuario, u.nombre, u.correo_institucional, u.estado, u.fecha_registro, r.nombre as rol_nombre, r.id_rol, e.carnet, e.estado_academico, e.id_programa, p.nombre as programa_nombre FROM Usuario u JOIN Rol r ON u.id_rol = r.id_rol LEFT JOIN Estudiante e ON u.id_usuario = e.id_usuario LEFT JOIN ProgramaAcademico p ON e.id_programa = p.id_programa ORDER BY u.id_usuario`); res.json(result.recordset); } catch (error) { console.error('Error en /admin/usuarios:', error); res.status(500).json({ error: error.message }); } });

app.put('/api/admin/usuarios/:id/rol', verificarToken, verificarRol(['Administrador']), async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const id_usuario = req.params.id; const { rol } = req.body; const rolId = rol === 'admin' ? 2 : 1; const datosAnteriores = await pool.request().input('id_usuario', sql.Int, id_usuario).query('SELECT id_rol FROM Usuario WHERE id_usuario = @id_usuario'); await pool.request().input('id_usuario', sql.Int, id_usuario).input('id_rol', sql.Int, rolId).query('UPDATE Usuario SET id_rol = @id_rol WHERE id_usuario = @id_usuario'); await registrarBitacora(req, 'CAMBIAR_ROL', 'Usuario', id_usuario, `Rol cambiado a ${rol}`, { rol_anterior: datosAnteriores.recordset[0]?.id_rol === 2 ? 'admin' : 'student' }, { rol_nuevo: rol }); res.json({ success: true }); } catch (error) { console.error('Error cambiando rol:', error); res.status(500).json({ error: error.message }); } });

app.delete('/api/admin/usuarios/:id', verificarToken, verificarRol(['Administrador']), async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const id_usuario = req.params.id; if (id_usuario == req.usuario.id_usuario) return res.status(400).json({ error: 'No puede eliminar su propio usuario' }); await pool.request().input('id_usuario', sql.Int, id_usuario).query('DELETE FROM Usuario WHERE id_usuario = @id_usuario'); await registrarBitacora(req, 'ELIMINAR', 'Usuario', id_usuario, `Usuario ${id_usuario} eliminado`); res.json({ success: true }); } catch (error) { console.error('Error eliminando usuario:', error); res.status(500).json({ error: error.message }); } });

// ==================== API DE ADMIN MATRÍCULAS ====================
app.get('/api/admin/matriculas', verificarToken, verificarRol(['Administrador']), async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const result = await pool.request().query(`SELECT m.id_matricula, m.fecha_matricula, m.estado, u.nombre as estudiante_nombre, u.correo_institucional, e.carnet, c.nombre as curso_nombre, c.codigo, c.creditos, s.docente, s.aula, s.horario, (c.creditos * c.costo_credito) as monto, pa.nombre as periodo_nombre, pa.anio as periodo_anio FROM Matricula m JOIN Estudiante e ON m.id_estudiante = e.id_estudiante JOIN Usuario u ON e.id_usuario = u.id_usuario JOIN Seccion s ON m.id_seccion = s.id_seccion JOIN Curso c ON s.id_curso = c.id_curso JOIN PeriodoAcademico pa ON s.id_periodo = pa.id_periodo WHERE m.estado != 'Cancelada' ORDER BY m.fecha_matricula DESC`); res.json(result.recordset); } catch (error) { console.error('Error en /admin/matriculas:', error); res.status(500).json({ error: error.message }); } });

app.post('/api/admin/matriculas', verificarToken, verificarRol(['Administrador']), async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const { id_estudiante, id_seccion } = req.body; const seccionInfo = await obtenerCreditosSeccion(id_seccion); const creditosNuevos = seccionInfo.creditos; const id_periodo = seccionInfo.id_periodo; const cupoCheck = await pool.request().input('id_seccion', sql.Int, id_seccion).query(`SELECT s.cupo, COUNT(m.id_matricula) as matriculados FROM Seccion s LEFT JOIN Matricula m ON s.id_seccion = m.id_seccion AND m.estado IN ('Confirmada', 'Pendiente') WHERE s.id_seccion = @id_seccion GROUP BY s.cupo`); if (cupoCheck.recordset.length > 0) { const disponibles = cupoCheck.recordset[0].cupo - cupoCheck.recordset[0].matriculados; if (disponibles <= 0) return res.status(400).json({ error: 'No hay cupos disponibles' }); } const nuevaSeccion = await pool.request().input('id_seccion', sql.Int, id_seccion).query(`SELECT s.horario FROM Seccion s WHERE s.id_seccion = @id_seccion`); const nuevoHorario = nuevaSeccion.recordset[0]?.horario || ''; const seccionesActuales = await pool.request().input('id_estudiante', sql.Int, id_estudiante).input('id_periodo', sql.Int, id_periodo).query(`SELECT s.horario, s.id_seccion, c.nombre as curso_nombre FROM Matricula m JOIN Seccion s ON m.id_seccion = s.id_seccion JOIN Curso c ON s.id_curso = c.id_curso WHERE m.id_estudiante = @id_estudiante AND s.id_periodo = @id_periodo AND m.estado IN ('Confirmada', 'Pendiente')`); for (const seccion of seccionesActuales.recordset) { if (verificarConflictoHorario(nuevoHorario, seccion.horario)) { return res.status(400).json({ error: `Conflicto de horario con el curso "${seccion.curso_nombre}" (Horario: ${seccion.horario})` }); } } const limiteCheck = await verificarLimiteCreditos(id_estudiante, id_periodo, creditosNuevos); if (!limiteCheck.valido) return res.status(400).json({ error: `Límite de créditos excedido. El estudiante tiene ${limiteCheck.creditosActuales} créditos. No puede agregar ${creditosNuevos} créditos (límite ${CONFIG.LIMITE_CREDITOS_POR_PERIODO}).` }); const cursoInfo = await pool.request().input('id_seccion', sql.Int, id_seccion).query(`SELECT c.creditos, c.costo_credito FROM Seccion s JOIN Curso c ON s.id_curso = c.id_curso WHERE s.id_seccion = @id_seccion`); const monto = cursoInfo.recordset[0].creditos * cursoInfo.recordset[0].costo_credito; const result = await pool.request().input('id_estudiante', sql.Int, id_estudiante).input('id_seccion', sql.Int, id_seccion).input('estado', sql.NVarChar, 'Confirmada').query(`INSERT INTO Matricula (id_estudiante, id_seccion, fecha_matricula, estado) VALUES (@id_estudiante, @id_seccion, GETDATE(), @estado); SELECT SCOPE_IDENTITY() as id_matricula;`); const id_matricula = result.recordset[0].id_matricula; await registrarBitacora(req, 'MATRICULAR_ADMIN', 'Matricula', id_matricula, `Admin matriculó estudiante ${id_estudiante} en sección ${id_seccion}`); const fechaVencimiento = new Date(Date.now() + CONFIG.DIAS_GRACIA_PAGO * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; await pool.request().input('id_estudiante', sql.Int, id_estudiante).input('monto', sql.Decimal(10,2), monto).input('fecha_vencimiento', sql.Date, fechaVencimiento).query(`INSERT INTO Factura (id_estudiante, monto, fecha_emision, fecha_vencimiento, estado) VALUES (@id_estudiante, @monto, GETDATE(), @fecha_vencimiento, 'Pendiente')`); res.json({ success: true, id_matricula }); } catch (error) { console.error('Error en /admin/matriculas POST:', error); res.status(500).json({ error: error.message }); } });

// ==================== API DE ADMIN FACTURAS ====================
app.get('/api/admin/facturas', verificarToken, verificarRol(['Administrador']), async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const result = await pool.request().query(`SELECT f.id_factura, f.monto, f.fecha_emision, f.fecha_vencimiento, f.fecha_pago, f.estado, u.nombre as estudiante_nombre, u.correo_institucional, e.carnet FROM Factura f JOIN Estudiante e ON f.id_estudiante = e.id_estudiante JOIN Usuario u ON e.id_usuario = u.id_usuario ORDER BY f.fecha_emision DESC`); res.json(result.recordset); } catch (error) { console.error('Error en /admin/facturas:', error); res.status(500).json({ error: error.message }); } });

// ==================== API DE ADMIN SECCIONES ====================
// Obtener todas las secciones
app.get('/api/admin/secciones', verificarToken, verificarRol(['Administrador']), async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' });
        const result = await pool.request().query(`
            SELECT s.id_seccion, s.id_curso, s.id_periodo, s.numero_seccion, s.docente, s.aula, s.horario, s.cupo,
                   c.codigo, c.nombre as curso_nombre, c.creditos,
                   pa.nombre as periodo_nombre, pa.anio
            FROM Seccion s
            JOIN Curso c ON s.id_curso = c.id_curso
            JOIN PeriodoAcademico pa ON s.id_periodo = pa.id_periodo
            ORDER BY s.id_seccion DESC
        `);
        res.json(result.recordset);
    } catch (error) {
        console.error('Error en /admin/secciones GET:', error);
        res.status(500).json({ error: error.message });
    }
});

// Crear nueva sección
app.post('/api/admin/secciones', verificarToken, verificarRol(['Administrador']), async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' });
        const { id_curso, id_periodo, numero_seccion, docente, aula, horario, cupo } = req.body;
        if (!id_curso || !id_periodo || !docente || !horario) {
            return res.status(400).json({ error: 'Faltan datos obligatorios' });
        }
        const result = await pool.request()
            .input('id_curso', sql.Int, id_curso)
            .input('id_periodo', sql.Int, id_periodo)
            .input('numero_seccion', sql.Int, numero_seccion || 1)
            .input('docente', sql.NVarChar, docente)
            .input('aula', sql.NVarChar, aula || '')
            .input('horario', sql.NVarChar, horario)
            .input('cupo', sql.Int, cupo || 30)
            .query(`
                INSERT INTO Seccion (id_curso, id_periodo, numero_seccion, docente, aula, horario, cupo)
                VALUES (@id_curso, @id_periodo, @numero_seccion, @docente, @aula, @horario, @cupo);
                SELECT SCOPE_IDENTITY() as id_seccion;
            `);
        const id_seccion = result.recordset[0].id_seccion;
        await registrarBitacora(req, 'CREAR', 'Seccion', id_seccion, `Sección creada para curso ${id_curso} - ${horario}`);
        res.json({ success: true, id_seccion: id_seccion });
    } catch (error) {
        console.error('Error creando sección:', error);
        res.status(500).json({ error: error.message });
    }
});

// Actualizar sección
app.put('/api/admin/secciones/:id', verificarToken, verificarRol(['Administrador']), async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' });
        const id_seccion = req.params.id;
        const { docente, aula, horario, cupo } = req.body;
        if (!docente || !horario) {
            return res.status(400).json({ error: 'Docente y horario son obligatorios' });
        }
        await pool.request()
            .input('id_seccion', sql.Int, id_seccion)
            .input('docente', sql.NVarChar, docente)
            .input('aula', sql.NVarChar, aula || '')
            .input('horario', sql.NVarChar, horario)
            .input('cupo', sql.Int, cupo || 30)
            .query(`
                UPDATE Seccion 
                SET docente = @docente, aula = @aula, horario = @horario, cupo = @cupo
                WHERE id_seccion = @id_seccion
            `);
        await registrarBitacora(req, 'EDITAR', 'Seccion', id_seccion, `Sección actualizada - ${horario}`);
        res.json({ success: true });
    } catch (error) {
        console.error('Error actualizando sección:', error);
        res.status(500).json({ error: error.message });
    }
});

// Eliminar sección
app.delete('/api/admin/secciones/:id', verificarToken, verificarRol(['Administrador']), async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' });
        const id_seccion = req.params.id;
        const tieneMatriculas = await pool.request()
            .input('id_seccion', sql.Int, id_seccion)
            .query('SELECT COUNT(*) as total FROM Matricula WHERE id_seccion = @id_seccion');
        if (tieneMatriculas.recordset[0].total > 0) {
            return res.status(400).json({ error: 'No se puede eliminar una sección con matrículas asociadas' });
        }
        await pool.request()
            .input('id_seccion', sql.Int, id_seccion)
            .query('DELETE FROM Seccion WHERE id_seccion = @id_seccion');
        await registrarBitacora(req, 'ELIMINAR', 'Seccion', id_seccion, `Sección ${id_seccion} eliminada`);
        res.json({ success: true });
    } catch (error) {
        console.error('Error eliminando sección:', error);
        res.status(500).json({ error: error.message });
    }
});

// Obtener una sección específica
app.get('/api/admin/secciones/:id', verificarToken, verificarRol(['Administrador']), async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' });
        const id_seccion = req.params.id;
        const result = await pool.request()
            .input('id_seccion', sql.Int, id_seccion)
            .query(`
                SELECT s.*, c.codigo, c.nombre as curso_nombre, c.creditos,
                       pa.nombre as periodo_nombre, pa.anio
                FROM Seccion s
                JOIN Curso c ON s.id_curso = c.id_curso
                JOIN PeriodoAcademico pa ON s.id_periodo = pa.id_periodo
                WHERE s.id_seccion = @id_seccion
            `);
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Sección no encontrada' });
        }
        res.json(result.recordset[0]);
    } catch (error) {
        console.error('Error obteniendo sección:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== API DE REPORTES ====================
app.get('/api/reportes/matriculas', verificarToken, verificarRol(['Administrador']), async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const result = await pool.request().query(`SELECT pa.nombre as periodo, pa.anio, COUNT(m.id_matricula) as total_matriculas, COUNT(DISTINCT m.id_estudiante) as total_estudiantes FROM Matricula m JOIN Seccion s ON m.id_seccion = s.id_seccion JOIN PeriodoAcademico pa ON s.id_periodo = pa.id_periodo WHERE m.estado != 'Cancelada' GROUP BY pa.nombre, pa.anio, pa.id_periodo ORDER BY pa.id_periodo DESC`); res.json(result.recordset); } catch (error) { console.error('Error en /reportes/matriculas:', error); res.status(500).json({ error: error.message }); } });

app.get('/api/reportes/financieros', verificarToken, verificarRol(['Administrador']), async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const result = await pool.request().query(`SELECT ISNULL(SUM(CASE WHEN f.estado = 'Pagada' THEN f.monto ELSE 0 END), 0) as total_pagado, ISNULL(SUM(CASE WHEN f.estado = 'Pendiente' THEN f.monto ELSE 0 END), 0) as total_pendiente, COUNT(CASE WHEN f.estado = 'Pagada' THEN 1 END) as facturas_pagadas, COUNT(CASE WHEN f.estado = 'Pendiente' THEN 1 END) as facturas_pendientes FROM Factura f`); res.json(result.recordset[0]); } catch (error) { console.error('Error en /reportes/financieros:', error); res.status(500).json({ error: error.message }); } });

app.get('/api/reportes/estudiantes', verificarToken, verificarRol(['Administrador']), async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const result = await pool.request().query(`SELECT u.id_usuario, u.nombre, u.correo_institucional, u.estado, r.nombre as rol, e.carnet, e.estado_academico, p.nombre as carrera FROM Usuario u JOIN Rol r ON u.id_rol = r.id_rol LEFT JOIN Estudiante e ON u.id_usuario = e.id_usuario LEFT JOIN ProgramaAcademico p ON e.id_programa = p.id_programa ORDER BY u.nombre`); res.json(result.recordset); } catch (error) { console.error('Error en /reportes/estudiantes:', error); res.status(500).json({ error: error.message }); } });

// ==================== API DE BITÁCORA ====================
app.get('/api/admin/bitacora', verificarToken, verificarRol(['Administrador']), async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const { fecha_inicio, fecha_fin, usuario, accion, entidad, limite = 100 } = req.query; let query = `SELECT * FROM bitacora_auditoria b WHERE 1=1`; const params = []; if (fecha_inicio) { query += ` AND b.fecha_hora >= @fecha_inicio`; params.push({ name: 'fecha_inicio', type: sql.DateTime, value: fecha_inicio }); } if (fecha_fin) { query += ` AND b.fecha_hora <= @fecha_fin`; params.push({ name: 'fecha_fin', type: sql.DateTime, value: fecha_fin }); } if (usuario) { query += ` AND b.nombre_usuario LIKE @usuario`; params.push({ name: 'usuario', type: sql.NVarChar, value: `%${usuario}%` }); } if (accion) { query += ` AND b.accion = @accion`; params.push({ name: 'accion', type: sql.NVarChar, value: accion }); } if (entidad) { query += ` AND b.entidad = @entidad`; params.push({ name: 'entidad', type: sql.NVarChar, value: entidad }); } query += ` ORDER BY b.fecha_hora DESC OFFSET 0 ROWS FETCH NEXT @limite ROWS ONLY`; params.push({ name: 'limite', type: sql.Int, value: parseInt(limite) }); let request = pool.request(); params.forEach(p => { request = request.input(p.name, p.type, p.value); }); const result = await request.query(query); const statsResult = await pool.request().query(`SELECT COUNT(*) as total_registros, COUNT(DISTINCT nombre_usuario) as usuarios_activos, COUNT(DISTINCT CASE WHEN fecha_hora >= DATEADD(day, -7, GETDATE()) THEN id_bitacora END) as registros_7dias FROM bitacora_auditoria`); res.json({ registros: result.recordset, estadisticas: statsResult.recordset[0] }); } catch (error) { console.error('Error en /admin/bitacora:', error); res.status(500).json({ error: error.message }); } });

app.get('/api/admin/bitacora/exportar', verificarToken, verificarRol(['Administrador']), async (req, res) => { try { if (!pool) return res.status(503).json({ error: 'Base de datos no disponible' }); const { fecha_inicio, fecha_fin } = req.query; let query = `SELECT id_bitacora, nombre_usuario, rol_usuario, accion, entidad, id_entidad, detalle, ip_address, fecha_hora FROM bitacora_auditoria WHERE 1=1`; const params = []; if (fecha_inicio) { query += ` AND fecha_hora >= @fecha_inicio`; params.push({ name: 'fecha_inicio', type: sql.DateTime, value: fecha_inicio }); } if (fecha_fin) { query += ` AND fecha_hora <= @fecha_fin`; params.push({ name: 'fecha_fin', type: sql.DateTime, value: fecha_fin }); } query += ` ORDER BY fecha_hora DESC`; let request = pool.request(); params.forEach(p => { request = request.input(p.name, p.type, p.value); }); const result = await request.query(query); let csv = 'ID,Fecha,Usuario,Rol,Acción,Entidad,ID Entidad,Detalle,IP\n'; result.recordset.forEach(row => { csv += `${row.id_bitacora},${row.fecha_hora},${row.nombre_usuario},${row.rol_usuario},${row.accion},${row.entidad},${row.id_entidad || ''},${(row.detalle || '').replace(/,/g, ';')},${row.ip_address || ''}\n`; }); res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', `attachment; filename=bitacora_${new Date().toISOString().split('T')[0]}.csv`); res.send(csv); } catch (error) { console.error('Error exportando bitácora:', error); res.status(500).json({ error: error.message }); } });

// ==================== INICIAR SERVIDOR ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🚀 Servidor API corriendo en http://localhost:${PORT}`);
    console.log(`✅ Conectado a SQL Server`);
    console.log(`📋 Endpoints principales:`);
    console.log(`   POST   /api/auth/login - Iniciar sesión`);
    console.log(`   GET    /api/carreras - Listar carreras`);
    console.log(`   GET    /api/cursos - Listar cursos`);
    console.log(`   GET    /api/oferta/secciones - Oferta académica`);
    console.log(`   POST   /api/matriculas - Matricular`);
    console.log(`   GET    /api/planes - Planes de estudio`);
    console.log(`   GET    /api/reportes/matriculas - Reporte matrículas`);
    console.log(`   GET    /api/reportes/financieros - Reporte financiero`);
    console.log(`   GET    /api/reportes/estudiantes - Reporte estudiantes`);
    console.log(`   GET    /api/admin/bitacora - Bitácora de auditoría`);
    console.log(`   POST   /api/admin/secciones - Crear sección`);
    console.log(`   PUT    /api/admin/secciones/:id - Editar sección`);
    console.log(`   DELETE /api/admin/secciones/:id - Eliminar sección`);
    console.log(`   GET    /api/admin/matriculas - Listar matrículas admin`);
    console.log(`   POST   /api/admin/matriculas - Crear matrícula admin`);
    console.log(`   GET    /api/admin/facturas - Listar facturas admin`);
});

process.on('SIGINT', async () => {
    console.log('\n🛑 Cerrando servidor...');
    if (pool) {
        await pool.close();
        console.log('✅ Conexión a BD cerrada');
    }
    process.exit(0);
});