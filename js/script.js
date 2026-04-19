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


const API_URL = 'http://localhost:3000/api';

// ==================== FUNCIONES DE API ====================
async function apiRequest(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error en la petición');
        }
        
        return response.json();
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// ==================== AUTENTICACIÓN ====================
async function doLoginWithSSO() {
    toast('Autenticando con SSO...', '#3b82f6');
    doManualLogin();
}

async function doManualLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const roleEl = document.getElementById('login-role');
    const role = roleEl ? roleEl.value : '';
    
    if (!email || !password) {
        toast('❌ Ingrese correo y contraseña', '#ef4444');
        return;
    }
    
    try {
        const data = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password, role })
        });
        
        if (data.success) {
            authToken = data.token;
            currentUser = data.usuario;
            
            if (currentUser.id_rol === 1) {
                try {
                    const estudianteData = await apiRequest('/auth/estudiante');
                    if (estudianteData.success && estudianteData.estudiante) {
                        currentEstudiante = estudianteData.estudiante;
                    }
                } catch (e) {
                    console.log('No es estudiante o no tiene datos adicionales');
                }
            }
            
            completeLogin();
        } else {
            toast('Error de autenticación', '#ef4444');
        }
    } catch (error) {
        console.error('Login error:', error);
        toast('Error al conectar con el servidor', '#ef4444');
    }
}

async function register() {
    const nombre = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const carnet = document.getElementById('regCarnet').value;
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;
    const carrera = document.getElementById('regCarrera').value;
    
    if (!nombre || !email || !password || !carrera) {
        toast('Complete todos los campos', '#ef4444');
        return;
    }
    
    if (password !== confirmPassword) {
        toast('Las contraseñas no coinciden', '#ef4444');
        return;
    }
    
    if (!carnet) {
        toast('El carnet es obligatorio', '#ef4444');
        return;
    }
    
    try {
        await apiRequest('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ 
                nombre, 
                email, 
                carnet, 
                password, 
                rol: 'student',
                id_programa: parseInt(carrera)
            })
        });
        
        toast('Registro exitoso. Ahora puede iniciar sesión', '#10b981');
        switchAuthTab('login');
        
        document.getElementById('regName').value = '';
        document.getElementById('regEmail').value = '';
        document.getElementById('regCarnet').value = '';
        document.getElementById('regPassword').value = '';
        document.getElementById('regConfirmPassword').value = '';
        document.getElementById('regCarrera').value = '';
        
    } catch (error) {
        toast(`Error: ${error.message}`, '#ef4444');
    }
}

function completeLogin() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    
    updateUserInfo();
    renderSidebarMenu();
    loadDashboardData();
    loadOfertaData();
    loadPeriodosOferta();
    loadCarreras();
    loadCursos();
    loadPeriodos();
    
    addNotification(currentUser.id_usuario, 'Bienvenido', `Has iniciado sesión como ${currentUser.rol === 'Administrador' ? 'Administrador' : 'Estudiante'}`, 'success');
    showPage('dashboard');
    toast(`Bienvenido/a, ${currentUser.nombre}`, '#10b981');
}

function doLogout() {
    authToken = null;
    currentUser = null;
    currentEstudiante = null;
    document.getElementById('app').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('login-email').value = '';
    document.getElementById('login-password').value = '';
}

function switchAuthTab(tab) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const tabs = document.querySelectorAll('.auth-tab');
    
    if (tab === 'login') {
        if (loginForm) loginForm.style.display = 'block';
        if (registerForm) registerForm.style.display = 'none';
        if (tabs[0]) tabs[0].classList.add('active');
        if (tabs[1]) tabs[1].classList.remove('active');
    } else {
        if (loginForm) loginForm.style.display = 'none';
        if (registerForm) registerForm.style.display = 'block';
        if (tabs[0]) tabs[0].classList.remove('active');
        if (tabs[1]) tabs[1].classList.add('active');
    }
}

// ==================== UI ====================
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
            { id: 'oferta', name: 'Oferta Académica', icon: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z' },
            { id: 'matricula', name: 'Gestión Matrículas', icon: 'M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z' },
            { id: 'pagos', name: 'Gestión Pagos', icon: 'M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z' },
            { id: 'usuarios', name: 'Gestión Usuarios', icon: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z' },
            { id: 'reportes', name: 'Reportes', icon: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z' }
        ];
    } else {
        menuItems = [
            { id: 'dashboard', name: 'Mi Dashboard', icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z' },
            { id: 'oferta', name: 'Oferta Académica', icon: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z' },
            { id: 'mis-matriculas', name: 'Mis Matrículas', icon: 'M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z' },
            { id: 'mis-pagos', name: 'Mis Pagos', icon: 'M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z' }
        ];
    }
    
    navMenu.innerHTML = menuItems.map(item => `
        <div class="nav-item" data-page="${item.id}" onclick="showPage('${item.id}')">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="${item.icon}"/></svg>
            ${item.name}
        </div>
    `).join('');
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    const pageMap = {
        'dashboard': 'page-dashboard',
        'oferta': 'page-oferta',
        'mis-matriculas': 'page-mis-matriculas',
        'mis-pagos': 'page-mis-pagos',
        'matricula': 'page-matricula',
        'pagos': 'page-pagos',
        'usuarios': 'page-usuarios',
        'reportes': 'page-reportes'
    };
    
    const targetPage = document.getElementById(pageMap[pageId]);
    if (targetPage) targetPage.classList.add('active');
    
    const activeNav = document.querySelector(`.nav-item[data-page="${pageId}"]`);
    if (activeNav) activeNav.classList.add('active');
    
    const titles = { 
        dashboard: 'Dashboard', 
        oferta: 'Oferta Académica', 
        'mis-matriculas': 'Mis Matrículas', 
        'mis-pagos': 'Mis Pagos', 
        matricula: 'Gestión de Matrículas', 
        pagos: 'Gestión de Pagos',
        usuarios: 'Gestión de Usuarios',
        reportes: 'Reportes del Sistema'
    };
    document.getElementById('page-title').textContent = titles[pageId] || 'UniMatricula';
    document.getElementById('page-subtitle').textContent = currentUser.rol === 'Administrador' ? 'Panel de administración' : 'Gestión académica';
    
    if (pageId === 'dashboard') loadDashboardData();
    if (pageId === 'oferta') loadOfertaData();
    if (pageId === 'mis-matriculas') loadMisMatriculas();
    if (pageId === 'mis-pagos') loadMisFacturas();
    if (pageId === 'matricula') loadMatriculaAdmin();
    if (pageId === 'pagos') loadFacturasAdmin();
    if (pageId === 'usuarios') loadUsuariosAdmin();
    if (pageId === 'reportes') loadReportesAdmin();
    
    const btnNuevoCurso = document.getElementById('btn-nuevo-curso');
    if (btnNuevoCurso) btnNuevoCurso.style.display = currentUser.rol === 'Administrador' && pageId === 'oferta' ? 'inline-flex' : 'none';
    
    closeNotif();
}

// ==================== CARGAR DATOS INICIALES ====================
async function loadCarreras() {
    try {
        const response = await fetch(`${API_URL}/carreras`);
        if (response.ok) {
            allCarreras = await response.json();
        } else {
            allCarreras = [
                { id_programa: 1, nombre: 'Ingeniería en Sistemas', codigo: 'IS' },
                { id_programa: 2, nombre: 'Administración de Empresas', codigo: 'ADM' },
                { id_programa: 3, nombre: 'Contaduría Pública', codigo: 'CONT' }
            ];
        }
        
        const carreraSelect = document.getElementById('regCarrera');
        if (carreraSelect) {
            carreraSelect.innerHTML = '<option value="">Seleccione su carrera</option>' + 
                allCarreras.map(c => `<option value="${c.id_programa}">${c.nombre}</option>`).join('');
        }
        
        const filtroCarrera = document.getElementById('oferta-filter-carrera');
        if (filtroCarrera) {
            filtroCarrera.innerHTML = '<option value="">Todas las carreras</option>' + 
                allCarreras.map(c => `<option value="${c.nombre}">${c.nombre}</option>`).join('');
            filtroCarrera.addEventListener('change', () => aplicarFiltrosOferta());
        }
        
    } catch (error) {
        console.error('Error cargando carreras:', error);
    }
}

async function loadCursos() {
    try {
        const response = await fetch(`${API_URL}/cursos`);
        if (response.ok) {
            allCursos = await response.json();
        } else {
            allCursos = [
                { id_curso: 1, codigo: 'IS-101', nombre: 'Programación I', creditos: 4, id_programa: 1, costo_credito: 60000 },
                { id_curso: 2, codigo: 'IS-102', nombre: 'Bases de Datos I', creditos: 4, id_programa: 1, costo_credito: 60000 },
                { id_curso: 3, codigo: 'IS-103', nombre: 'Estructuras de Datos', creditos: 3, id_programa: 1, costo_credito: 60000 },
                { id_curso: 4, codigo: 'ADM-101', nombre: 'Administración General', creditos: 3, id_programa: 2, costo_credito: 60000 },
                { id_curso: 5, codigo: 'ADM-102', nombre: 'Mercadotecnia', creditos: 3, id_programa: 2, costo_credito: 60000 },
                { id_curso: 6, codigo: 'CONT-101', nombre: 'Contabilidad Básica', creditos: 4, id_programa: 3, costo_credito: 60000 },
                { id_curso: 7, codigo: 'IS-104', nombre: 'Redes de Computadoras', creditos: 3, id_programa: 1, costo_credito: 60000 },
                { id_curso: 8, codigo: 'IS-105', nombre: 'Ingeniería de Software', creditos: 3, id_programa: 1, costo_credito: 60000 }
            ];
        }
    } catch (error) {
        console.error('Error cargando cursos:', error);
    }
}

async function loadPeriodos() {
    try {
        const response = await fetch(`${API_URL}/periodos`);
        if (response.ok) {
            allPeriodos = await response.json();
        } else {
            allPeriodos = [
                { id_periodo: 1, nombre: 'I Ciclo', anio: 2025 },
                { id_periodo: 2, nombre: 'II Ciclo', anio: 2025 }
            ];
        }
    } catch (error) {
        console.error('Error cargando periodos:', error);
    }
}

// ==================== DASHBOARD ====================
async function loadDashboardData() {
    document.getElementById('welcome-title').textContent = `Bienvenido, ${currentUser.nombre}`;
    document.getElementById('period-info').textContent = `Periodo actual: I Ciclo 2025`;
    const statsContainer = document.getElementById('dashboard-stats');
    const debtContainer = document.getElementById('debt-warning-container');
    
    if (currentUser.rol !== 'Administrador' && currentEstudiante) {
        try {
            const matriculas = await apiRequest('/matriculas/mis-matriculas');
            const facturas = await apiRequest('/pagos/mis-facturas');
            
            const totalCreditos = matriculas.reduce((sum, m) => sum + (m.creditos || 0), 0);
            const deudaTotal = facturas.filter(f => f.estado === 'Pendiente').reduce((sum, f) => sum + f.monto, 0);
            
            statsContainer.innerHTML = `
                <div class="stat-card"><div class="val">${matriculas.length}</div><div class="lbl">Cursos</div></div>
                <div class="stat-card"><div class="val">${totalCreditos}</div><div class="lbl">Créditos</div></div>
                <div class="stat-card"><div class="val">₡${deudaTotal.toLocaleString()}</div><div class="lbl">Deuda</div></div>
            `;
            
            if (deudaTotal > 0) {
                debtContainer.innerHTML = `<div class="debt-warning"><span>⚠️ Tienes una deuda pendiente de ₡${deudaTotal.toLocaleString()}. Realiza el pago para continuar.</span></div>`;
            } else {
                debtContainer.innerHTML = '';
            }
            
            const tbody = document.getElementById('my-courses-tbody');
            if (matriculas.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">No tienes cursos matriculados</td></tr>';
            } else {
                tbody.innerHTML = matriculas.map(m => `
                    <tr>
                        <td>${m.codigo || 'N/A'}</td>
                        <td>${m.curso_nombre || 'N/A'}</td>
                        <td>${m.horario || 'N/A'}</td>
                        <td>${m.aula || 'N/A'}</td>
                        <td>${m.docente || 'N/A'}</td>
                        <td><span class="badge badge-green">${m.estado}</span></td>
                    </tr>
                `).join('');
            }
        } catch (error) {
            console.error('Error loading dashboard:', error);
            statsContainer.innerHTML = '<div class="stat-card"><div class="val">Error</div><div class="lbl">Cargando datos</div></div>';
        }
    } else {
        try {
            const matriculasReport = await apiRequest('/reportes/matriculas');
            const financieroReport = await apiRequest('/reportes/financieros');
            
            statsContainer.innerHTML = `
                <div class="stat-card"><div class="val">${matriculasReport.reduce((sum, p) => sum + p.total_estudiantes, 0) || 0}</div><div class="lbl">Estudiantes</div></div>
                <div class="stat-card"><div class="val">${matriculasReport.reduce((sum, p) => sum + p.total_matriculas, 0) || 0}</div><div class="lbl">Matrículas</div></div>
                <div class="stat-card"><div class="val">₡${((financieroReport.total_pagado || 0) / 1000000).toFixed(1)}M</div><div class="lbl">Ingresos</div></div>
            `;
            debtContainer.innerHTML = '';
            
            const tbody = document.getElementById('my-courses-tbody');
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">Panel de administración</td></tr>';
        } catch (error) {
            console.error('Error loading admin dashboard:', error);
        }
    }
}

// ==================== OFERTA ACADÉMICA ====================
async function loadPeriodosOferta() {
    const container = document.getElementById('period-tabs-oferta');
    if (!container) return;
    try {
        const periodos = await (await fetch(`${API_URL}/periodos`)).json();
        if (!Array.isArray(periodos) || periodos.length === 0) {
            container.innerHTML = '<span style="color:#6b7280;font-size:13px">No hay periodos disponibles</span>';
            return;
        }
        allPeriodos = periodos;
        const activo = periodos.find(p => p.activo) || periodos[0];
        currentPeriodoId = activo.id_periodo;
        container.innerHTML = periodos.map(p => `
            <button class="tab-btn ${p.id_periodo === currentPeriodoId ? 'active' : ''}"
                    data-periodo="${p.id_periodo}"
                    onclick="switchPeriodoOferta(this, ${p.id_periodo})">
                ${p.nombre} ${p.anio}
            </button>
        `).join('');
    } catch (error) {
        console.error('Error cargando periodos:', error);
        container.innerHTML = '<span style="color:red;font-size:13px">Error cargando periodos</span>';
    }
}

function switchPeriodoOferta(btn, periodoId) {
    document.querySelectorAll('#period-tabs-oferta .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentPeriodoId = periodoId;
    loadOfertaData();
}

async function loadOfertaData() {
    const tbody = document.getElementById('oferta-tbody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">Cargando...</td></tr>';
    
    try {
        allSecciones = await apiRequest(`/oferta/secciones?periodo_id=${currentPeriodoId}`);
        
        if (allSecciones.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">No hay secciones disponibles</td></tr>';
            return;
        }
        
        aplicarFiltrosOferta();
    } catch (error) {
        console.error('Error loading oferta:', error);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:red">Error cargando oferta académica</td></tr>';
    }
}

function aplicarFiltrosOferta() {
    const tbody = document.getElementById('oferta-tbody');
    const filtroCarrera = document.getElementById('oferta-filter-carrera')?.value || '';
    const searchTerm = document.getElementById('searchCurso')?.value.toLowerCase() || '';
    
    let seccionesFiltradas = [...allSecciones];
    
    if (currentUser.rol !== 'Administrador' && currentEstudiante && currentEstudiante.id_programa) {
        const programaNombre = allCarreras.find(c => c.id_programa === currentEstudiante.id_programa)?.nombre || '';
        seccionesFiltradas = seccionesFiltradas.filter(sec => sec.programa_nombre === programaNombre);
    } else if (filtroCarrera && currentUser.rol === 'Administrador') {
        seccionesFiltradas = seccionesFiltradas.filter(sec => sec.programa_nombre === filtroCarrera);
    }
    
    if (searchTerm) {
        seccionesFiltradas = seccionesFiltradas.filter(sec => 
            sec.curso_nombre.toLowerCase().includes(searchTerm) || 
            sec.codigo.toLowerCase().includes(searchTerm)
        );
    }
    
    if (seccionesFiltradas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">No hay secciones que coincidan con los filtros</td></tr>';
        return;
    }
    
    tbody.innerHTML = seccionesFiltradas.map(sec => {
        const disponibles = sec.disponibles || 0;
        const puedeMatricular = disponibles > 0 && currentUser.rol !== 'Administrador';
        
        return `
            <tr data-id="${sec.id_seccion}" data-carrera="${sec.programa_nombre}">
                <td><strong>${sec.codigo}</strong><br><span style="font-size:11px;color:#6b7280">${sec.curso_nombre}</span></td>
                <td>${sec.programa_nombre || 'N/A'}</td>
                <td>${sec.cupo}</td>
                <td><span class="badge ${disponibles > 0 ? 'badge-green' : 'badge-red'}">${disponibles}</span></td>
                <td>${sec.horario}<br><span style="font-size:11px">${sec.aula} | ${sec.docente}</span></td>
                <td>${currentUser.rol === 'Administrador' ? 
                    `<div class="action-btns"><button class="btn-icon" onclick="editSeccion(${sec.id_seccion})">✏️</button><button class="btn-icon danger" onclick="confirmDeleteSeccion(${sec.id_seccion})">🗑️</button></div>` : 
                    (puedeMatricular ? `<button class="btn-matricular" onclick="matricularEnSeccion(${sec.id_seccion})">Matricular</button>` : 
                    '<span class="badge badge-red">Sin cupo</span>')}
                </td>
            </tr>
        `;
    }).join('');
}

async function matricularEnSeccion(idSeccion) {
    try {
        await apiRequest('/matriculas', {
            method: 'POST',
            body: JSON.stringify({ id_seccion: idSeccion })
        });
        
        toast('✅ Matrícula registrada exitosamente', '#10b981');
        loadOfertaData();
        loadDashboardData();
        if (currentUser.rol !== 'Administrador') {
            loadMisMatriculas();
            loadMisFacturas();
        }
    } catch (error) {
        toast(`❌ Error: ${error.message}`, '#ef4444');
    }
}

// ==================== MIS MATRÍCULAS ====================
function abrirNuevaMatricula() {
    const container = document.getElementById('seccion-list-modal');
    const seccionesDisponibles = allSecciones.filter(sec => 
        sec.disponibles > 0 && 
        (!currentEstudiante || sec.programa_nombre === allCarreras.find(c => c.id_programa === currentEstudiante?.id_programa)?.nombre)
    );
    
    if (seccionesDisponibles.length === 0) {
        toast('❌ No hay secciones disponibles para tu carrera', '#ef4444');
        return;
    }
    
    container.innerHTML = seccionesDisponibles.map(sec => `
        <label class="course-check-item">
            <input type="checkbox" value="${sec.id_seccion}">
            <div>
                <div class="ci-name">${sec.codigo} - ${sec.curso_nombre}</div>
                <div class="ci-code">Créditos: ${sec.creditos} | Cupos: ${sec.disponibles} | ${sec.horario}</div>
            </div>
        </label>
    `).join('');
    
    document.getElementById('matricula-student-field').style.display = 'none';
    document.getElementById('m-title').textContent = 'Nueva Matrícula';
    openMod('modal-matricula');
}

async function confirmarMatriculaWrapper() {
    const checkboxes = document.querySelectorAll('#seccion-list-modal input[type=checkbox]:checked');
    const selectedIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    if (selectedIds.length === 0) {
        toast('Selecciona al menos una sección', '#ef4444');
        return;
    }
    
    let exitosas = 0;
    for (const idSeccion of selectedIds) {
        try {
            await apiRequest('/matriculas', {
                method: 'POST',
                body: JSON.stringify({ id_seccion: idSeccion })
            });
            exitosas++;
        } catch (error) {
            console.error('Error en matrícula:', error);
        }
    }
    
    if (exitosas > 0) {
        toast(`✅ ${exitosas} matrícula(s) registrada(s)`, '#10b981');
        closeMods();
        loadMisMatriculas();
        loadDashboardData();
        loadOfertaData();
    } else {
        toast('❌ Error al registrar matrículas', '#ef4444');
    }
}

async function loadMisMatriculas() {
    const tbody = document.getElementById('mis-matriculas-tbody');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center">Cargando...</td></tr>';
    
    try {
        const matriculas = await apiRequest('/matriculas/mis-matriculas');
        
        if (matriculas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center">No hay matrículas registradas</td></tr>';
        } else {
            tbody.innerHTML = matriculas.map(m => `
                <tr>
                    <td>${m.id_matricula}</td>
                    <td>${m.periodo_nombre ? m.periodo_nombre + ' ' + (m.periodo_anio || '') : 'N/A'}</td>
                    <td><strong>${m.codigo || ''}</strong> ${m.curso_nombre || 'N/A'}</td>
                    <td>${m.creditos || 0}</td>
                    <td>₡${(m.monto || 0).toLocaleString()}</td>
                    <td><span class="badge badge-green">${m.estado}</span></td>
                    <td><button class="btn-pagar" onclick="cancelarMatricula(${m.id_matricula})">Cancelar</button></td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading matriculas:', error);
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:red">Error cargando matrículas</td></tr>';
    }
}

async function cancelarMatricula(idMatricula) {
    deleteCallback = async () => {
        try {
            await apiRequest(`/matriculas/${idMatricula}`, { method: 'DELETE' });
            toast('✅ Matrícula cancelada', '#10b981');
            closeMods();
            loadMisMatriculas();
            loadDashboardData();
            loadOfertaData();
        } catch (error) {
            closeMods();
            toast(`❌ ${error.message}`, '#ef4444');
        }
    };
    document.getElementById('del-name').textContent = `la matrícula #${idMatricula}`;
    openMod('modal-delete');
}

// ==================== MIS PAGOS ====================
async function loadMisFacturas() {
    const tbody = document.getElementById('mis-facturas-tbody');
    const statsContainer = document.getElementById('pagos-stats-student');
    
    try {
        const facturas = await apiRequest('/pagos/mis-facturas');
        
        const pagadas = facturas.filter(f => f.estado === 'Pagada');
        const pendientes = facturas.filter(f => f.estado === 'Pendiente');
        
        if (statsContainer) {
            statsContainer.innerHTML = `
                <div class="pago-stat"><div><div class="amount">₡${pagadas.reduce((s, f) => s + f.monto, 0).toLocaleString()}</div><div class="plbl">Pagado</div></div><div class="stat-icon green">✓</div></div>
                <div class="pago-stat"><div><div class="amount">₡${pendientes.reduce((s, f) => s + f.monto, 0).toLocaleString()}</div><div class="plbl">Pendiente</div></div><div class="stat-icon amber">⏱</div></div>
            `;
        }
        
        if (facturas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">No hay facturas</td></tr>';
        } else {
            tbody.innerHTML = facturas.map(f => `
                <tr>
                    <td><span class="badge badge-blue">INV-${f.id_factura}</span></td>
                    <td>${f.concepto || 'Matrícula'}</td>
                    <td>₡${f.monto.toLocaleString()}</td>
                    <td>${new Date(f.fecha_vencimiento).toLocaleDateString()}</td>
                    <td><span class="badge ${f.estado === 'Pagada' ? 'badge-green' : 'badge-amber'}">${f.estado}</span></td>
                    <td>${f.estado === 'Pendiente' ? `<button class="btn-pagar" onclick="abrirPagoFactura(${f.id_factura}, ${f.monto}, '${f.fecha_vencimiento}')">Pagar</button>` : '✅ Pagado'}</td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading facturas:', error);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:red">Error cargando facturas</td></tr>';
    }
}

function abrirPagoFactura(idFactura, monto, vencimiento) {
    const pagoInfo = document.getElementById('pago-info');
    pagoInfo.innerHTML = `
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
            <span><b>Factura:</b></span><span>INV-${idFactura}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
            <span><b>Concepto:</b></span><span>Matrícula universitaria</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
            <span><b>Monto a pagar:</b></span>
            <span style="font-size:1.2rem;font-weight:700;color:#10b981">₡${Number(monto).toLocaleString()}</span>
        </div>
        <div style="display:flex;justify-content:space-between">
            <span><b>Vencimiento:</b></span><span>${new Date(vencimiento).toLocaleDateString()}</span>
        </div>
    `;
    document.getElementById('modal-pago').dataset.facturaId = idFactura;
    openMod('modal-pago');
}

async function procesarPago() {
    const idFactura = parseInt(document.getElementById('modal-pago').dataset.facturaId);
    const metodo = document.getElementById('pago-metodo').value;
    const referencia = document.getElementById('pago-ref').value;
    
    try {
        await apiRequest('/pagos/procesar', {
            method: 'POST',
            body: JSON.stringify({ id_factura: idFactura, metodo_pago: metodo, referencia })
        });
        
        toast('✅ Pago procesado exitosamente', '#10b981');
        closeMods();
        loadMisFacturas();
        loadDashboardData();
    } catch (error) {
        toast(`❌ Error: ${error.message}`, '#ef4444');
    }
}

// ==================== ADMIN: GESTIÓN MATRÍCULAS ====================
async function loadMatriculaAdmin() {
    const tbody = document.getElementById('matricula-tbody-admin');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center">Cargando...</td></tr>';
    
    try {
        const matriculas = await apiRequest('/admin/matriculas');
        
        if (matriculas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center">No hay matrículas registradas</td></tr>';
        } else {
            tbody.innerHTML = matriculas.map(m => `
                <tr>
                    <td>${m.id_matricula}</td>
                    <td>${m.estudiante_nombre || 'N/A'}<br><small>${m.carnet || ''}</small></td>
                    <td>${m.curso_nombre || 'N/A'}</td>
                    <td>${m.periodo_nombre ? m.periodo_nombre + ' ' + (m.periodo_anio || '') : 'N/A'}</td>
                    <td>₡${(m.monto || 0).toLocaleString()}</td>
                    <td><span class="badge badge-green">${m.estado}</span></td>
                    <td><button class="btn-icon danger" onclick="confirmarEliminarMatriculaAdmin(${m.id_matricula})">🗑️</button></td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading admin matriculas:', error);
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:red">Error cargando datos</td></tr>';
    }
}

async function abrirNuevaMatriculaAdmin() {
    try {
        const usuarios = await apiRequest('/admin/usuarios');
        const estudiantes = usuarios.filter(u => u.id_rol === 1);
        const seccionesDisponibles = allSecciones.filter(s => s.disponibles > 0);
        
        if (estudiantes.length === 0) {
            toast('❌ No hay estudiantes registrados', '#ef4444');
            return;
        }
        
        if (seccionesDisponibles.length === 0) {
            toast('❌ No hay secciones con cupos disponibles', '#ef4444');
            return;
        }
        
        const estudianteSelect = document.getElementById('m-estudiante');
        const datalist = document.getElementById('estudiantes-list');
        datalist.innerHTML = estudiantes.map(e => `<option value="${e.id_usuario}|${e.nombre} - ${e.carnet || 'Sin carnet'}">`).join('');
        estudianteSelect.value = '';
        
        const container = document.getElementById('seccion-list-modal');
        container.innerHTML = seccionesDisponibles.map(sec => `
            <label class="course-check-item">
                <input type="checkbox" value="${sec.id_seccion}">
                <div>
                    <div class="ci-name">${sec.codigo} - ${sec.curso_nombre}</div>
                    <div class="ci-code">Créditos: ${sec.creditos} | Cupos: ${sec.disponibles} | ${sec.horario}</div>
                </div>
            </label>
        `).join('');
        
        document.getElementById('matricula-student-field').style.display = 'block';
        document.getElementById('m-title').textContent = 'Nueva Matrícula (Admin)';
        
        // Cambiar el botón de confirmación para usar la función de admin
        const confirmBtn = document.querySelector('#modal-matricula .btn-confirm');
        confirmBtn.onclick = confirmarMatriculaAdminWrapper;
        
        openMod('modal-matricula');
    } catch (error) {
        toast(`❌ Error: ${error.message}`, '#ef4444');
    }
}

async function confirmarMatriculaAdminWrapper() {
    const estudianteInput = document.getElementById('m-estudiante').value;
    const estudianteId = estudianteInput.split('|')[0];
    const checkboxes = document.querySelectorAll('#seccion-list-modal input[type=checkbox]:checked');
    const selectedIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    if (!estudianteId || selectedIds.length === 0) {
        toast('Selecciona estudiante y al menos una sección', '#ef4444');
        return;
    }
    
    let exitosas = 0;
    for (const idSeccion of selectedIds) {
        try {
            await apiRequest('/admin/matriculas', {
                method: 'POST',
                body: JSON.stringify({ id_estudiante: parseInt(estudianteId), id_seccion: idSeccion })
            });
            exitosas++;
        } catch (error) {
            console.error('Error en matrícula:', error);
        }
    }
    
    if (exitosas > 0) {
        toast(`✅ ${exitosas} matrícula(s) registrada(s)`, '#10b981');
        closeMods();
        loadMatriculaAdmin();
        loadDashboardData();
        loadOfertaData();
    } else {
        toast('❌ Error al registrar matrículas', '#ef4444');
    }
}

function confirmarEliminarMatriculaAdmin(idMatricula) {
    deleteCallback = async () => {
        try {
            await apiRequest(`/matriculas/${idMatricula}`, { method: 'DELETE' });
            toast('✅ Matrícula eliminada', '#10b981');
            closeMods();
            loadMatriculaAdmin();
            loadDashboardData();
            loadOfertaData();
        } catch (error) {
            closeMods();
            toast(`❌ ${error.message}`, '#ef4444');
        }
    };
    document.getElementById('del-name').textContent = `la matrícula #${idMatricula}`;
    openMod('modal-delete');
}

async function eliminarMatriculaAdmin(idMatricula) {
    try {
        await apiRequest(`/matriculas/${idMatricula}`, { method: 'DELETE' });
        toast('✅ Matrícula eliminada', '#10b981');
        loadMatriculaAdmin();
        loadDashboardData();
        loadOfertaData();
    } catch (error) {
        toast(`❌ Error: ${error.message}`, '#ef4444');
    }
}

// ==================== ADMIN: FACTURAS ====================
async function loadFacturasAdmin() {
    const tbody = document.getElementById('facturas-tbody-admin');
    const statsContainer = document.getElementById('pagos-stats-admin');
    
    try {
        const facturas = await apiRequest('/admin/facturas');
        
        const pagadas = facturas.filter(f => f.estado === 'Pagada');
        const pendientes = facturas.filter(f => f.estado === 'Pendiente');
        
        if (statsContainer) {
            statsContainer.innerHTML = `
                <div class="pago-stat"><div><div class="amount">₡${pagadas.reduce((s, f) => s + f.monto, 0).toLocaleString()}</div><div class="plbl">Total Pagado</div></div><div class="stat-icon green">✓</div></div>
                <div class="pago-stat"><div><div class="amount">₡${pendientes.reduce((s, f) => s + f.monto, 0).toLocaleString()}</div><div class="plbl">Pendiente</div></div><div class="stat-icon amber">⏱</div></div>
            `;
        }
        
        if (facturas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center">No hay facturas</td></tr>';
        } else {
            tbody.innerHTML = facturas.map(f => `
                <tr>
                    <td><span class="badge badge-blue">INV-${f.id_factura}</span></td>
                    <td>${f.estudiante_nombre || 'N/A'}</td>
                    <td>Matrícula</td>
                    <td>₡${f.monto.toLocaleString()}</td>
                    <td>${new Date(f.fecha_vencimiento).toLocaleDateString()}</td>
                    <td><span class="badge ${f.estado === 'Pagada' ? 'badge-green' : 'badge-amber'}">${f.estado}</span></td>
                    <td>-</td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading admin facturas:', error);
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:red">Error cargando datos</td></tr>';
    }
}

// ==================== ADMIN: USUARIOS ====================
async function loadUsuariosAdmin() {
    const tbody = document.getElementById('usuarios-body');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center">Cargando...</td></tr>';
    
    try {
        const usuarios = await apiRequest('/admin/usuarios');
        
        if (usuarios.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center">No hay usuarios registrados</td></tr>';
        } else {
            tbody.innerHTML = usuarios.map(u => `
                <tr>
                    <td>${u.id_usuario}</td>
                    <td>${u.nombre}</td>
                    <td>${u.correo_institucional}</td>
                    <td>${u.carnet || '-'}</td>
                    <td>${u.programa_nombre || '-'}</td>
                    <td><span class="badge ${u.id_rol === 2 ? 'badge-warning' : 'badge-success'}">${u.rol_nombre}</span></td>
                    <td><span class="badge ${u.estado === 'Activo' ? 'badge-green' : 'badge-danger'}">${u.estado}</span></td>
                    <td>
                        ${u.id_rol !== 2 ? `<button class="btn-small" onclick="cambiarRolUsuario(${u.id_usuario}, 'admin')">Hacer Admin</button>` : 
                                      `<button class="btn-small" onclick="cambiarRolUsuario(${u.id_usuario}, 'student')">Quitar Admin</button>`}
                        <button class="btn-small btn-danger" onclick="eliminarUsuarioAdmin(${u.id_usuario})">Eliminar</button>
                    </td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading usuarios:', error);
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:red">Error cargando datos</td></tr>';
    }
}

async function cambiarRolUsuario(idUsuario, nuevoRol) {
    try {
        await apiRequest(`/admin/usuarios/${idUsuario}/rol`, {
            method: 'PUT',
            body: JSON.stringify({ rol: nuevoRol })
        });
        toast('✅ Rol actualizado', '#10b981');
        loadUsuariosAdmin();
    } catch (error) {
        toast(`❌ Error: ${error.message}`, '#ef4444');
    }
}

async function eliminarUsuarioAdmin(idUsuario) {
    if (idUsuario === currentUser.id_usuario) {
        toast('❌ No puede eliminar su propio usuario', '#ef4444');
        return;
    }
    
    try {
        await apiRequest(`/admin/usuarios/${idUsuario}`, { method: 'DELETE' });
        toast('✅ Usuario eliminado', '#10b981');
        loadUsuariosAdmin();
    } catch (error) {
        toast(`❌ Error: ${error.message}`, '#ef4444');
    }
}

function showUserModal() {
    document.getElementById('u-nombre').value = '';
    document.getElementById('u-email').value = '';
    document.getElementById('u-carnet').value = '';
    document.getElementById('u-rol').value = 'student';
    document.getElementById('u-password').value = '';
    document.getElementById('u-confirm-password').value = '';
    document.getElementById('usuario-modal-title').textContent = '➕ Nuevo Usuario';
    // Populate carrera select from API data
    const carreraSelect = document.getElementById('u-carrera');
    carreraSelect.innerHTML = '<option value="">Seleccione una carrera</option>' +
        allCarreras.map(c => `<option value="${c.id_programa}">${c.nombre}</option>`).join('');
    carreraSelect.value = '';
    openMod('modal-usuario');
}

async function guardarUsuario() {
    const nombre = document.getElementById('u-nombre').value.trim();
    const email = document.getElementById('u-email').value.trim();
    const carnet = document.getElementById('u-carnet').value.trim();
    const carrera = document.getElementById('u-carrera').value;
    const rol = document.getElementById('u-rol').value;
    const password = document.getElementById('u-password').value;
    const confirmPassword = document.getElementById('u-confirm-password').value;

    if (!nombre || !email || !password) {
        toast('❌ Complete los campos obligatorios (Nombre, Correo y Contraseña)', '#ef4444');
        return;
    }

    if (password !== confirmPassword) {
        toast('❌ Las contraseñas no coinciden', '#ef4444');
        return;
    }

    if (!carnet) {
        toast('❌ El carnet es obligatorio', '#ef4444');
        return;
    }

    try {
        await apiRequest('/auth/register', {
            method: 'POST',
            body: JSON.stringify({
                nombre,
                email,
                carnet,
                password,
                rol,
                id_programa: carrera ? parseInt(carrera) : null
            })
        });

        toast('✅ Usuario creado exitosamente', '#10b981');
        closeMods();
        loadUsuariosAdmin();
    } catch (error) {
        toast(`❌ Error: ${error.message}`, '#ef4444');
    }
}

// ==================== ADMIN: SECCIONES ====================
function abrirNuevoCurso() {
    const cursoSelect = document.getElementById('c-id-curso');
    cursoSelect.innerHTML = allCursos.map(c =>
        `<option value="${c.id_curso}">${c.codigo} - ${c.nombre} (${c.creditos} créditos)</option>`
    ).join('');

    const periodoSelect = document.getElementById('c-id-periodo');
    periodoSelect.innerHTML = allPeriodos.map(p =>
        `<option value="${p.id_periodo}">${p.nombre} ${p.anio}</option>`
    ).join('');

    document.getElementById('c-docente').value = '';
    document.getElementById('c-aula').value = '';
    document.getElementById('c-horario').value = '';
    document.getElementById('c-cupo').value = '30';
    document.getElementById('c-title').textContent = 'Nueva Sección';

    // Reset confirm button to creation mode
    const confirmBtn = document.querySelector('#modal-curso .btn-confirm');
    confirmBtn.onclick = saveCurso;
    openMod('modal-curso');
}

async function saveCurso() {
    const idCurso = parseInt(document.getElementById('c-id-curso').value);
    const idPeriodo = parseInt(document.getElementById('c-id-periodo').value);
    const docente = document.getElementById('c-docente').value;
    const aula = document.getElementById('c-aula').value;
    const horario = document.getElementById('c-horario').value;
    const cupo = parseInt(document.getElementById('c-cupo').value);
    
    if (!docente || !aula || !horario) {
        toast('❌ Complete todos los campos', '#ef4444');
        return;
    }
    
    const seccionesPeriodo = allSecciones.filter(s => s.id_periodo === idPeriodo);
    const numeroSeccion = (seccionesPeriodo.length || 0) + 1;
    
    try {
        await apiRequest('/admin/secciones', {
            method: 'POST',
            body: JSON.stringify({ id_curso: idCurso, id_periodo: idPeriodo, numero_seccion: numeroSeccion, docente, aula, horario, cupo })
        });
        
        toast('✅ Sección creada exitosamente', '#10b981');
        closeMods();
        loadOfertaData();
    } catch (error) {
        toast(`❌ Error: ${error.message}`, '#ef4444');
    }
}

function editSeccion(idSeccion) {
    const sec = allSecciones.find(s => s.id_seccion === idSeccion);
    if (!sec) return;

    const cursoSelect = document.getElementById('c-id-curso');
    cursoSelect.innerHTML = allCursos.map(c =>
        `<option value="${c.id_curso}" ${c.id_curso === sec.id_curso ? 'selected' : ''}>${c.codigo} - ${c.nombre} (${c.creditos} créditos)</option>`
    ).join('');

    const periodoSelect = document.getElementById('c-id-periodo');
    periodoSelect.innerHTML = allPeriodos.map(p =>
        `<option value="${p.id_periodo}" ${p.id_periodo === sec.id_periodo ? 'selected' : ''}>${p.nombre} ${p.anio}</option>`
    ).join('');

    document.getElementById('c-docente').value = sec.docente || '';
    document.getElementById('c-aula').value = sec.aula || '';
    document.getElementById('c-horario').value = sec.horario || '';
    document.getElementById('c-cupo').value = sec.cupo || 30;
    document.getElementById('c-title').textContent = '✏️ Editar Sección';

    const confirmBtn = document.querySelector('#modal-curso .btn-confirm');
    confirmBtn.onclick = () => saveSeccionEdit(idSeccion);
    openMod('modal-curso');
}

async function saveSeccionEdit(idSeccion) {
    const docente = document.getElementById('c-docente').value;
    const aula = document.getElementById('c-aula').value;
    const horario = document.getElementById('c-horario').value;
    const cupo = parseInt(document.getElementById('c-cupo').value);

    if (!docente || !aula || !horario) {
        toast('❌ Complete todos los campos', '#ef4444');
        return;
    }

    try {
        await apiRequest(`/admin/secciones/${idSeccion}`, {
            method: 'PUT',
            body: JSON.stringify({ docente, aula, horario, cupo })
        });
        toast('✅ Sección actualizada', '#10b981');
        closeMods();
        loadOfertaData();
    } catch (error) {
        toast(`❌ Error: ${error.message}`, '#ef4444');
    }
}

function confirmDeleteSeccion(idSeccion) {
    const seccion = allSecciones.find(s => s.id_seccion === idSeccion);
    document.getElementById('del-name').textContent = `${seccion?.codigo} - ${seccion?.horario}`;
    window.deleteSeccionId = idSeccion;
    deleteCallback = () => eliminarSeccion(idSeccion);
    openMod('modal-delete');
}

async function eliminarSeccion(idSeccion) {
    try {
        await apiRequest(`/admin/secciones/${idSeccion}`, { method: 'DELETE' });
        toast('✅ Sección eliminada', '#10b981');
        closeMods();
        loadOfertaData();
    } catch (error) {
        toast(`❌ Error: ${error.message}`, '#ef4444');
        closeMods();
    }
}

function doDelete() {
    if (deleteCallback) {
        deleteCallback();
        deleteCallback = null;
    }
}

// ==================== REPORTES ====================
function loadReportesAdmin() {
   
}

function exportReport(tipo) {
    toast(`📊 Exportando reporte de ${tipo}...`, '#3b82f6');
    setTimeout(() => {
        toast('✅ Reporte exportado', '#10b981');
    }, 1500);
}

function generarGraficos() {
    const container = document.getElementById('graficos-container');
    if (container.style.display === 'none') {
        container.style.display = 'block';
        toast('📊 Gráficos cargados', '#3b82f6');
    } else {
        container.style.display = 'none';
    }
}

function exportMatriculaPDF() {
    toast('📄 Generando comprobante PDF...', '#3b82f6');
    setTimeout(() => {
        toast('✅ Comprobante generado', '#10b981');
    }, 1500);
}

function downloadComprobantePDF() {
    toast('📄 Descargando comprobante...', '#3b82f6');
    setTimeout(() => {
        toast('✅ Comprobante descargado', '#10b981');
        closeMods();
    }, 1500);
}

// ==================== NOTIFICACIONES ====================
function addNotification(userId, title, message, type = 'info') {
    const notif = {
        id: Date.now(),
        userId,
        title,
        message,
        type,
        time: new Date().toLocaleTimeString(),
        read: false
    };
    notificationsDB.unshift(notif);
    updateNotificationBadge();
    localStorage.setItem('notifications', JSON.stringify(notificationsDB));
}

function updateNotificationBadge() {
    if (!currentUser) return;
    const unreadCount = notificationsDB.filter(n => !n.read && n.userId === currentUser.id_usuario).length;
    const badge = document.getElementById('notif-count');
    if (badge) {
        badge.textContent = unreadCount;
        badge.style.display = unreadCount > 0 ? 'flex' : 'none';
    }
    renderNotificationsPanel();
}

function renderNotificationsPanel() {
    const container = document.getElementById('notifications-list');
    if (!container || !currentUser) return;
    const userNotifs = notificationsDB.filter(n => n.userId === currentUser.id_usuario);
    if (userNotifs.length === 0) {
        container.innerHTML = '<div style="padding:1rem;text-align:center;color:#6b7280">No hay notificaciones</div>';
        return;
    }
    container.innerHTML = userNotifs.map(n => `
        <div class="notif-item" onclick="markNotificationRead(${n.id})">
            <div class="notif-dot" style="background:${n.type === 'success' ? '#10b981' : n.type === 'warning' ? '#fb923c' : '#3b82f6'}"></div>
            <div class="notif-body"><h4>${n.title}</h4><p>${n.message}</p><span class="notif-time">${n.time}</span></div>
        </div>
    `).join('');
}

function markNotificationRead(id) {
    const notif = notificationsDB.find(n => n.id === id);
    if (notif) notif.read = true;
    updateNotificationBadge();
}

function toggleNotif() {
    document.getElementById('notif-panel').classList.toggle('open');
}

function closeNotif() {
    document.getElementById('notif-panel').classList.remove('open');
}

// ==================== MODALES ====================
function openMod(id) {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
    document.getElementById(id).classList.add('open');
}

function closeMods() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
    deleteCallback = null;
}

function toast(msg, color) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.style.background = color;
    t.style.display = 'block';
    setTimeout(() => t.style.display = 'none', 3000);
}

// ==================== INICIALIZACIÓN ====================
document.addEventListener('DOMContentLoaded', () => {
    const savedNotifs = localStorage.getItem('notifications');
    if (savedNotifs) notificationsDB = JSON.parse(savedNotifs);
    
    
    const filtersBar = document.querySelector('.filters-bar');
    if (filtersBar && !document.getElementById('searchCurso')) {
        const searchHtml = `
            <div class="search-box">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
                <input type="text" id="searchCurso" placeholder="Buscar curso por nombre o código...">
            </div>
        `;
        filtersBar.insertAdjacentHTML('afterbegin', searchHtml);
        document.getElementById('searchCurso')?.addEventListener('input', () => aplicarFiltrosOferta());
    }
    
    
    document.getElementById('sidebarToggle')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.toggle('open');
    });
    document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.toggle('open');
    });
    document.getElementById('sidebarClose')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.remove('open');
    });
    
    
    document.querySelectorAll('.modal-overlay').forEach(o => {
        o.addEventListener('click', function(e) { 
            if (e.target === this) closeMods(); 
        });
    });
    
    
    document.addEventListener('click', e => { 
        const panel = document.getElementById('notif-panel'); 
        if (panel?.classList.contains('open') && !panel.contains(e.target) && !e.target.closest('#notif-trigger')) {
            closeNotif(); 
        }
    });
    
    
    fetch('http://localhost:3000/api/health')
        .then(res => res.json())
        .then(data => {
            console.log('✅ Servidor conectado:', data);
        })
        .catch(err => {
            console.error('❌ Error conectando al servidor:', err);
            toast('⚠️ No se pudo conectar al servidor API. Asegúrese de que el backend esté ejecutándose en http://localhost:3000', '#ef4444');
        });
});