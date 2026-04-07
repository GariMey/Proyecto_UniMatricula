// ==================== VARIABLES GLOBALES ====================
let currentUser = null;
let currentEstudiante = null;
let currentPeriodoId = 1;
let ultimoComprobanteData = null;
let chartMatriculas = null;
let chartPagos = null;

// API Base URL
const API_URL = 'http://localhost:3000/api';

// Token de autenticación
let authToken = null;

// ==================== FUNCIONES DE API ====================
async function apiRequest(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error en la petición');
    }
    
    return response.json();
}

// ==================== LOGIN ====================
async function doLoginWithSSO() {
    toast('🔐 Autenticando...', '#3b82f6');
    
    const email = document.getElementById('login-email').value;
    const role = document.getElementById('login-role').value;
    
    if (!email) {
        toast('❌ Ingresa tu correo institucional', '#ef4444');
        return;
    }
    
    try {
        const data = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ 
                email: email, 
                password: 'sso_auth', 
                role: role === 'student' ? 'student' : 'admin' 
            })
        });
        
        if (data.success) {
            authToken = data.token;
            currentUser = data.usuario;
            
            // Si es estudiante, obtener información adicional
            if (currentUser.id_rol === 1) {
                const estudianteData = await apiRequest('/auth/estudiante');
                if (estudianteData.success && estudianteData.estudiante) {
                    currentEstudiante = estudianteData.estudiante;
                }
            }
            
            completeLogin();
        } else {
            toast('❌ Error de autenticación', '#ef4444');
        }
    } catch (error) {
        console.error('Login error:', error);
        toast('❌ Error al conectar con el servidor', '#ef4444');
    }
}

function doManualLogin() {
    doLoginWithSSO();
}

function completeLogin() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    
    updateUserInfo();
    renderSidebarMenu();
    loadDashboardData();
    loadOfertaData();
    loadPeriodosOferta();
    
    addNotification(currentUser.id_usuario, 'Bienvenido', `Has iniciado sesión como ${currentUser.id_rol === 1 ? 'Estudiante' : 'Administrador'}`, 'success');
    showPage('dashboard');
    toast(`✅ Bienvenido, ${currentUser.nombre}`, '#10b981');
}

function updateUserInfo() {
    const initials = currentUser.nombre.split(' ').map(n => n[0]).join('').toUpperCase();
    document.getElementById('user-avatar').textContent = initials;
    document.getElementById('user-name').textContent = currentUser.nombre;
    const roleText = currentUser.id_rol === 2 ? 'Administrador' : 'Estudiante';
    document.getElementById('user-role-text').textContent = roleText;
    const badge = document.getElementById('user-role-badge');
    badge.textContent = roleText;
    badge.className = `role-badge ${currentUser.id_rol === 2 ? 'admin' : 'student'}`;
}

function renderSidebarMenu() {
    const navMenu = document.getElementById('nav-menu');
    const menuItems = currentUser.id_rol === 2 ? [
        { id: 'dashboard', name: 'Dashboard', icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z' },
        { id: 'oferta', name: 'Oferta Académica', icon: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z' },
        { id: 'matricula', name: 'Gestión Matrículas', icon: 'M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z' },
        { id: 'pagos', name: 'Gestión Pagos', icon: 'M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z' },
        { id: 'reportes', name: 'Reportes', icon: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z' }
    ] : [
        { id: 'dashboard', name: 'Mi Dashboard', icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z' },
        { id: 'oferta', name: 'Oferta Académica', icon: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z' },
        { id: 'mis-matriculas', name: 'Mis Matrículas', icon: 'M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z' },
        { id: 'mis-pagos', name: 'Mis Pagos', icon: 'M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z' }
    ];
    
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
    
    const targetPage = document.getElementById(`page-${pageId}`);
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
        reportes: 'Reportes del Sistema'
    };
    document.getElementById('page-title').textContent = titles[pageId] || 'UniMatricula';
    
    // Cargar datos según la página
    if (pageId === 'dashboard') loadDashboardData();
    if (pageId === 'oferta') loadOfertaData();
    if (pageId === 'mis-matriculas' && currentUser.id_rol === 1) loadMisMatriculas();
    if (pageId === 'mis-pagos' && currentUser.id_rol === 1) loadMisFacturas();
    
    closeNotif();
}

// ==================== DASHBOARD ====================
async function loadDashboardData() {
    document.getElementById('welcome-title').textContent = `Bienvenido, ${currentUser.nombre}`;
    const statsContainer = document.getElementById('dashboard-stats');
    const debtContainer = document.getElementById('debt-warning-container');
    
    if (currentUser.id_rol === 1 && currentEstudiante) {
        try {
            // Obtener matrículas del estudiante
            const secciones = await apiRequest('/oferta/secciones?periodo_id=1');
            
            // Filtrar secciones donde el estudiante está matriculado (esto debería venir de una API específica)
            // Por ahora, mostramos datos básicos
            statsContainer.innerHTML = `
                <div class="stat-card"><div class="val">${currentEstudiante.carnet || 'N/A'}</div><div class="lbl">Carnet</div></div>
                <div class="stat-card"><div class="val">${currentEstudiante.estado_academico || 'Activo'}</div><div class="lbl">Estado</div></div>
                <div class="stat-card"><div class="val">₡${(currentEstudiante.montoDeuda || 0).toLocaleString()}</div><div class="lbl">Saldo Pendiente</div></div>
            `;
            
            if (currentEstudiante.montoDeuda > 0) {
                debtContainer.innerHTML = `<div class="debt-warning"><svg width="20" height="20" viewBox="0 0 24 24" fill="#fca5a5"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg><span>⚠️ Tienes una deuda pendiente de ₡${currentEstudiante.montoDeuda.toLocaleString()}. No podrás realizar nuevas matrículas hasta regularizarla.</span></div>`;
            } else {
                debtContainer.innerHTML = '';
            }
            
            const tbody = document.getElementById('my-courses-tbody');
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">Cargando cursos...</td></tr>';
            
        } catch (error) {
            console.error('Error loading dashboard:', error);
            statsContainer.innerHTML = '<div class="stat-card"><div class="val">Error</div><div class="lbl">Cargando datos</div></div>';
        }
    } else {
        // Admin dashboard - obtener reportes
        try {
            const matriculasReport = await apiRequest('/reportes/matriculas');
            const financieroReport = await apiRequest('/reportes/financieros');
            
            statsContainer.innerHTML = `
                <div class="stat-card"><div class="val">${matriculasReport.reduce((sum, p) => sum + p.total_estudiantes, 0) || 0}</div><div class="lbl">Estudiantes Activos</div></div>
                <div class="stat-card"><div class="val">${matriculasReport.reduce((sum, p) => sum + p.total_matriculas, 0) || 0}</div><div class="lbl">Matrículas</div></div>
                <div class="stat-card"><div class="val">₡${((financieroReport.total_pagado || 0) / 1000000).toFixed(1)}M</div><div class="lbl">Ingresos</div></div>
            `;
            debtContainer.innerHTML = '';
            
            const tbody = document.getElementById('my-courses-tbody');
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">Reporte de matrículas disponible en la sección de Reportes</td></tr>';
        } catch (error) {
            console.error('Error loading admin dashboard:', error);
        }
    }
}

// ==================== OFERTA ACADÉMICA ====================
async function loadPeriodosOferta() {
    // Por ahora, usamos periodo fijo
    const container = document.getElementById('period-tabs-oferta');
    if (!container) return;
    container.innerHTML = `<button class="tab-btn active" data-periodo="1" onclick="switchPeriodoOferta(this, 1)">2025-1</button>`;
}

function switchPeriodoOferta(btn, periodoId) {
    document.querySelectorAll('#period-tabs-oferta .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentPeriodoId = periodoId;
    loadOfertaData();
}

async function loadOfertaData() {
    const tbody = document.getElementById('oferta-tbody');
    const btnNuevoCurso = document.getElementById('btn-nuevo-curso');
    if (btnNuevoCurso) btnNuevoCurso.style.display = currentUser.id_rol === 2 ? 'inline-flex' : 'none';
    
    try {
        const secciones = await apiRequest(`/oferta/secciones?periodo_id=${currentPeriodoId}`);
        
        if (secciones.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">No hay secciones disponibles para este período</td></tr>';
            return;
        }
        
        tbody.innerHTML = secciones.map(sec => {
            const disponibles = sec.disponibles || 0;
            const puedeMatricular = disponibles > 0 && currentUser.id_rol === 1 && (!currentEstudiante || currentEstudiante.montoDeuda === 0);
            
            return `
                <tr data-id="${sec.id_seccion}">
                    <td><strong>${sec.codigo}</strong><br><span style="font-size:11px;color:#6b7280">${sec.curso_nombre}</span></td>
                    <td>${sec.programa_nombre || 'N/A'}</td>
                    <td>${sec.cupo}</td>
                    <td><span class="badge ${disponibles > 0 ? 'badge-green' : 'badge-red'}">${disponibles}</span></td>
                    <td>${sec.horario}<br><span style="font-size:11px">${sec.aula} | ${sec.docente}</span></td>
                    <td>${currentUser.id_rol === 2 ? `
                        <div class="action-btns">
                            <button class="btn-icon" onclick="editSeccion(${sec.id_seccion})">✏️</button>
                            <button class="btn-icon danger" onclick="confirmDeleteSeccion(${sec.id_seccion}, '${sec.codigo} - ${sec.horario}')">🗑️</button>
                        </div>
                    ` : (puedeMatricular ? `<button class="btn-matricular" onclick="abrirNuevaMatriculaConSeccion(${sec.id_seccion})">Matricular</button>` : '<span class="badge badge-red">Sin cupo</span>')}</td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading oferta:', error);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:red">Error cargando oferta académica</td></tr>';
    }
}

// ==================== MATRÍCULAS ====================
async function abrirNuevaMatricula(preselectedIds = []) {
    if (currentEstudiante?.montoDeuda > 0) { 
        toast('❌ No puedes matricularte por deuda', '#ef4444'); 
        return; 
    }
    
    try {
        const secciones = await apiRequest(`/oferta/secciones?periodo_id=1`);
        const seccionesDisponibles = secciones.filter(s => s.disponibles > 0);
        
        const container = document.getElementById('seccion-list-modal');
        container.innerHTML = seccionesDisponibles.map(sec => {
            return `<label class="course-check-item"><input type="checkbox" value="${sec.id_seccion}" ${preselectedIds.includes(sec.id_seccion) ? 'checked' : ''}><div><div class="ci-name">${sec.codigo} - ${sec.curso_nombre}</div><div class="ci-code">Créditos: ${sec.creditos} | Cupos: ${sec.disponibles} | ${sec.horario}</div></div></label>`;
        }).join('');
        
        document.getElementById('matricula-student-field').style.display = 'none';
        document.getElementById('m-title').textContent = 'Nueva Matrícula';
        openMod('modal-matricula');
    } catch (error) {
        toast('Error cargando secciones', '#ef4444');
    }
}

function abrirNuevaMatriculaConSeccion(idSeccion) {
    abrirNuevaMatricula([idSeccion]);
}

async function confirmarMatricula() {
    const checkboxes = document.querySelectorAll('#seccion-list-modal input[type=checkbox]:checked');
    const selectedSeccionesIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    if (selectedSeccionesIds.length === 0) { 
        toast('Selecciona al menos una sección', '#ef4444'); 
        return; 
    }
    
    try {
        for (const idSeccion of selectedSeccionesIds) {
            await apiRequest('/matriculas', {
                method: 'POST',
                body: JSON.stringify({ 
                    id_seccion: idSeccion,
                    id_estudiante: currentEstudiante.id_estudiante
                })
            });
        }
        
        toast(`✅ Matrícula registrada exitosamente`, '#10b981');
        closeMods();
        loadMisMatriculas();
        loadDashboardData();
        loadOfertaData();
    } catch (error) {
        console.error('Error registrando matrícula:', error);
        toast(`❌ Error: ${error.message}`, '#ef4444');
    }
}

async function loadMisMatriculas() {
    const tbody = document.getElementById('mis-matriculas-tbody');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center">Cargando...</td></tr>';
    
    try {
        // Obtener secciones del periodo actual
        const secciones = await apiRequest(`/oferta/secciones?periodo_id=1`);
        // Por ahora, mostramos todas las secciones (luego filtrar por estudiante)
        
        if (secciones.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center">No hay matrículas registradas</td></tr>';
        } else {
            tbody.innerHTML = secciones.map(sec => {
                const monto = (sec.creditos || 0) * 60000;
                return `
                    <tr>
                        <td>SEC-${sec.id_seccion}</td>
                        <td>2025-1</td>
                        <td>${sec.codigo} - ${sec.curso_nombre}</td>
                        <td>${sec.creditos || 0}</td>
                        <td>₡${monto.toLocaleString()}</td>
                        <td><span class="badge badge-amber">Pendiente</span></td>
                        <td><button class="btn-pagar" onclick="alert('Funcionalidad en desarrollo')">Pagar</button></td>
                    </tr>
                `;
            }).join('');
        }
    } catch (error) {
        console.error('Error loading matriculas:', error);
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:red">Error cargando matrículas</td></tr>';
    }
}

// ==================== FACTURAS Y PAGOS ====================
async function loadMisFacturas() {
    if (!currentEstudiante) return;
    
    const tbody = document.getElementById('mis-facturas-tbody');
    const statsContainer = document.getElementById('pagos-stats-student');
    
    try {
        const facturas = await apiRequest(`/pagos/mis-facturas?id_estudiante=${currentEstudiante.id_estudiante}`);
        
        const pendingTotal = facturas.filter(f => f.estado === 'Pendiente').reduce((sum, f) => sum + f.monto, 0);
        const paidTotal = facturas.filter(f => f.estado === 'Pagada').reduce((sum, f) => sum + f.monto, 0);
        
        if (statsContainer) {
            statsContainer.innerHTML = `<div class="pago-stat"><div><div class="amount">₡${paidTotal.toLocaleString()}</div><div class="plbl">Pagado</div></div><div class="stat-icon green">✓</div></div><div class="pago-stat"><div><div class="amount">₡${pendingTotal.toLocaleString()}</div><div class="plbl">Pendiente</div></div><div class="stat-icon amber">⏱</div></div>`;
        }
        
        if (facturas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">No hay facturas registradas</td></tr>';
        } else {
            tbody.innerHTML = facturas.map(f => `
                <tr>
                    <td><span class="badge badge-blue">INV-${f.id_factura}</span></td>
                    <td>Matrícula</td>
                    <td>₡${f.monto.toLocaleString()}</td>
                    <td>${new Date(f.fecha_emision).toLocaleDateString()}</td>
                    <td><span class="badge ${f.estado === 'Pagada' ? 'badge-green' : 'badge-amber'}">${f.estado}</span></td>
                    <td>${f.estado === 'Pendiente' ? `<button class="btn-pagar" onclick="abrirPagoFactura(${f.id_factura})">Pagar</button>` : '-'}</td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading facturas:', error);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:red">Error cargando facturas</td></tr>';
    }
}

function abrirPagoFactura(idFactura) {
    toast('Funcionalidad de pago en desarrollo', '#fb923c');
}

function procesarPago() {
    toast('Funcionalidad de pago en desarrollo', '#fb923c');
    closeMods();
}

// ==================== REPORTES ====================
async function exportReport(tipo = 'matriculas') {
    toast('Funcionalidad de reportes en desarrollo', '#fb923c');
}

// ==================== UTILIDADES ====================
function toast(msg, color = '#10b981') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.style.background = color;
    t.style.display = 'block';
    setTimeout(() => t.style.display = 'none', 3000);
}

let notificationsDB = [];

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
            <div class="notif-body">
                <h4>${n.title}</h4>
                <p>${n.message}</p>
                <span class="notif-time">${n.time}</span>
            </div>
        </div>
    `).join('');
}

function markNotificationRead(id) {
    const notif = notificationsDB.find(n => n.id === id);
    if (notif) notif.read = true;
    updateNotificationBadge();
}

function openMod(id) {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
    document.getElementById(id).classList.add('open');
}

function closeMods() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
}

function toggleNotif() { 
    document.getElementById('notif-panel')?.classList.toggle('open'); 
}

function closeNotif() { 
    document.getElementById('notif-panel')?.classList.remove('open'); 
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

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('sidebarToggle')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.toggle('open');
    });
    document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.toggle('open');
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
    
    // Verificar salud del servidor
    fetch('http://localhost:3000/api/health')
        .then(res => res.json())
        .then(data => {
            console.log('✅ Servidor conectado:', data);
        })
        .catch(err => {
            console.error('❌ Error conectando al servidor:', err);
            toast('⚠️ No se pudo conectar al servidor API', '#ef4444');
        });
});