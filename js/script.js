let currentUser = null;
let currentEstudiante = null;
let currentPeriodoId = 1;
let authToken = null;
let deleteCallback = null;
let notificationsDB = [];
let allSecciones = [];
let allCarreras = [];
let allCursos = [];
let allPeriodos = [];
let allPlanes = [];

const API_URL = 'http://localhost:3000/api';

// ==================== FUNCIONES DE API ====================
async function apiRequest(endpoint, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    try {
        const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
        if (!response.ok) { const error = await response.json(); throw new Error(error.error || 'Error en la petición'); }
        return response.json();
    } catch (error) { console.error('API Error:', error); throw error; }
}

// ==================== AUTENTICACIÓN ====================
async function doLoginWithSSO() { toast('Autenticando con SSO...', '#3b82f6'); doManualLogin(); }

async function doManualLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    if (!email || !password) { toast('Ingrese correo y contraseña', '#ef4444'); return; }
    try {
        document.getElementById('loading-overlay').style.display = 'flex';
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (data.success) {
            authToken = data.token;
            currentUser = data.usuario;
            localStorage.setItem('authToken', authToken);
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            if (currentUser.id_rol === 1) {
                try {
                    const estudianteData = await apiRequest('/auth/estudiante');
                    if (estudianteData.success && estudianteData.estudiante) {
                        currentEstudiante = estudianteData.estudiante;
                        localStorage.setItem('currentEstudiante', JSON.stringify(currentEstudiante));
                    }
                } catch (e) { console.log('No es estudiante'); }
            }
            completeLogin();
        } else { toast(data.error || 'Error de autenticación', '#ef4444'); }
    } catch (error) { console.error('Login error:', error); toast('Error al conectar con el servidor', '#ef4444'); }
    finally { document.getElementById('loading-overlay').style.display = 'none'; }
}

function completeLogin() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    updateUserInfo();
    renderSidebarMenu();
    cargarDatosIniciales();
    addNotification(currentUser.id_usuario, 'Bienvenido', `Has iniciado sesión como ${currentUser.rol === 'Administrador' ? 'Administrador' : 'Estudiante'}`, 'success');
    showPage('dashboard');
    toast(`Bienvenido/a, ${currentUser.nombre}`, '#10b981');
}

function doLogout() {
    authToken = null;
    currentUser = null;
    currentEstudiante = null;
    localStorage.clear();
    document.getElementById('app').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
}

function updateUserInfo() {
    const initials = currentUser.nombre.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
    document.getElementById('user-avatar').textContent = initials;
    document.getElementById('user-name').textContent = currentUser.nombre;
    const roleText = currentUser.rol === 'Administrador' ? 'Administrador' : 'Estudiante';
    document.getElementById('user-role-text').textContent = roleText;
    const badge = document.getElementById('user-role-badge');
    badge.textContent = roleText;
    badge.className = `role-badge ${currentUser.rol === 'Administrador' ? 'admin' : 'student'}`;
}

function renderSidebarMenu() {
    const navMenu = document.getElementById('nav-menu');
    let menuItems = [];
    if (currentUser.rol === 'Administrador') {
        menuItems = [
            { id: 'dashboard', name: 'Dashboard', icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z' },
            { id: 'gestion-academica', name: 'Gestión Académica', icon: 'M4 6h16v2H4V6zm2-4h12v2H6V2zm16 4H2v12h20V6z' },
            { id: 'oferta', name: 'Oferta Académica', icon: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z' },
            { id: 'matriculas', name: 'Matrículas', icon: 'M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z' },
            { id: 'pagos', name: 'Pagos', icon: 'M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z' },
            { id: 'reportes', name: 'Reportes', icon: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z' },
            { id: 'usuarios', name: 'Usuarios', icon: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z' },
            { id: 'bitacora', name: 'Bitácora', icon: 'M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm0-10C6.48 4 2 8.48 2 14s4.48 10 10 10 10-4.48 10-10S17.52 4 12 4zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z' }
        ];
    } else {
        menuItems = [
            { id: 'dashboard', name: 'Mi Dashboard', icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z' },
            { id: 'oferta', name: 'Oferta Académica', icon: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z' },
            { id: 'matriculas', name: 'Mis Matrículas', icon: 'M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z' },
            { id: 'pagos', name: 'Mis Pagos', icon: 'M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z' }
        ];
    }
    navMenu.innerHTML = menuItems.map(item => `<div class="nav-item" data-page="${item.id}" onclick="showPage('${item.id}')"><svg viewBox="0 0 24 24" fill="currentColor"><path d="${item.icon}"/></svg>${item.name}</div>`).join('');
}
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    const pageMap = {
        'dashboard': 'page-dashboard',
        'gestion-academica': 'page-gestion-academica',
        'oferta': 'page-oferta',
        'matriculas': 'page-matriculas',
        'pagos': 'page-pagos',
        'reportes': 'page-reportes',
        'usuarios': 'page-usuarios',
        'bitacora': 'page-bitacora'
    };
    
    const targetPage = document.getElementById(pageMap[pageId]);
    if (targetPage) targetPage.classList.add('active');
    
    const activeNav = document.querySelector(`.nav-item[data-page="${pageId}"]`);
    if (activeNav) activeNav.classList.add('active');
    
    const titles = {
        dashboard: 'Dashboard',
        'gestion-academica': 'Gestión Académica',
        oferta: 'Oferta Académica',
        matriculas: 'Matrículas',
        pagos: 'Pagos',
        reportes: 'Reportes',
        usuarios: 'Usuarios',
        bitacora: 'Bitácora de Auditoría'
    };
    document.getElementById('page-title').textContent = titles[pageId] || 'UniMatricula';
    document.getElementById('page-subtitle').textContent = currentUser.rol === 'Administrador' ? 'Panel de administración' : 'Gestión académica';
    
    // ========== NUEVO: Mostrar vistas según el rol ==========
    if (pageId === 'dashboard') {
        cargarDashboard();
    }
    if (pageId === 'gestion-academica') {
        // Solo administrador puede ver gestión académica
        if (currentUser.rol === 'Administrador') {
            cargarCarreras();
            cargarCursos();
            cargarPlanes();
        } else {
            toast('No tiene permisos para acceder a esta página', '#ef4444');
            showPage('dashboard');
        }
    }
    if (pageId === 'oferta') {
        cargarPeriodosOferta();
        cargarOferta();
    }
    if (pageId === 'matriculas') {
        if (currentUser.rol === 'Administrador') {
            cargarMatriculasAdmin(); // Vista de admin
        } else {
            cargarMisMatriculas(); // Vista de estudiante
        }
    }
    if (pageId === 'pagos') {
        if (currentUser.rol === 'Administrador') {
            cargarFacturasAdmin(); // Vista de admin
        } else {
            cargarMisFacturas(); // Vista de estudiante
        }
    }
    if (pageId === 'usuarios') {
        if (currentUser.rol === 'Administrador') {
            cargarUsuariosAdmin();
        } else {
            toast('No tiene permisos para acceder a esta página', '#ef4444');
            showPage('dashboard');
        }
    }
    if (pageId === 'bitacora') {
        if (currentUser.rol === 'Administrador') {
            cargarBitacora();
        } else {
            toast('No tiene permisos para acceder a esta página', '#ef4444');
            showPage('dashboard');
        }
    }
    if (pageId === 'reportes') {
        if (currentUser.rol === 'Administrador') {
            cargarEstadisticasReportes();
        } else {
            toast('No tiene permisos para acceder a esta página', '#ef4444');
            showPage('dashboard');
        }
    }
    
    closeNotif();
}
// ==================== CARGAR DATOS INICIALES ====================
async function cargarDatosIniciales() {
    await Promise.all([cargarCarreras(), cargarCursos(), cargarPeriodos(), cargarPlanes()]);
}

async function cargarCarreras() {
    try {
        const response = await fetch(`${API_URL}/carreras`, { headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {} });
        if (response.ok) { allCarreras = await response.json(); }
        const selectCursoPrograma = document.getElementById('curso-programa');
        if (selectCursoPrograma) {
            selectCursoPrograma.innerHTML = '<option value="">Seleccione una carrera</option>' + allCarreras.map(c => `<option value="${c.id_programa}">${c.nombre}</option>`).join('');
        }
        const selectUsuarioCarrera = document.getElementById('usuario-carrera');
        if (selectUsuarioCarrera) {
            selectUsuarioCarrera.innerHTML = '<option value="">Seleccione una carrera</option>' + allCarreras.map(c => `<option value="${c.id_programa}">${c.nombre}</option>`).join('');
        }
        const selectFiltroCarrera = document.getElementById('filtro-carrera-curso');
        if (selectFiltroCarrera) {
            selectFiltroCarrera.innerHTML = '<option value="">Todas las carreras</option>' + allCarreras.map(c => `<option value="${c.id_programa}">${c.nombre}</option>`).join('');
        }
        const selectOfertaCarrera = document.getElementById('oferta-filter-carrera');
        if (selectOfertaCarrera) {
            selectOfertaCarrera.innerHTML = '<option value="">Todas las carreras</option>' + allCarreras.map(c => `<option value="${c.nombre}">${c.nombre}</option>`).join('');
        }
        renderCarreras();
    } catch (error) { console.error('Error cargando carreras:', error); }
}

function renderCarreras() {
    const tbody = document.getElementById('carreras-tbody');
    if (!tbody) return;
    if (allCarreras.length === 0) tbody.innerHTML = '<tr><td colspan="4">No hay carreras registradas</td></tr>';
    else tbody.innerHTML = allCarreras.map(c => `
        <tr>
            <td>${c.id_programa}</td><td>${c.codigo}</td><td>${c.nombre}</td>
            <td><button class="btn-small" onclick="editarCarrera(${c.id_programa})">Editar</button>
            <button class="btn-small btn-danger" onclick="eliminarCarrera(${c.id_programa})">Eliminar</button></td>
        </tr>
    `).join('');
}

async function cargarCursos() {
    try {
        const search = document.getElementById('search-curso')?.value || '';
        const id_programa = document.getElementById('filtro-carrera-curso')?.value || '';
        let url = `/cursos/buscar?search=${encodeURIComponent(search)}`;
        if (id_programa) url += `&id_programa=${id_programa}`;
        const cursos = await apiRequest(url);
        allCursos = cursos;
        const tbody = document.getElementById('cursos-tbody');
        if (!tbody) return;
        if (cursos.length === 0) tbody.innerHTML = '<tr><td colspan="6">No hay cursos registrados</td></tr>';
        else tbody.innerHTML = cursos.map(c => `
            <tr>
                <td>${c.codigo}</td><td>${c.nombre}</td><td>${c.creditos}</td>
                <td>${c.programa_nombre || '-'}</td>
                <td><span class="badge ${c.estado === 'Activo' ? 'badge-green' : 'badge-danger'}">${c.estado}</span></td>
                <td><button class="btn-small" onclick="editarCurso(${c.id_curso})">Editar</button>
                <button class="btn-small btn-danger" onclick="cambiarEstadoCurso(${c.id_curso}, '${c.estado === 'Activo' ? 'Inactivo' : 'Activo'}')">${c.estado === 'Activo' ? 'Inactivar' : 'Activar'}</button></td>
            </tr>
        `).join('');
    } catch (error) { console.error('Error cargando cursos:', error); }
}

async function cargarPeriodos() {
    try {
        const response = await fetch(`${API_URL}/periodos`, { headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {} });
        if (response.ok) allPeriodos = await response.json();
    } catch (error) { console.error('Error cargando periodos:', error); }
}

async function cargarPlanes() {
    try { allPlanes = await apiRequest('/planes'); renderPlanes(); } catch (error) { console.error('Error cargando planes:', error); }
}

function renderPlanes() {
    const tbody = document.getElementById('planes-tbody');
    if (!tbody) return;
    if (allPlanes.length === 0) tbody.innerHTML = '<tr><td colspan="6">No hay planes de estudio</td></tr>';
    else tbody.innerHTML = allPlanes.map(p => `
        <tr>
            <td>${p.id_plan}</td><td>${p.nombre_plan}</td><td>${p.carrera}</td>
            <td>${p.total_cursos || 0}</td>
            <td><span class="badge ${p.estado === 'Activo' ? 'badge-green' : 'badge-danger'}">${p.estado}</span></td>
            <td><button class="btn-small" onclick="verCursosPlan(${p.id_plan})">Ver Cursos</button>
            <button class="btn-small" onclick="editarPlan(${p.id_plan})">Editar</button>
            <button class="btn-small btn-danger" onclick="eliminarPlan(${p.id_plan})">Eliminar</button></td>
        </tr>
    `).join('');
}

// ==================== DASHBOARD ====================
async function cargarDashboard() {
    document.getElementById('welcome-title').textContent = `Bienvenido, ${currentUser.nombre}`;
    if (allPeriodos.length > 0) {
        const periodoActual = allPeriodos.find(p => p.activo === 1) || allPeriodos[0];
        document.getElementById('period-info').textContent = `Periodo actual: ${periodoActual.nombre} ${periodoActual.anio}`;
    }
    const statsContainer = document.getElementById('dashboard-stats');
    const debtContainer = document.getElementById('debt-warning-container');
    if (currentUser.rol !== 'Administrador' && currentEstudiante) {
        try {
            const matriculas = await apiRequest('/matriculas/mis-matriculas');
            const facturas = await apiRequest('/pagos/mis-facturas');
            const totalCreditos = matriculas.reduce((sum, m) => sum + (m.creditos || 0), 0);
            const deudaTotal = facturas.filter(f => f.estado === 'Pendiente').reduce((sum, f) => sum + f.monto, 0);
            statsContainer.innerHTML = `<div class="stat-card"><div class="val">${matriculas.length}</div><div class="lbl">Cursos</div></div>
                <div class="stat-card"><div class="val">${totalCreditos}</div><div class="lbl">Créditos</div></div>
                <div class="stat-card"><div class="val">${deudaTotal.toLocaleString()}</div><div class="lbl">Deuda</div></div>`;
            if (deudaTotal > 0) debtContainer.innerHTML = `<div class="debt-warning"><span>Advertencia: Tienes una deuda pendiente de ${deudaTotal.toLocaleString()}</span></div>`;
            else debtContainer.innerHTML = '';
            const tbody = document.getElementById('my-courses-tbody');
            if (matriculas.length === 0) tbody.innerHTML = '<tr><td colspan="6">No tienes cursos matriculados</td></tr>';
            else tbody.innerHTML = matriculas.map(m => `<tr><td>${m.codigo || 'N/A'}</td><td>${m.curso_nombre || 'N/A'}</td><td>${m.horario || 'N/A'}</td><td>${m.aula || 'N/A'}</td><td>${m.docente || 'N/A'}</td><td><span class="badge badge-green">${m.estado}</span></td></tr>`).join('');
            await cargarProgresoCreditos();
        } catch (error) { console.error('Error loading dashboard:', error); }
    } else {
        try {
            const matriculasReport = await apiRequest('/reportes/matriculas');
            const financieroReport = await apiRequest('/reportes/financieros');
            statsContainer.innerHTML = `<div class="stat-card"><div class="val">${matriculasReport.reduce((sum, p) => sum + p.total_estudiantes, 0) || 0}</div><div class="lbl">Estudiantes</div></div>
                <div class="stat-card"><div class="val">${matriculasReport.reduce((sum, p) => sum + p.total_matriculas, 0) || 0}</div><div class="lbl">Matrículas</div></div>
                <div class="stat-card"><div class="val">${((financieroReport.total_pagado || 0) / 1000000).toFixed(1)}M</div><div class="lbl">Ingresos</div></div>`;
            debtContainer.innerHTML = '';
            const tbody = document.getElementById('my-courses-tbody');
            tbody.innerHTML = '<tr><td colspan="6">Panel de administración</td></tr>';
        } catch (error) { console.error('Error loading admin dashboard:', error); }
    }
}

async function cargarProgresoCreditos() {
    if (currentUser.rol === 'Administrador') return;
    try {
        const data = await apiRequest('/estudiante/creditos');
        const container = document.getElementById('creditos-progress-container');
        if (!container) return;
        const porcentaje = Math.min((data.creditos / data.limite) * 100, 100);
        let color = '#10b981';
        if (porcentaje >= 85) color = '#ef4444';
        else if (porcentaje >= 70) color = '#f59e0b';
        container.innerHTML = `<div class="credits-card"><div class="credits-header"><span>Créditos - ${data.periodo}</span><span class="credits-count">${data.creditos} / ${data.limite}</span></div>
            <div class="progress-bar-container"><div class="progress-bar" style="width: ${porcentaje}%; background: ${color};"></div></div>
            <div class="credits-footer"><span>${data.disponibles} créditos disponibles</span>${porcentaje >= 85 ? '<span class="warning-text">Cerca del límite máximo</span>' : ''}</div></div>`;
    } catch (error) { console.error('Error cargando progreso:', error); }
}

// ==================== OFERTA ACADÉMICA ====================
async function cargarPeriodosOferta() {
    const container = document.getElementById('period-tabs-oferta');
    if (!container) return;
    try {
        const periodos = await apiRequest('/periodos');
        if (periodos.length === 0) { container.innerHTML = '<span>No hay periodos</span>'; return; }
        allPeriodos = periodos;
        const activo = periodos.find(p => p.activo === 1) || periodos[0];
        currentPeriodoId = activo.id_periodo;
        container.innerHTML = periodos.map(p => `<button class="tab-btn ${p.id_periodo === currentPeriodoId ? 'active' : ''}" onclick="cambiarPeriodoOferta(${p.id_periodo})">${p.nombre} ${p.anio}</button>`).join('');
        const btnSeccion = document.getElementById('btn-nuevo-seccion');
        if (btnSeccion) btnSeccion.style.display = currentUser.rol === 'Administrador' ? 'inline-flex' : 'none';
    } catch (error) { console.error('Error cargando periodos:', error); }
}

function cambiarPeriodoOferta(periodoId) {
    currentPeriodoId = periodoId;
    cargarOferta();
}

async function cargarOferta() {
    const tbody = document.getElementById('oferta-tbody');
    tbody.innerHTML = '<tr><td colspan="6">Cargando...</td></tr>';
    try {
        allSecciones = await apiRequest(`/oferta/secciones?periodo_id=${currentPeriodoId}`);
        if (allSecciones.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">No hay secciones disponibles. Use "Nueva Sección" para crear una.</td></tr>';
        } else {
            tbody.innerHTML = allSecciones.map(sec => {
                const disponibles = sec.disponibles || 0;
                return `<tr>
                    <td><strong>${sec.codigo}</strong><br><span style="font-size:11px;color:#6b7280">${sec.curso_nombre}</span></td>
                    <td>${sec.programa_nombre || 'N/A'}</td>
                    <td>${sec.cupo}</td>
                    <td><span class="badge ${disponibles > 0 ? 'badge-green' : 'badge-red'}">${disponibles}</span></td>
                    <td>${sec.horario}<br><span style="font-size:11px;color:#6b7280">${sec.aula} | ${sec.docente}</span></td>
                    <td>${currentUser.rol === 'Administrador' ? 
                        `<div class="action-btns">
                            <button class="btn-small" onclick="editarSeccion(${sec.id_seccion})">Editar</button>
                            <button class="btn-small btn-danger" onclick="eliminarSeccion(${sec.id_seccion})">Eliminar</button>
                        </div>` : 
                        (disponibles > 0 ? `<button class="btn-matricular" onclick="matricularEnSeccion(${sec.id_seccion})">Matricular</button>` : 
                        '<span class="badge badge-red">Sin cupo</span>')}</td>
                </tr>`;
            }).join('');
        }
    } catch (error) { console.error('Error cargando oferta:', error); tbody.innerHTML = '<tr><td colspan="6" style="color:red">Error cargando oferta académica</td></tr>'; }
}

async function matricularEnSeccion(idSeccion) {
    try {
        await apiRequest('/matriculas', { method: 'POST', body: JSON.stringify({ id_seccion: idSeccion }) });
        toast('Matrícula registrada exitosamente', '#10b981');
        cargarOferta();
        cargarDashboard();
        if (currentUser.rol !== 'Administrador') { cargarMatriculas(); cargarFacturas(); }
    } catch (error) { toast(`Error: ${error.message}`, '#ef4444'); }
}

// ==================== FUNCIONES CRUD SECCIONES ====================
function abrirNuevaSeccion() {
    const cursoSelect = document.getElementById('seccion-curso-id');
    cursoSelect.innerHTML = '<option value="">Seleccione un curso</option>';
    allCursos.forEach(curso => {
        cursoSelect.innerHTML += `<option value="${curso.id_curso}">${curso.codigo} - ${curso.nombre} (${curso.creditos} créditos)</option>`;
    });
    
    const periodoSelect = document.getElementById('seccion-periodo-id');
    periodoSelect.innerHTML = '<option value="">Seleccione un periodo</option>';
    allPeriodos.forEach(periodo => {
        periodoSelect.innerHTML += `<option value="${periodo.id_periodo}">${periodo.nombre} ${periodo.anio}</option>`;
    });
    
    document.getElementById('seccion-id').value = '';
    document.getElementById('seccion-numero').value = '';
    document.getElementById('seccion-docente').value = '';
    document.getElementById('seccion-aula').value = '';
    document.getElementById('seccion-horario').value = '';
    document.getElementById('seccion-cupo').value = '30';
    document.getElementById('seccion-modal-title').textContent = '+ Nueva Sección';
    
    openMod('modal-seccion');
}

async function editarSeccion(idSeccion) {
    const seccion = allSecciones.find(s => s.id_seccion === idSeccion);
    if (!seccion) {
        toast('Sección no encontrada', '#ef4444');
        return;
    }
    
    const cursoSelect = document.getElementById('seccion-curso-id');
    cursoSelect.innerHTML = '<option value="">Seleccione un curso</option>';
    allCursos.forEach(curso => {
        cursoSelect.innerHTML += `<option value="${curso.id_curso}" ${curso.id_curso === seccion.id_curso ? 'selected' : ''}>${curso.codigo} - ${curso.nombre} (${curso.creditos} créditos)</option>`;
    });
    
    const periodoSelect = document.getElementById('seccion-periodo-id');
    periodoSelect.innerHTML = '<option value="">Seleccione un periodo</option>';
    allPeriodos.forEach(periodo => {
        periodoSelect.innerHTML += `<option value="${periodo.id_periodo}" ${periodo.id_periodo === seccion.id_periodo ? 'selected' : ''}>${periodo.nombre} ${periodo.anio}</option>`;
    });
    
    document.getElementById('seccion-id').value = seccion.id_seccion;
    document.getElementById('seccion-numero').value = seccion.numero_seccion || '';
    document.getElementById('seccion-docente').value = seccion.docente || '';
    document.getElementById('seccion-aula').value = seccion.aula || '';
    document.getElementById('seccion-horario').value = seccion.horario || '';
    document.getElementById('seccion-cupo').value = seccion.cupo || 30;
    document.getElementById('seccion-modal-title').textContent = 'Editar Sección';
    
    openMod('modal-seccion');
}

async function guardarSeccion() {
    const id = document.getElementById('seccion-id').value;
    const id_curso = document.getElementById('seccion-curso-id').value;
    const id_periodo = document.getElementById('seccion-periodo-id').value;
    const numero_seccion = document.getElementById('seccion-numero').value || 1;
    const docente = document.getElementById('seccion-docente').value.trim();
    const aula = document.getElementById('seccion-aula').value.trim();
    const horario = document.getElementById('seccion-horario').value.trim();
    const cupo = parseInt(document.getElementById('seccion-cupo').value);
    
    if (!id_curso || !id_periodo) {
        toast('Seleccione un curso y un periodo', '#ef4444');
        return;
    }
    
    if (!docente || !horario) {
        toast('El docente y horario son obligatorios', '#ef4444');
        return;
    }
    
    if (cupo < 1) {
        toast('El cupo debe ser al menos 1', '#ef4444');
        return;
    }
    
    try {
        if (id) {
            await apiRequest(`/admin/secciones/${id}`, {
                method: 'PUT',
                body: JSON.stringify({ docente, aula, horario, cupo })
            });
            toast('Sección actualizada', '#10b981');
        } else {
            await apiRequest('/admin/secciones', {
                method: 'POST',
                body: JSON.stringify({ 
                    id_curso: parseInt(id_curso), 
                    id_periodo: parseInt(id_periodo), 
                    numero_seccion: parseInt(numero_seccion), 
                    docente, 
                    aula, 
                    horario, 
                    cupo 
                })
            });
            toast('Sección creada exitosamente', '#10b981');
        }
        closeMods();
        cargarOferta();
    } catch (error) {
        toast(`Error: ${error.message}`, '#ef4444');
    }
}

async function eliminarSeccion(idSeccion) {
    deleteCallback = async () => {
        try {
            await apiRequest(`/admin/secciones/${idSeccion}`, { method: 'DELETE' });
            toast('Sección eliminada', '#10b981');
            closeMods();
            cargarOferta();
        } catch (error) {
            toast(`Error: ${error.message}`, '#ef4444');
            closeMods();
        }
    };
    const seccion = allSecciones.find(s => s.id_seccion === idSeccion);
    document.getElementById('del-name').textContent = `${seccion?.codigo} - ${seccion?.horario || 'Sección'}`;
    openMod('modal-delete');
}

// ==================== MATRÍCULAS ====================
async function cargarMatriculas() {
    const tbody = document.getElementById('matriculas-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8">Cargando...</td></tr>';
    try {
        const matriculas = await apiRequest('/admin/matriculas');
        const search = document.getElementById('search-matricula')?.value.toLowerCase() || '';
        const filtroEstado = document.getElementById('filtro-estado-matricula')?.value || '';
        let filtered = matriculas;
        if (search) filtered = filtered.filter(m => m.estudiante_nombre?.toLowerCase().includes(search));
        if (filtroEstado) filtered = filtered.filter(m => m.estado === filtroEstado);
        if (!filtered || filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8">No hay matrículas registradas</td></tr>';
            return;
        }
        tbody.innerHTML = filtered.map(m => `
            <tr>
                <td>${m.id_matricula}</td>
                <td>${m.estudiante_nombre || 'N/A'}<br><small>${m.carnet || ''}</small></td>
                <td>${m.curso_nombre || 'N/A'}</td>
                <td>${m.periodo_nombre || 'N/A'} ${m.periodo_anio || ''}</td>
                <td>${m.creditos || 0}</td>
                <td>${(m.monto || 0).toLocaleString()}</td>
                <td><span class="badge ${m.estado === 'Confirmada' ? 'badge-green' : 'badge-danger'}">${m.estado}</span></td>
                <td><button class="btn-small btn-danger" onclick="cancelarMatricula(${m.id_matricula})">Cancelar</button></td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error cargando matrículas:', error);
        tbody.innerHTML = `<tr><td colspan="8" style="color:red">Error cargando datos: ${error.message}</td></tr>`;
    }
}

async function cancelarMatricula(idMatricula) {
    try {
        await apiRequest(`/matriculas/${idMatricula}`, { method: 'DELETE' });
        toast('Matrícula cancelada', '#10b981');
        cargarMatriculas();
        cargarDashboard();
        cargarOferta();
    } catch (error) { toast(`Error: ${error.message}`, '#ef4444'); }
}

function mostrarModalMatricula() {
    cargarEstudiantesParaSelect();
    cargarSeccionesParaSelect();
    openMod('modal-matricula');
}

async function cargarEstudiantesParaSelect() {
    try {
        const usuarios = await apiRequest('/admin/usuarios');
        const estudiantes = usuarios.filter(u => u.id_rol === 1);
        const select = document.getElementById('matricula-estudiante-id');
        select.innerHTML = '<option value="">Seleccione un estudiante</option>' + estudiantes.map(e => `<option value="${e.id_usuario}">${e.nombre} - ${e.carnet || 'Sin carnet'}</option>`).join('');
    } catch (error) { console.error('Error cargando estudiantes:', error); }
}

async function cargarSeccionesParaSelect() {
    try {
        const secciones = await apiRequest(`/oferta/secciones?periodo_id=${currentPeriodoId}`);
        const disponibles = secciones.filter(s => s.disponibles > 0);
        const select = document.getElementById('matricula-seccion-id');
        select.innerHTML = '<option value="">Seleccione una sección</option>' + disponibles.map(s => `<option value="${s.id_seccion}">${s.codigo} - ${s.curso_nombre} (${s.horario}) - Cupos: ${s.disponibles}</option>`).join('');
    } catch (error) { console.error('Error cargando secciones:', error); }
}

async function guardarMatricula() {
    const id_estudiante = document.getElementById('matricula-estudiante-id').value;
    const id_seccion = document.getElementById('matricula-seccion-id').value;
    if (!id_estudiante || !id_seccion) { toast('Complete todos los campos', '#ef4444'); return; }
    try {
        await apiRequest('/admin/matriculas', { method: 'POST', body: JSON.stringify({ id_estudiante: parseInt(id_estudiante), id_seccion: parseInt(id_seccion) }) });
        toast('Matrícula registrada', '#10b981');
        closeMods();
        cargarMatriculas();
        cargarDashboard();
        cargarOferta();
    } catch (error) { toast(`Error: ${error.message}`, '#ef4444'); }
}

// ==================== MIS MATRÍCULAS (ESTUDIANTE) ====================
async function cargarMisMatriculas() {
    const tbody = document.getElementById('matriculas-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center">Cargando...<\/td><\/tr>';
    
    try {
        console.log('🔍 Cargando mis matrículas como estudiante...');
        const matriculas = await apiRequest('/matriculas/mis-matriculas');
        console.log('📊 Matrículas recibidas:', matriculas);
        
        if (!matriculas || matriculas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center">No tienes matrículas registradas<\/td><\/tr>';
            return;
        }
        
        tbody.innerHTML = matriculas.map(m => `
            <tr>
                <td>${m.id_matricula}<\/td>
                <td>${m.curso_nombre || 'N/A'}<\/td>
                <td>${m.periodo_nombre || 'N/A'} ${m.periodo_anio || ''}<\/td>
                <td>${m.creditos || 0}<\/td>
                <td>${(m.monto || 0).toLocaleString()}<\/td>
                <td><span class="badge ${m.estado === 'Confirmada' ? 'badge-green' : 'badge-danger'}">${m.estado}<\/span><\/td>
                <td><button class="btn-small btn-danger" onclick="cancelarMiMatricula(${m.id_matricula})">Cancelar<\/button><\/td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Error cargando mis matrículas:', error);
        tbody.innerHTML = `<td><td colspan="7" style="text-align:center;color:red">Error cargando datos: ${error.message}<\/td><\/tr>`;
    }
}

async function cancelarMiMatricula(idMatricula) {
    try {
        await apiRequest(`/matriculas/${idMatricula}`, { method: 'DELETE' });
        toast('Matrícula cancelada exitosamente', '#10b981');
        cargarMisMatriculas();
        cargarDashboard();
        cargarOferta();
    } catch (error) {
        toast(`Error: ${error.message}`, '#ef4444');
    }
}

// ==================== PAGOS ====================
async function cargarFacturas() {
    const tbody = document.getElementById('facturas-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7">Cargando...</td></tr>';
    try {
        let facturas = await apiRequest('/admin/facturas');
        const search = document.getElementById('search-factura')?.value.toLowerCase() || '';
        const filtroEstado = document.getElementById('filtro-estado-factura')?.value || '';
        if (search) facturas = facturas.filter(f => f.estudiante_nombre?.toLowerCase().includes(search));
        if (filtroEstado) facturas = facturas.filter(f => f.estado === filtroEstado);
        const pagadas = facturas.filter(f => f.estado === 'Pagada');
        const pendientes = facturas.filter(f => f.estado === 'Pendiente');
        const statsContainer = document.getElementById('pagos-stats');
        if (statsContainer) statsContainer.innerHTML = `<div class="pago-stat"><div><div class="amount">${pagadas.reduce((s, f) => s + f.monto, 0).toLocaleString()}</div><div class="plbl">Total Pagado</div></div><div class="stat-icon green">✓</div></div>
            <div class="pago-stat"><div><div class="amount">${pendientes.reduce((s, f) => s + f.monto, 0).toLocaleString()}</div><div class="plbl">Pendiente</div></div><div class="stat-icon amber">⏱</div></div>`;
        if (facturas.length === 0) tbody.innerHTML = '<tr><td colspan="7">No hay facturas</td></tr>';
        else tbody.innerHTML = facturas.map(f => `
            <tr>
                <td><span class="badge badge-blue">INV-${f.id_factura}</span></td>
                <td>${f.estudiante_nombre || 'N/A'}</td>
                <td>Matrícula</td>
                <td>${f.monto.toLocaleString()}</td>
                <td>${new Date(f.fecha_vencimiento).toLocaleDateString()}</td>
                <td><span class="badge ${f.estado === 'Pagada' ? 'badge-green' : 'badge-amber'}">${f.estado}</span></td>
                <td>${f.estado === 'Pendiente' ? `<button class="btn-pagar" onclick="abrirPagoFactura(${f.id_factura}, ${f.monto})">Pagar</button>` : 'Pagado'}</td>
            </tr>
        `).join('');
    } catch (error) { console.error('Error cargando facturas:', error); tbody.innerHTML = `<tr><td colspan="7" style="color:red">Error cargando datos: ${error.message}</td></tr>`; }
}

function abrirPagoFactura(idFactura, monto) {
    const pagoInfo = document.getElementById('pago-info');
    pagoInfo.innerHTML = `<div><b>Factura:</b> INV-${idFactura}</div><div><b>Monto a pagar:</b> <span style="color:#10b981">${monto.toLocaleString()}</span></div>`;
    document.getElementById('modal-pago').dataset.facturaId = idFactura;
    openMod('modal-pago');
}

async function procesarPago() {
    const idFactura = parseInt(document.getElementById('modal-pago').dataset.facturaId);
    const metodo = document.getElementById('pago-metodo').value;
    const referencia = document.getElementById('pago-ref').value;
    try {
        await apiRequest('/pagos/procesar', { method: 'POST', body: JSON.stringify({ id_factura: idFactura, metodo_pago: metodo, referencia }) });
        toast('Pago procesado exitosamente', '#10b981');
        closeMods();
        cargarFacturas();
        cargarDashboard();
    } catch (error) { toast(`Error: ${error.message}`, '#ef4444'); }
}

// ==================== REPORTES ====================
async function cargarEstadisticasReportes() {
    try {
        const matriculasReport = await apiRequest('/reportes/matriculas');
        const financieroReport = await apiRequest('/reportes/financieros');
        const estudiantesReport = await apiRequest('/reportes/estudiantes');
        const statsContainer = document.getElementById('report-stats');
        statsContainer.innerHTML = `<div class="stat-card"><div class="val">${matriculasReport.reduce((sum, p) => sum + p.total_matriculas, 0) || 0}</div><div class="lbl">Matrículas</div></div>
            <div class="stat-card"><div class="val">${estudiantesReport.filter(e => e.rol === 'Estudiante').length}</div><div class="lbl">Estudiantes</div></div>
            <div class="stat-card"><div class="val">${((financieroReport.total_pagado || 0) / 1000000).toFixed(1)}M</div><div class="lbl">Ingresos</div></div>
            <div class="stat-card"><div class="val">${((financieroReport.total_pendiente || 0) / 1000000).toFixed(1)}M</div><div class="lbl">Pendiente</div></div>`;
    } catch (error) { console.error('Error cargando estadísticas:', error); }
}

async function generarReporte(tipo) {
    const container = document.getElementById('reporte-contenedor');
    container.innerHTML = '<div style="text-align:center">Generando reporte...</div>';
    try {
        let datos = [];
        if (tipo === 'matriculas') datos = await apiRequest('/reportes/matriculas');
        else if (tipo === 'financiero') datos = [await apiRequest('/reportes/financieros')];
        else if (tipo === 'estudiantes') datos = await apiRequest('/reportes/estudiantes');
        else if (tipo === 'pagos') datos = await apiRequest('/admin/facturas');
        
        let html = '<div class="reporte-container">';
        if (tipo === 'matriculas') {
            html += '<h4>Reporte de Matrículas</h4><table class="data-table"><thead><tr><th>Periodo</th><th>Total Matrículas</th><th>Estudiantes</th></tr></thead><tbody>';
            datos.forEach(d => html += `<tr><td>${d.periodo} ${d.anio}</td><td>${d.total_matriculas}</td><td>${d.total_estudiantes}</td></tr>`);
            html += '</tbody><tr>';
        } else if (tipo === 'financiero') {
            html += `<h4>Reporte Financiero</h4><div class="stats-grid"><div class="stat-card"><div class="val">${(datos[0]?.total_pagado || 0).toLocaleString()}</div><div class="lbl">Total Pagado</div></div>
                <div class="stat-card"><div class="val">${(datos[0]?.total_pendiente || 0).toLocaleString()}</div><div class="lbl">Total Pendiente</div></div>
                <div class="stat-card"><div class="val">${datos[0]?.facturas_pagadas || 0}</div><div class="lbl">Facturas Pagadas</div></div>
                <div class="stat-card"><div class="val">${datos[0]?.facturas_pendientes || 0}</div><div class="lbl">Facturas Pendientes</div></div></div>`;
        } else if (tipo === 'estudiantes') {
            html += '<h4>Reporte de Estudiantes</h4><table class="data-table"><thead><tr><th>Nombre</th><th>Email</th><th>Carnet</th><th>Carrera</th><th>Estado</th></tr></thead><tbody>';
            datos.forEach(d => html += `<tr>
                <td>${d.nombre}</td>
                <td>${d.correo_institucional}</td>
                <td>${d.carnet || '-'}</td>
                <td>${d.carrera || '-'}</td>
                <td><span class="badge ${d.estado === 'Activo' ? 'badge-green' : 'badge-danger'}">${d.estado}</span></td>
            </tr>`);
            html += '</tbody></table>';
        } else if (tipo === 'pagos') {
            html += '<h4>Reporte de Pagos</h4><table class="data-table"><thead><tr><th>Factura</th><th>Estudiante</th><th>Monto</th><th>Estado</th><th>Fecha Pago</th></tr></thead><tbody>';
            datos.forEach(d => html += `<td>
                <td><span class="badge badge-blue">INV-${d.id_factura}</span></td>
                <td>${d.estudiante_nombre}</td>
                <td>${d.monto.toLocaleString()}</td>
                <td><span class="badge ${d.estado === 'Pagada' ? 'badge-green' : 'badge-amber'}">${d.estado}</span></td>
                <td>${d.fecha_pago ? new Date(d.fecha_pago).toLocaleDateString() : '-'}</td>
            </tr>`);
            html += '</tbody></table>';
        }
        html += '<button class="btn-primary" onclick="window.print()">Imprimir Reporte</button></div>';
        container.innerHTML = html;
    } catch (error) { container.innerHTML = `<div style="color:red">Error generando reporte: ${error.message}</div>`; }
}

// ==================== USUARIOS ====================
async function cargarUsuarios() {
    const tbody = document.getElementById('usuarios-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8">Cargando...</td></tr>';
    try {
        const usuarios = await apiRequest('/admin/usuarios');
        if (usuarios.length === 0) tbody.innerHTML = '<tr><td colspan="8">No hay usuarios registrados</td></tr>';
        else tbody.innerHTML = usuarios.map(u => `<tr>
            <td>${u.id_usuario}</td>
            <td>${u.nombre}</td>
            <td>${u.correo_institucional}</td>
            <td>${u.carnet || '-'}</td>
            <td>${u.programa_nombre || '-'}</td>
            <td><span class="badge ${u.id_rol === 2 ? 'badge-warning' : 'badge-success'}">${u.rol_nombre}</span></td>
            <td><span class="badge ${u.estado === 'Activo' ? 'badge-green' : 'badge-danger'}">${u.estado}</span></td>
            <td>${u.id_rol !== 2 ? `<button class="btn-small" onclick="cambiarRolUsuario(${u.id_usuario}, 'admin')">Hacer Admin</button>` : 
                `<button class="btn-small" onclick="cambiarRolUsuario(${u.id_usuario}, 'student')">Quitar Admin</button>`}
            <button class="btn-small btn-danger" onclick="eliminarUsuario(${u.id_usuario})">Eliminar</button></td>
        </tr>`).join('');
    } catch (error) { console.error('Error cargando usuarios:', error); tbody.innerHTML = `</table><td colspan="8" style="color:red">Error cargando datos: ${error.message}</td></tr>`; }
}

function mostrarModalUsuario() {
    document.getElementById('usuario-id').value = '';
    document.getElementById('usuario-nombre').value = '';
    document.getElementById('usuario-email').value = '';
    document.getElementById('usuario-carnet').value = '';
    document.getElementById('usuario-password').value = '';
    document.getElementById('usuario-confirm-password').value = '';
    document.getElementById('usuario-rol').value = 'student';
    openMod('modal-usuario');
}

async function guardarUsuario() {
    const nombre = document.getElementById('usuario-nombre').value.trim();
    const email = document.getElementById('usuario-email').value.trim();
    const carnet = document.getElementById('usuario-carnet').value.trim();
    const password = document.getElementById('usuario-password').value;
    const confirmPassword = document.getElementById('usuario-confirm-password').value;
    const rol = document.getElementById('usuario-rol').value;
    const id_programa = document.getElementById('usuario-carrera').value;
    if (!nombre || !email || !password) { toast('Complete los campos obligatorios', '#ef4444'); return; }
    if (password !== confirmPassword) { toast('Las contraseñas no coinciden', '#ef4444'); return; }
    if (!carnet) { toast('El carnet es obligatorio', '#ef4444'); return; }
    try {
        await apiRequest('/auth/register', { method: 'POST', body: JSON.stringify({ nombre, email, carnet, password, rol, id_programa: id_programa ? parseInt(id_programa) : null }) });
        toast('Usuario creado exitosamente', '#10b981');
        closeMods();
        cargarUsuarios();
    } catch (error) { toast(`Error: ${error.message}`, '#ef4444'); }
}

async function cambiarRolUsuario(idUsuario, nuevoRol) {
    try {
        await apiRequest(`/admin/usuarios/${idUsuario}/rol`, { method: 'PUT', body: JSON.stringify({ rol: nuevoRol }) });
        toast('Rol actualizado', '#10b981');
        cargarUsuarios();
    } catch (error) { toast(`Error: ${error.message}`, '#ef4444'); }
}

async function eliminarUsuario(idUsuario) {
    if (idUsuario === currentUser.id_usuario) { toast('No puede eliminar su propio usuario', '#ef4444'); return; }
    try {
        await apiRequest(`/admin/usuarios/${idUsuario}`, { method: 'DELETE' });
        toast('Usuario eliminado', '#10b981');
        cargarUsuarios();
    } catch (error) { toast(`Error: ${error.message}`, '#ef4444'); }
}

// ==================== BITÁCORA ====================
async function cargarBitacora() {
    const container = document.getElementById('bitacora-container');
    container.innerHTML = '<div>Cargando...</div>';
    try {
        let url = '/admin/bitacora?';
        const fecha_inicio = document.getElementById('filtro-fecha-inicio')?.value;
        const fecha_fin = document.getElementById('filtro-fecha-fin')?.value;
        const usuario = document.getElementById('filtro-usuario')?.value;
        const accion = document.getElementById('filtro-accion')?.value;
        if (fecha_inicio) url += `fecha_inicio=${fecha_inicio}&`;
        if (fecha_fin) url += `fecha_fin=${fecha_fin}&`;
        if (usuario) url += `usuario=${encodeURIComponent(usuario)}&`;
        if (accion) url += `accion=${accion}&`;
        const data = await apiRequest(url);
        if (data.registros.length === 0) { container.innerHTML = '<div>No hay registros de auditoría</div>'; return; }
        let html = `<div class="bitacora-stats"><div class="stat-card-mini">Total registros: ${data.estadisticas.total_registros}</div>
            <div class="stat-card-mini">Usuarios activos: ${data.estadisticas.usuarios_activos}</div>
            <div class="stat-card-mini">Últimos 7 días: ${data.estadisticas.registros_7dias}</div></div>
            <div class="table-wrapper"><table class="data-table"><thead><tr><th>Fecha/Hora</th><th>Usuario</th><th>Rol</th><th>Acción</th><th>Entidad</th><th>Detalle</th><th>IP</th></tr></thead><tbody>`;
        data.registros.forEach(reg => { html += `<tr>
            <td>${new Date(reg.fecha_hora).toLocaleString()}</td>
            <td>${reg.nombre_usuario}</td>
            <td><span class="badge ${reg.rol_usuario === 'Administrador' ? 'badge-warning' : 'badge-info'}">${reg.rol_usuario}</span></td>
            <td><span class="badge badge-info">${reg.accion}</span></td>
            <td>${reg.entidad} ${reg.id_entidad ? `#${reg.id_entidad}` : ''}</td>
            <td>${reg.detalle || '-'}</td>
            <td><small>${reg.ip_address || '-'}</small></td>
        </tr>`; });
        html += '</tbody></table></div>';
        container.innerHTML = html;
    } catch (error) { container.innerHTML = `<div style="color:red">Error cargando bitácora: ${error.message}</div>`; }
}

function limpiarFiltrosBitacora() {
    ['filtro-fecha-inicio', 'filtro-fecha-fin', 'filtro-usuario', 'filtro-accion'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    cargarBitacora();
}

async function exportarBitacora() {
    const fecha_inicio = document.getElementById('filtro-fecha-inicio')?.value || '';
    const fecha_fin = document.getElementById('filtro-fecha-fin')?.value || '';
    window.open(`${API_URL}/admin/bitacora/exportar?fecha_inicio=${fecha_inicio}&fecha_fin=${fecha_fin}`, '_blank');
    toast('Exportando bitácora...', '#3b82f6');
}

// ==================== FUNCIONES CRUD CARRERAS ====================
function mostrarModalCarrera() {
    document.getElementById('carrera-id').value = '';
    document.getElementById('carrera-codigo').value = '';
    document.getElementById('carrera-nombre').value = '';
    openMod('modal-carrera');
}

async function guardarCarrera() {
    const id = document.getElementById('carrera-id').value;
    const codigo = document.getElementById('carrera-codigo').value.trim();
    const nombre = document.getElementById('carrera-nombre').value.trim();
    if (!codigo || !nombre) { toast('Complete todos los campos', '#ef4444'); return; }
    try {
        if (id) await apiRequest(`/carreras/${id}`, { method: 'PUT', body: JSON.stringify({ codigo, nombre }) });
        else await apiRequest('/carreras', { method: 'POST', body: JSON.stringify({ codigo, nombre }) });
        toast('Carrera guardada', '#10b981');
        closeMods();
        cargarCarreras();
    } catch (error) { toast(`Error: ${error.message}`, '#ef4444'); }
}

async function editarCarrera(id) {
    const carrera = allCarreras.find(c => c.id_programa === id);
    if (!carrera) return;
    document.getElementById('carrera-id').value = carrera.id_programa;
    document.getElementById('carrera-codigo').value = carrera.codigo;
    document.getElementById('carrera-nombre').value = carrera.nombre;
    openMod('modal-carrera');
}

async function eliminarCarrera(id) {
    try {
        await apiRequest(`/carreras/${id}`, { method: 'DELETE' });
        toast('Carrera eliminada', '#10b981');
        cargarCarreras();
    } catch (error) { toast(`Error: ${error.message}`, '#ef4444'); }
}

// ==================== FUNCIONES CRUD CURSOS ====================
function mostrarModalCurso() {
    document.getElementById('curso-id').value = '';
    document.getElementById('curso-codigo').value = '';
    document.getElementById('curso-nombre').value = '';
    document.getElementById('curso-creditos').value = '';
    document.getElementById('curso-costo').value = '60000';
    document.getElementById('curso-descripcion').value = '';
    openMod('modal-curso');
}

async function guardarCurso() {
    const id = document.getElementById('curso-id').value;
    const codigo = document.getElementById('curso-codigo').value.trim();
    const nombre = document.getElementById('curso-nombre').value.trim();
    const creditos = document.getElementById('curso-creditos').value;
    const costo_credito = document.getElementById('curso-costo').value;
    const id_programa = document.getElementById('curso-programa').value;
    const descripcion = document.getElementById('curso-descripcion').value;
    if (!codigo || !nombre || !creditos) { toast('Código, nombre y créditos son obligatorios', '#ef4444'); return; }
    try {
        if (id) await apiRequest(`/cursos/${id}`, { method: 'PUT', body: JSON.stringify({ codigo, nombre, creditos: parseInt(creditos), costo_credito: parseFloat(costo_credito), id_programa: id_programa ? parseInt(id_programa) : null, descripcion }) });
        else await apiRequest('/cursos', { method: 'POST', body: JSON.stringify({ codigo, nombre, creditos: parseInt(creditos), costo_credito: parseFloat(costo_credito), id_programa: id_programa ? parseInt(id_programa) : null, descripcion }) });
        toast('Curso guardado', '#10b981');
        closeMods();
        cargarCursos();
    } catch (error) { toast(`Error: ${error.message}`, '#ef4444'); }
}

async function editarCurso(id) {
    const curso = allCursos.find(c => c.id_curso === id);
    if (!curso) return;
    document.getElementById('curso-id').value = curso.id_curso;
    document.getElementById('curso-codigo').value = curso.codigo;
    document.getElementById('curso-nombre').value = curso.nombre;
    document.getElementById('curso-creditos').value = curso.creditos;
    document.getElementById('curso-costo').value = curso.costo_credito || '';
    document.getElementById('curso-descripcion').value = curso.descripcion || '';
    document.getElementById('curso-programa').value = curso.id_programa || '';
    openMod('modal-curso');
}

async function cambiarEstadoCurso(id, nuevoEstado) {
    try {
        await apiRequest(`/cursos/${id}/estado`, { method: 'PUT', body: JSON.stringify({ estado: nuevoEstado }) });
        toast(`Curso ${nuevoEstado === 'Activo' ? 'activado' : 'inactivado'}`, '#10b981');
        cargarCursos();
    } catch (error) { toast(`Error: ${error.message}`, '#ef4444'); }
}

// ==================== FUNCIONES CRUD PLANES ====================
function mostrarModalPlan() {
    document.getElementById('plan-id').value = '';
    document.getElementById('plan-nombre').value = '';
    document.getElementById('plan-carrera').value = '';
    document.getElementById('plan-estado').value = 'Activo';
    openMod('modal-plan');
}

async function guardarPlan() {
    const id = document.getElementById('plan-id').value;
    const nombre_plan = document.getElementById('plan-nombre').value.trim();
    const carrera = document.getElementById('plan-carrera').value.trim();
    const estado = document.getElementById('plan-estado').value;
    if (!nombre_plan || !carrera) { toast('Nombre y carrera son obligatorios', '#ef4444'); return; }
    try {
        if (id) await apiRequest(`/planes/${id}`, { method: 'PUT', body: JSON.stringify({ nombre_plan, carrera, estado }) });
        else await apiRequest('/planes', { method: 'POST', body: JSON.stringify({ nombre_plan, carrera }) });
        toast('Plan guardado', '#10b981');
        closeMods();
        cargarPlanes();
    } catch (error) { toast(`Error: ${error.message}`, '#ef4444'); }
}

async function editarPlan(id) {
    const plan = allPlanes.find(p => p.id_plan === id);
    if (!plan) return;
    document.getElementById('plan-id').value = plan.id_plan;
    document.getElementById('plan-nombre').value = plan.nombre_plan;
    document.getElementById('plan-carrera').value = plan.carrera;
    document.getElementById('plan-estado').value = plan.estado;
    openMod('modal-plan');
}

async function eliminarPlan(id) {
    try {
        await apiRequest(`/planes/${id}`, { method: 'DELETE' });
        toast('Plan eliminado', '#10b981');
        cargarPlanes();
    } catch (error) { toast(`Error: ${error.message}`, '#ef4444'); }
}

async function verCursosPlan(idPlan) {
    try {
        const cursos = await apiRequest(`/planes/${idPlan}/cursos`);
        const plan = allPlanes.find(p => p.id_plan === idPlan);
        const modalContent = document.getElementById('modal-cursos-plan-content');
        if (cursos.length === 0) {
            modalContent.innerHTML = '<p style="text-align:center">No hay cursos asociados a este plan</p>';
        } else {
            modalContent.innerHTML = `
                <table class="data-table">
                    <thead><tr><th>Curso</th><th>Cuatrimestre</th><th>Créditos</th><th>Requisito</th><th>Acciones</th></tr></thead>
                    <tbody>
                        ${cursos.map(c => `
                            <tr>
                                <td>${c.codigo} - ${c.curso_nombre}</td>
                                <td>${c.cuatrimestre}</td>
                                <td>${c.creditos}</td>
                                <td>${c.requisito || '-'}</td>
                                <td><button class="btn-small btn-danger" onclick="eliminarCursoPlan(${idPlan}, ${c.id_curso})">Quitar</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }
        document.getElementById('modal-cursos-plan-title').textContent = `Cursos del Plan: ${plan?.nombre_plan}`;
        openMod('modal-cursos-plan');
    } catch (error) { toast(`Error: ${error.message}`, '#ef4444'); }
}

function mostrarAgregarCursoPlan() {
    const idPlan = document.getElementById('plan-id')?.value;
    if (!idPlan) {
        toast('Seleccione un plan primero', '#ef4444');
        return;
    }
    const cursoSelect = document.getElementById('plan-curso-id');
    cursoSelect.innerHTML = '<option value="">Seleccione un curso</option>' + 
        allCursos.filter(c => c.estado === 'Activo').map(c => `<option value="${c.id_curso}">${c.codigo} - ${c.nombre}</option>`).join('');
    document.getElementById('plan-curso-cuatrimestre').value = '';
    document.getElementById('plan-curso-creditos').value = '';
    document.getElementById('plan-curso-requisito').value = '';
    openMod('modal-agregar-curso-plan');
}

async function guardarCursoPlan() {
    const idPlan = document.getElementById('plan-id').value;
    const id_curso = document.getElementById('plan-curso-id').value;
    const cuatrimestre = document.getElementById('plan-curso-cuatrimestre').value;
    const creditos = document.getElementById('plan-curso-creditos').value;
    const requisito = document.getElementById('plan-curso-requisito').value;
    if (!id_curso || !cuatrimestre || !creditos) {
        toast('Complete todos los campos', '#ef4444');
        return;
    }
    try {
        await apiRequest(`/planes/${idPlan}/cursos`, {
            method: 'POST',
            body: JSON.stringify({ id_curso: parseInt(id_curso), cuatrimestre: parseInt(cuatrimestre), creditos: parseInt(creditos), requisito })
        });
        toast('Curso agregado al plan', '#10b981');
        closeMods();
        verCursosPlan(idPlan);
    } catch (error) {
        toast(`Error: ${error.message}`, '#ef4444');
    }
}

async function eliminarCursoPlan(idPlan, idCurso) {
    try {
        await apiRequest(`/planes/${idPlan}/cursos/${idCurso}`, { method: 'DELETE' });
        toast('Curso removido del plan', '#10b981');
        closeMods();
        verCursosPlan(idPlan);
    } catch (error) {
        toast(`Error: ${error.message}`, '#ef4444');
    }
}

// ==================== FUNCIONES GENERALES ====================
function openMod(id) { document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open')); document.getElementById(id).classList.add('open'); }
function closeMods() { document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open')); deleteCallback = null; }
function doDelete() { if (deleteCallback) { deleteCallback(); deleteCallback = null; } }

function toast(msg, color) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.style.background = color;
    t.style.display = 'block';
    setTimeout(() => t.style.display = 'none', 3000);
}

function addNotification(userId, title, message, type = 'info') {
    const notif = { id: Date.now(), userId, title, message, type, time: new Date().toLocaleTimeString(), read: false };
    notificationsDB.unshift(notif);
    updateNotificationBadge();
    localStorage.setItem('notifications', JSON.stringify(notificationsDB));
}

function updateNotificationBadge() {
    if (!currentUser) return;
    const unreadCount = notificationsDB.filter(n => !n.read && n.userId === currentUser.id_usuario).length;
    const badge = document.getElementById('notif-count');
    if (badge) { badge.textContent = unreadCount; badge.style.display = unreadCount > 0 ? 'flex' : 'none'; }
    renderNotificationsPanel();
}

function renderNotificationsPanel() {
    const container = document.getElementById('notifications-list');
    if (!container || !currentUser) return;
    const userNotifs = notificationsDB.filter(n => n.userId === currentUser.id_usuario);
    if (userNotifs.length === 0) container.innerHTML = '<div>No hay notificaciones</div>';
    else container.innerHTML = userNotifs.map(n => `<div class="notif-item" onclick="markNotificationRead(${n.id})"><div class="notif-dot" style="background:${n.type === 'success' ? '#10b981' : '#3b82f6'}"></div><div class="notif-body"><h4>${n.title}</h4><p>${n.message}</p><span class="notif-time">${n.time}</span></div></div>`).join('');
}

function markNotificationRead(id) {
    const notif = notificationsDB.find(n => n.id === id);
    if (notif) notif.read = true;
    updateNotificationBadge();
}

function toggleNotif() { document.getElementById('notif-panel').classList.toggle('open'); }
function closeNotif() { document.getElementById('notif-panel').classList.remove('open'); }

// ==================== INICIALIZACIÓN ====================
document.addEventListener('DOMContentLoaded', () => {
    const savedNotifs = localStorage.getItem('notifications');
    if (savedNotifs) notificationsDB = JSON.parse(savedNotifs);
    const savedToken = localStorage.getItem('authToken');
    const savedUser = localStorage.getItem('currentUser');
    if (savedToken && savedUser) {
        authToken = savedToken;
        currentUser = JSON.parse(savedUser);
        const savedEstudiante = localStorage.getItem('currentEstudiante');
        if (savedEstudiante) currentEstudiante = JSON.parse(savedEstudiante);
        completeLogin();
    }
    document.getElementById('mobileMenuBtn')?.addEventListener('click', () => document.getElementById('sidebar')?.classList.toggle('open'));
    document.getElementById('sidebarClose')?.addEventListener('click', () => document.getElementById('sidebar')?.classList.remove('open'));
    document.querySelectorAll('.modal-overlay').forEach(o => { o.addEventListener('click', function(e) { if (e.target === this) closeMods(); }); });
    document.addEventListener('click', e => { const panel = document.getElementById('notif-panel'); if (panel?.classList.contains('open') && !panel.contains(e.target) && !e.target.closest('#notif-trigger')) closeNotif(); });
    fetch('http://localhost:3000/api/health').then(res => res.json()).then(data => console.log('Servidor conectado:', data)).catch(err => { console.error('Error:', err); toast('No se pudo conectar al servidor', '#ef4444'); });
});