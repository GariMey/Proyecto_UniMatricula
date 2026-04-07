// ==================== CONEXIÓN A API ====================
const API_URL = 'http://localhost:3000/api';

async function llamarAPI(endpoint, method = 'GET', data = null) {
    const options = {
        method: method,
        headers: { 'Content-Type': 'application/json' }
    };
    if (data) options.body = JSON.stringify(data);
    
    const response = await fetch(`${API_URL}${endpoint}`, options);
    return await response.json();
}

// Modificar login para usar API real
const originalDoLoginWithSSO = window.doLoginWithSSO;
window.doLoginWithSSO = async function() {
    toast('🔐 Autenticando...', '#3b82f6');
    
    const email = document.getElementById('login-email').value || 'juan.perez@universidad.edu';
    const role = document.getElementById('login-role').value;
    
    try {
        const result = await llamarAPI('/login', 'POST', { email, role });
        
        if (result.success) {
            currentUser = result.usuario;
            
            if (currentUser.id_rol === 1) {
                // Buscar estudiante asociado
                const estudianteResult = await llamarAPI(`/estudiante/${currentUser.id_usuario}`);
                currentEstudiante = estudianteResult;
            }
            
            completeLogin();
        } else {
            toast(result.error, '#ef4444');
        }
    } catch (error) {
        toast('Error conectando al servidor', '#ef4444');
    }
};

// Modificar loadOfertaData para usar API
const originalLoadOfertaData = window.loadOfertaData;
window.loadOfertaData = async function(periodoId = 1) {
    try {
        const secciones = await llamarAPI(`/oferta?periodo_id=${periodoId}`);
        
        const tbody = document.getElementById('oferta-tbody');
        tbody.innerHTML = secciones.map(sec => `
            <tr>
                <td><strong>${sec.codigo}</strong><br><small>${sec.curso_nombre}</small></td>
                <td>${sec.programa}</td>
                <td>${sec.cupo}</td>
                <td><span class="badge ${sec.disponibles > 0 ? 'badge-green' : 'badge-red'}">${sec.disponibles}</span></td>
                <td>${sec.horario}<br><small>${sec.aula} | ${sec.docente}</small></td>
                <td>${currentUser?.id_rol === 2 ? `
                    <div class="action-btns">
                        <button class="btn-icon" onclick="editSeccion(${sec.id_seccion})">✏️</button>
                        <button class="btn-icon danger" onclick="confirmDeleteSeccion(${sec.id_seccion})">🗑️</button>
                    </div>
                ` : (sec.disponibles > 0 ? `<button class="btn-matricular" onclick="matricularSeccionAPI(${sec.id_seccion})">Matricular</button>` : '<span class="badge badge-red">Sin cupo</span>')}</td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Error cargando oferta:', error);
        toast('Error cargando datos', '#ef4444');
    }
};

// Nueva función para matricular usando API
async function matricularSeccionAPI(idSeccion) {
    if (currentEstudiante?.tieneDeuda) {
        toast('No puedes matricularte por deuda pendiente', '#ef4444');
        return;
    }
    
    try {
        const result = await llamarAPI('/matricular', 'POST', {
            id_estudiante: currentEstudiante.id_estudiante,
            secciones_ids: [idSeccion]
        });
        
        if (result.success) {
            toast('✅ Matrícula registrada exitosamente', '#10b981');
            loadOfertaData();
            loadMisMatriculas();
        }
    } catch (error) {
        toast(error.message, '#ef4444');
    }
}


// ========================== MODELO DE DATOS (basado en el esquema SQL) ==========================
// Tablas en memoria
let rolesDB = [
  { id_rol: 1, nombre: 'Estudiante' },
  { id_rol: 2, nombre: 'AdminTI' }
];

let usuariosDB = [
  { id_usuario: 1, nombre: 'Juan Pérez', correo_institucional: 'juan.perez@universidad.edu', id_rol: 1, estado: 'Activo' },
  { id_usuario: 2, nombre: 'Admin Sistema', correo_institucional: 'admin@universidad.edu', id_rol: 2, estado: 'Activo' }
];

let estudiantesDB = [
  { id_estudiante: 1, id_usuario: 1, carnet: '20240001', estado_academico: 'Activo', tieneDeuda: true, montoDeuda: 480000 }
];

let programasDB = [
  { id_programa: 1, nombre: 'Ingeniería en Sistemas', nivel: 'Pregrado', duracion: 10 },
  { id_programa: 2, nombre: 'Administración de Empresas', nivel: 'Pregrado', duracion: 8 }
];

let cursosDB = [
  { id_curso: 1, codigo: 'MAT101', nombre: 'Cálculo I', creditos: 4, id_programa: 1 },
  { id_curso: 2, codigo: 'MAT102', nombre: 'Cálculo II', creditos: 4, id_programa: 1 },
  { id_curso: 3, codigo: 'PRG101', nombre: 'Programación I', creditos: 4, id_programa: 1 },
  { id_curso: 4, codigo: 'PRG102', nombre: 'Programación II', creditos: 4, id_programa: 1 },
  { id_curso: 5, codigo: 'FIS101', nombre: 'Física I', creditos: 3, id_programa: 1 },
  { id_curso: 6, codigo: 'ADM101', nombre: 'Administración General', creditos: 3, id_programa: 2 },
  { id_curso: 7, codigo: 'CON101', nombre: 'Contabilidad I', creditos: 3, id_programa: 2 }
];

let prerrequisitosDB = [
  { id_curso: 4, id_curso_requisito: 3 }  // Programación II requiere Programación I
];

let periodosDB = [
  { id_periodo: 1, nombre: '2025-1', fecha_inicio: '2025-01-15', fecha_fin: '2025-05-30', estado: 'Activo' },
  { id_periodo: 2, nombre: '2024-2', fecha_inicio: '2024-08-01', fecha_fin: '2024-12-15', estado: 'Cerrado' }
];

let seccionesDB = [
  { id_seccion: 1, id_curso: 1, id_periodo: 1, docente: 'Ana Martínez', aula: 'A-101', horario: 'Lun-Mie 08:00-10:00', cupo: 60, inscritos: 53 },
  { id_seccion: 2, id_curso: 2, id_periodo: 1, docente: 'Carlos Rodríguez', aula: 'A-102', horario: 'Mar-Jue 10:00-12:00', cupo: 40, inscritos: 25 },
  { id_seccion: 3, id_curso: 3, id_periodo: 1, docente: 'Pedro Sánchez', aula: 'LAB-01', horario: 'Lun-Mie 14:00-16:00', cupo: 30, inscritos: 28 },
  { id_seccion: 4, id_curso: 4, id_periodo: 1, docente: 'Pedro Sánchez', aula: 'LAB-01', horario: 'Mar-Jue 16:00-18:00', cupo: 25, inscritos: 20 },
  { id_seccion: 5, id_curso: 5, id_periodo: 1, docente: 'Laura Vega', aula: 'F-101', horario: 'Vie 08:00-12:00', cupo: 45, inscritos: 40 },
  { id_seccion: 6, id_curso: 6, id_periodo: 1, docente: 'Mario Castro', aula: 'B-201', horario: 'Lun-Mie 10:00-12:00', cupo: 35, inscritos: 30 },
  { id_seccion: 7, id_curso: 7, id_periodo: 1, docente: 'Elena Mora', aula: 'B-202', horario: 'Mar-Jue 08:00-10:00', cupo: 30, inscritos: 28 }
];
seccionesDB.forEach(s => { s.disponibles = s.cupo - s.inscritos; });

let matriculasDB = [
  { id_matricula: 1, id_estudiante: 1, id_seccion: 1, fecha: '2025-01-15', estado: 'Confirmada' },
  { id_matricula: 2, id_estudiante: 1, id_seccion: 3, fecha: '2025-01-15', estado: 'Confirmada' }
];

let facturasDB = [
  { id_factura: 1, id_estudiante: 1, monto: 480000, fecha_emision: '2025-01-15', estado: 'Pendiente' }
];

let pagosDB = [];

let auditoriaDB = [];

let nextIdSeccion = 8;
let nextIdMatricula = 3;
let nextIdFactura = 2;

// Usuario actual
let currentUser = null;
let currentEstudiante = null;

// Notificaciones en memoria
let notificationsDB = [];

// ========================== UTILIDADES ==========================
function toast(msg, color = '#10b981') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = color;
  t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 3000);
}

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
  return notif;
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

function registrarAuditoria(id_usuario, accion) {
  auditoriaDB.push({ id_auditoria: auditoriaDB.length+1, id_usuario, accion, fecha: new Date() });
  console.log('Auditoría:', accion);
}

// ========================== VALIDACIONES (RF-12) ==========================
function verificarPrerrequisitos(id_estudiante, id_curso) {
  // Obtener cursos requisito
  const requisitos = prerrequisitosDB.filter(r => r.id_curso === id_curso).map(r => r.id_curso_requisito);
  if (requisitos.length === 0) return true;
  // Obtener matrículas confirmadas del estudiante en cualquier periodo
  const matriculasAprobadas = matriculasDB.filter(m => m.id_estudiante === id_estudiante && m.estado === 'Confirmada');
  const cursosAprobados = matriculasAprobadas.map(m => {
    const sec = seccionesDB.find(s => s.id_seccion === m.id_seccion);
    return sec ? sec.id_curso : null;
  }).filter(c => c !== null);
  const cumple = requisitos.every(req => cursosAprobados.includes(req));
  if (!cumple) {
    const nombresRequisitos = requisitos.map(r => cursosDB.find(c => c.id_curso === r)?.codigo).join(', ');
    toast(`❌ No cumple prerrequisitos: requiere ${nombresRequisitos}`, '#ef4444');
  }
  return cumple;
}

function validarMatricula(estudianteId, seccionesSeleccionadas) {
  const errors = [];
  let totalCreditos = 0;

  // Obtener datos del estudiante
  const estudiante = estudiantesDB.find(e => e.id_estudiante === estudianteId);
  if (estudiante?.tieneDeuda) {
    errors.push('No puedes matricularte porque tienes una deuda pendiente (RF-18).');
  }

  for (const sec of seccionesSeleccionadas) {
    // Cupo
    if (sec.disponibles <= 0) {
      const curso = cursosDB.find(c => c.id_curso === sec.id_curso);
      errors.push(`No hay cupos disponibles para ${curso?.codigo || 'curso'}`);
    }
    // Prerrequisitos
    if (!verificarPrerrequisitos(estudianteId, sec.id_curso)) {
      const curso = cursosDB.find(c => c.id_curso === sec.id_curso);
      errors.push(`Prerrequisito no cumplido para ${curso?.codigo}`);
    }
    totalCreditos += cursosDB.find(c => c.id_curso === sec.id_curso)?.creditos || 0;
  }

  // Límite de créditos (máx 18)
  if (totalCreditos > 18) {
    errors.push(`xcede el límite de créditos (máximo 18, seleccionaste ${totalCreditos})`);
  }

  // Conflictos de horario
  for (let i = 0; i < seccionesSeleccionadas.length; i++) {
    for (let j = i+1; j < seccionesSeleccionadas.length; j++) {
      if (hayConflictoHorario(seccionesSeleccionadas[i].horario, seccionesSeleccionadas[j].horario)) {
        errors.push(`Conflicto de horario entre secciones`);
      }
    }
  }

  return { valido: errors.length === 0, errors, totalCreditos };
}

function hayConflictoHorario(horario1, horario2) {
  const dias1 = horario1.match(/Lun|Mar|Mie|Jue|Vie|Sab/g) || [];
  const dias2 = horario2.match(/Lun|Mar|Mie|Jue|Vie|Sab/g) || [];
  return dias1.some(d => dias2.includes(d));
}

// ========================== LOGIN ==========================
function doLoginWithSSO() {
  toast('🔐 Redirigiendo al SSO institucional...', '#3b82f6');
  setTimeout(() => {
    const role = document.getElementById('login-role').value;
    if (role === 'admin') {
      currentUser = usuariosDB.find(u => u.id_rol === 2);
    } else {
      currentUser = usuariosDB.find(u => u.id_rol === 1);
    }
    completeLogin();
  }, 1000);
}

function doManualLogin() {
  const role = document.getElementById('login-role').value;
  if (role === 'admin') {
    currentUser = usuariosDB.find(u => u.id_rol === 2);
  } else {
    currentUser = usuariosDB.find(u => u.id_rol === 1);
  }
  completeLogin();
}

function completeLogin() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  if (currentUser.id_rol === 1) {
    currentEstudiante = estudiantesDB.find(e => e.id_usuario === currentUser.id_usuario);
  }
  updateUserInfo();
  renderSidebarMenu();
  loadDashboardData();
  loadOfertaData();
  loadPeriodosOferta();
  addNotification(currentUser.id_usuario, 'Bienvenido', `Has iniciado sesión como ${currentUser.id_rol === 1 ? 'Estudiante' : 'Administrador'}`, 'success');
  registrarAuditoria(currentUser.id_usuario, 'Login exitoso');
  showPage('dashboard');
  toast(`Bienvenido, ${currentUser.nombre}`, '#10b981');
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
    { id: 'pagos', name: 'Gestión Pagos', icon: 'M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z' }
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
  const titles = { dashboard: 'Dashboard', oferta: 'Oferta Académica', 'mis-matriculas': 'Mis Matrículas', 'mis-pagos': 'Mis Pagos', matricula: 'Gestión de Matrículas', pagos: 'Gestión de Pagos' };
  document.getElementById('page-title').textContent = titles[pageId] || 'UniMatricula';
  if (pageId === 'dashboard') loadDashboardData();
  if (pageId === 'oferta') loadOfertaData();
  if (pageId === 'mis-matriculas' && currentUser.id_rol === 1) loadMisMatriculas();
  if (pageId === 'mis-pagos' && currentUser.id_rol === 1) loadMisFacturas();
  if (pageId === 'matricula' && currentUser.id_rol === 2) loadAdminMatriculas();
  if (pageId === 'pagos' && currentUser.id_rol === 2) loadAdminFacturas();
  closeNotif();
}

// ========================== DASHBOARD ==========================
function loadDashboardData() {
  document.getElementById('welcome-title').textContent = `Bienvenido, ${currentUser.nombre}`;
  const statsContainer = document.getElementById('dashboard-stats');
  const debtContainer = document.getElementById('debt-warning-container');
  if (currentUser.id_rol === 1) {
    const misMatriculas = matriculasDB.filter(m => m.id_estudiante === currentEstudiante.id_estudiante && m.estado === 'Confirmada');
    const seccionesIds = misMatriculas.map(m => m.id_seccion);
    const creditos = seccionesIds.reduce((sum, id) => {
      const sec = seccionesDB.find(s => s.id_seccion === id);
      const curso = cursosDB.find(c => c.id_curso === sec.id_curso);
      return sum + (curso?.creditos || 0);
    }, 0);
    const deuda = currentEstudiante.tieneDeuda ? currentEstudiante.montoDeuda : 0;
    statsContainer.innerHTML = `
      <div class="stat-card"><div class="val">${misMatriculas.length}</div><div class="lbl">Cursos Inscritos</div></div>
      <div class="stat-card"><div class="val">${creditos}</div><div class="lbl">Créditos Cursando</div></div>
      <div class="stat-card"><div class="val">₡${deuda.toLocaleString()}</div><div class="lbl">Saldo Pendiente</div></div>
    `;
    if (currentEstudiante.tieneDeuda) {
      debtContainer.innerHTML = `<div class="debt-warning"><svg width="20" height="20" viewBox="0 0 24 24" fill="#fca5a5"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg><span>⚠️ Tienes una deuda pendiente de ₡${currentEstudiante.montoDeuda.toLocaleString()}. No podrás realizar nuevas matrículas hasta regularizarla.</span></div>`;
    } else debtContainer.innerHTML = '';
    const tbody = document.getElementById('my-courses-tbody');
    if (misMatriculas.length === 0) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">No estás matriculado en ningún curso</td></tr>';
    else {
      tbody.innerHTML = misMatriculas.map(mat => {
        const sec = seccionesDB.find(s => s.id_seccion === mat.id_seccion);
        const curso = cursosDB.find(c => c.id_curso === sec.id_curso);
        return `<tr><td><span class="badge badge-blue">${curso.codigo}</span></td><td>${curso.nombre}</td><td>${sec.horario}</td><td>${sec.aula}</td><td>${sec.docente}</td><td><span class="badge badge-green">activo</span></td></tr>`;
      }).join('');
    }
  } else {
    // Admin dashboard
    const totalEstudiantes = estudiantesDB.length;
    const totalMatriculas = matriculasDB.length;
    const totalIngresos = facturasDB.filter(f => f.estado === 'Pagada').reduce((sum, f) => sum + f.monto, 0);
    statsContainer.innerHTML = `
      <div class="stat-card"><div class="val">${totalEstudiantes}</div><div class="lbl">Estudiantes Activos</div></div>
      <div class="stat-card"><div class="val">${totalMatriculas}</div><div class="lbl">Matrículas</div></div>
      <div class="stat-card"><div class="val">₡${(totalIngresos/1000000).toFixed(1)}M</div><div class="lbl">Ingresos</div></div>
    `;
    debtContainer.innerHTML = '';
    const tbody = document.getElementById('my-courses-tbody');
    const ultimasMatriculas = [...matriculasDB].slice(-3);
    tbody.innerHTML = ultimasMatriculas.map(m => {
      const est = estudiantesDB.find(e => e.id_estudiante === m.id_estudiante);
      const user = usuariosDB.find(u => u.id_usuario === est.id_usuario);
      const sec = seccionesDB.find(s => s.id_seccion === m.id_seccion);
      const curso = cursosDB.find(c => c.id_curso === sec.id_curso);
      return `<tr><td>MAT-${m.id_matricula}</td><td>${user?.nombre || 'N/A'}</td><td>${curso?.codigo}</td><td>${sec?.horario}</td><td>${m.estado}</td><td><span class="badge badge-green">${m.estado}</span></td></tr>`;
    }).join('');
  }
}

// ========================== OFERTA ACADÉMICA (SECCIONES) ==========================
function loadPeriodosOferta() {
  const container = document.getElementById('period-tabs-oferta');
  if (!container) return;
  const periodosActivos = periodosDB.filter(p => p.estado === 'Activo');
  container.innerHTML = periodosActivos.map(p => `<button class="tab-btn ${p.id_periodo === 1 ? 'active' : ''}" data-periodo="${p.id_periodo}" onclick="switchPeriodoOferta(this, ${p.id_periodo})">${p.nombre}</button>`).join('');
  if (periodosActivos.length) loadOfertaData(periodosActivos[0].id_periodo);
}

function switchPeriodoOferta(btn, periodoId) {
  document.querySelectorAll('#period-tabs-oferta .tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadOfertaData(periodoId);
}

function loadOfertaData(periodoId = 1) {
  const tbody = document.getElementById('oferta-tbody');
  const btnNuevoCurso = document.getElementById('btn-nuevo-curso');
  if (btnNuevoCurso) btnNuevoCurso.style.display = currentUser.id_rol === 2 ? 'inline-flex' : 'none';
  const seccionesFiltradas = seccionesDB.filter(s => s.id_periodo === periodoId);
  tbody.innerHTML = seccionesFiltradas.map(sec => {
    const curso = cursosDB.find(c => c.id_curso === sec.id_curso);
    const programa = programasDB.find(p => p.id_programa === curso.id_programa);
    const disponibles = sec.cupo - sec.inscritos;
    return `
      <tr data-id="${sec.id_seccion}">
        <td><strong>${curso.codigo}</strong><br><span style="font-size:11px;color:#6b7280">${curso.nombre}</span></td>
        <td>${programa.nombre}</td>
        <td>${sec.cupo}</td>
        <td><span class="badge ${disponibles > 0 ? 'badge-green' : 'badge-red'}">${disponibles}</span></td>
        <td>${sec.horario}<br><span style="font-size:11px">${sec.aula} | ${sec.docente}</span></td>
        <td>${currentUser.id_rol === 2 ? `
          <div class="action-btns">
            <button class="btn-icon" onclick="editSeccion(${sec.id_seccion})">✏️</button>
            <button class="btn-icon danger" onclick="confirmDeleteSeccion(${sec.id_seccion}, '${curso.codigo} - ${sec.horario}')">🗑️</button>
          </div>
        ` : (disponibles > 0 && !currentEstudiante?.tieneDeuda ? `<button class="btn-matricular" onclick="matricularSeccion(${sec.id_seccion})">Matricular</button>` : '<span class="badge badge-red">Sin cupo</span>')}</td>
      </tr>
    `;
  }).join('');
}

function matricularSeccion(idSeccion) {
  if (currentEstudiante?.tieneDeuda) {
    toast('No puedes matricularte porque tienes deuda pendiente', '#ef4444');
    return;
  }
  abrirNuevaMatriculaConSeccion(idSeccion);
}

function abrirNuevaMatriculaConSeccion(idSeccion) {
  abrirNuevaMatricula([idSeccion]);
}

function editSeccion(idSeccion) {
  const sec = seccionesDB.find(s => s.id_seccion === idSeccion);
  if (!sec) return;
  document.getElementById('c-title').textContent = 'Editar Sección';
  document.getElementById('c-id-curso').value = sec.id_curso;
  document.getElementById('c-id-periodo').value = sec.id_periodo;
  document.getElementById('c-docente').value = sec.docente;
  document.getElementById('c-aula').value = sec.aula;
  document.getElementById('c-horario').value = sec.horario;
  document.getElementById('c-cupo').value = sec.cupo;
  window.editSeccionId = idSeccion;
  openMod('modal-curso');
}

function saveCurso() {
  const idCurso = parseInt(document.getElementById('c-id-curso').value);
  const idPeriodo = parseInt(document.getElementById('c-id-periodo').value);
  const docente = document.getElementById('c-docente').value;
  const aula = document.getElementById('c-aula').value;
  const horario = document.getElementById('c-horario').value;
  const cupo = parseInt(document.getElementById('c-cupo').value);
  if (!idCurso || !idPeriodo) { toast('Seleccione curso y periodo', '#ef4444'); return; }
  if (window.editSeccionId) {
    const index = seccionesDB.findIndex(s => s.id_seccion === window.editSeccionId);
    if (index !== -1) {
      seccionesDB[index] = { ...seccionesDB[index], id_curso: idCurso, id_periodo: idPeriodo, docente, aula, horario, cupo, inscritos: seccionesDB[index].inscritos, disponibles: cupo - seccionesDB[index].inscritos };
      toast('Sección actualizada ✓', '#10b981');
      registrarAuditoria(currentUser.id_usuario, `Actualizó sección ${window.editSeccionId}`);
    }
    delete window.editSeccionId;
  } else {
    const newId = nextIdSeccion++;
    seccionesDB.push({ id_seccion: newId, id_curso: idCurso, id_periodo: idPeriodo, docente, aula, horario, cupo, inscritos: 0, disponibles: cupo });
    toast('Sección creada', '#10b981');
    registrarAuditoria(currentUser.id_usuario, `Creó sección ${newId}`);
  }
  closeMods();
  loadOfertaData(document.querySelector('#period-tabs-oferta .tab-btn.active')?.dataset?.periodo || 1);
}

function confirmDeleteSeccion(id, name) {
  window.deleteTarget = { type: 'seccion', id, name };
  document.getElementById('del-name').textContent = `"${name}"`;
  openMod('modal-delete');
}

// ========================== MATRÍCULAS (ESTUDIANTE) ==========================
function abrirNuevaMatricula(preselectedIds = []) {
  if (currentEstudiante?.tieneDeuda) { toast('❌ No puedes matricularte por deuda', '#ef4444'); return; }
  const periodoActivo = periodosDB.find(p => p.estado === 'Activo');
  if (!periodoActivo) { toast('No hay periodo activo para matricular', '#ef4444'); return; }
  const seccionesDisponibles = seccionesDB.filter(s => s.id_periodo === periodoActivo.id_periodo && (s.cupo - s.inscritos) > 0);
  const container = document.getElementById('seccion-list-modal');
  container.innerHTML = seccionesDisponibles.map(sec => {
    const curso = cursosDB.find(c => c.id_curso === sec.id_curso);
    const disponibles = sec.cupo - sec.inscritos;
    return `<label class="course-check-item"><input type="checkbox" value="${sec.id_seccion}" ${preselectedIds.includes(sec.id_seccion) ? 'checked' : ''}><div><div class="ci-name">${curso.codigo} - ${curso.nombre}</div><div class="ci-code">${curso.creditos} créditos | Cupos: ${disponibles} | ${sec.horario}</div></div></label>`;
  }).join('');
  document.getElementById('matricula-student-field').style.display = 'none';
  document.getElementById('m-title').textContent = 'Nueva Matrícula';
  openMod('modal-matricula');
}

function confirmarMatricula() {
  const checkboxes = document.querySelectorAll('#seccion-list-modal input[type=checkbox]:checked');
  const selectedSeccionesIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
  if (selectedSeccionesIds.length === 0) { toast('Selecciona al menos una sección', '#ef4444'); return; }
  const seccionesSeleccionadas = seccionesDB.filter(s => selectedSeccionesIds.includes(s.id_seccion));
  const validation = validarMatricula(currentEstudiante.id_estudiante, seccionesSeleccionadas);
  if (!validation.valido) { toast(validation.errors.join(' • '), '#ef4444'); return; }
  // Crear cada matrícula individual
  for (const sec of seccionesSeleccionadas) {
    const nuevaMatricula = {
      id_matricula: nextIdMatricula++,
      id_estudiante: currentEstudiante.id_estudiante,
      id_seccion: sec.id_seccion,
      fecha: new Date().toISOString().split('T')[0],
      estado: 'Pendiente'
    };
    matriculasDB.push(nuevaMatricula);
    sec.inscritos++;
    sec.disponibles = sec.cupo - sec.inscritos;
  }
  // Calcular monto total
  const totalCreditos = seccionesSeleccionadas.reduce((sum, sec) => sum + (cursosDB.find(c => c.id_curso === sec.id_curso)?.creditos || 0), 0);
  const monto = totalCreditos * 60000;
  const factura = {
    id_factura: nextIdFactura++,
    id_estudiante: currentEstudiante.id_estudiante,
    monto: monto,
    fecha_emision: new Date().toISOString().split('T')[0],
    estado: 'Pendiente'
  };
  facturasDB.push(factura);
  registrarAuditoria(currentUser.id_usuario, `Registró matrícula con ${selectedSeccionesIds.length} secciones, factura ${factura.id_factura}`);
  addNotification(currentUser.id_usuario, 'Matrícula registrada', `Tu matrícula ha sido registrada. Debes pagar ₡${monto.toLocaleString()} para confirmarla.`, 'warning');
  closeMods();
  toast(`✅ Matrícula registrada. Total a pagar: ₡${monto.toLocaleString()}`, '#10b981');
  loadMisMatriculas();
  loadDashboardData();
  loadOfertaData();
}

function loadMisMatriculas() {
  const tbody = document.getElementById('mis-matriculas-tbody');
  const misMatriculas = matriculasDB.filter(m => m.id_estudiante === currentEstudiante.id_estudiante);
  tbody.innerHTML = misMatriculas.map(mat => {
    const sec = seccionesDB.find(s => s.id_seccion === mat.id_seccion);
    const curso = cursosDB.find(c => c.id_curso === sec.id_curso);
    const periodo = periodosDB.find(p => p.id_periodo === sec.id_periodo);
    const monto = curso.creditos * 60000;
    const estadoBadge = mat.estado === 'Confirmada' ? 'badge-green' : (mat.estado === 'Pendiente' ? 'badge-amber' : 'badge-blue');
    return `<tr><td>MAT-${mat.id_matricula}</td><td>${periodo.nombre}</td><td>${curso.codigo} - ${curso.nombre}</td><td>${curso.creditos}</td><td>₡${monto.toLocaleString()}</td><td><span class="badge ${estadoBadge}">${mat.estado}</span></td><td>${mat.estado === 'Pendiente' ? `<button class="btn-pagar" onclick="pagarMatriculaPendiente(${mat.id_matricula})">Pagar</button>` : '-'}</td></tr>`;
  }).join('');
}

function pagarMatriculaPendiente(idMatricula) {
  const matricula = matriculasDB.find(m => m.id_matricula === idMatricula);
  if (!matricula) return;
  const factura = facturasDB.find(f => f.id_estudiante === matricula.id_estudiante && f.estado === 'Pendiente');
  if (factura) {
    document.getElementById('pago-info').innerHTML = `<div><b>Factura:</b> INV-${factura.id_factura}</div><div><b>Concepto:</b> Matrícula</div><div><b>Monto:</b> ₡${factura.monto.toLocaleString()}</div>`;
    window.currentPagoFactura = factura;
    window.pendingMatriculaId = idMatricula;
    openMod('modal-pago');
  }
}

// ========================== FACTURAS Y PAGOS ==========================
function loadMisFacturas() {
  const misFacturas = facturasDB.filter(f => f.id_estudiante === currentEstudiante.id_estudiante);
  const tbody = document.getElementById('mis-facturas-tbody');
  const statsContainer = document.getElementById('pagos-stats-student');
  const pendingTotal = misFacturas.filter(f => f.estado === 'Pendiente').reduce((sum, f) => sum + f.monto, 0);
  const paidTotal = misFacturas.filter(f => f.estado === 'Pagada').reduce((sum, f) => sum + f.monto, 0);
  statsContainer.innerHTML = `<div class="pago-stat"><div><div class="amount">₡${paidTotal.toLocaleString()}</div><div class="plbl">Pagado</div></div><div class="stat-icon green">✓</div></div><div class="pago-stat"><div><div class="amount">₡${pendingTotal.toLocaleString()}</div><div class="plbl">Pendiente</div></div><div class="stat-icon amber">⏱</div></div>`;
  tbody.innerHTML = misFacturas.map(f => `<tr><td><span class="badge badge-blue">INV-${f.id_factura}</span></td><td>Matrícula</td><td>₡${f.monto.toLocaleString()}</td><td>${f.fecha_emision}</td><td><span class="badge ${f.estado === 'Pagada' ? 'badge-green' : 'badge-amber'}">${f.estado}</span></td><td>${f.estado === 'Pendiente' ? `<button class="btn-pagar" onclick="abrirPagoFactura(${f.id_factura})">Pagar</button>` : '-'}</td></tr>`).join('');
}

function abrirPagoFactura(idFactura) {
  const factura = facturasDB.find(f => f.id_factura === idFactura);
  if (factura) {
    document.getElementById('pago-info').innerHTML = `<div><b>Factura:</b> INV-${factura.id_factura}</div><div><b>Concepto:</b> Matrícula</div><div><b>Monto:</b> ₡${factura.monto.toLocaleString()}</div>`;
    window.currentPagoFactura = factura;
    window.pendingMatriculaId = null;
    openMod('modal-pago');
  }
}

function procesarPago() {
  const factura = window.currentPagoFactura;
  if (!factura) return;
  factura.estado = 'Pagada';
  // Actualizar matrículas pendientes del estudiante a Confirmada
  const matriculasPendientes = matriculasDB.filter(m => m.id_estudiante === factura.id_estudiante && m.estado === 'Pendiente');
  for (const mat of matriculasPendientes) mat.estado = 'Confirmada';
  // Si el estudiante tenía deuda, limpiarla
  const estudiante = estudiantesDB.find(e => e.id_estudiante === factura.id_estudiante);
  if (estudiante) { estudiante.tieneDeuda = false; estudiante.montoDeuda = 0; }
  registrarAuditoria(currentUser.id_usuario, `Pago registrado factura ${factura.id_factura}`);
  addNotification(factura.id_estudiante, 'Pago confirmado', `Tu pago ha sido confirmado. Matrícula activa.`, 'success');
  closeMods();
  toast('✅ Pago procesado exitosamente', '#10b981');
  if (currentUser.id_rol === 1) {
    loadMisFacturas();
    loadMisMatriculas();
    loadDashboardData();
  } else {
    loadAdminFacturas();
    loadAdminMatriculas();
  }
  window.currentPagoFactura = null;
}

// ========================== ADMIN FUNCTIONS ==========================
function abrirNuevaMatriculaAdmin() {
  const periodoActivo = periodosDB.find(p => p.estado === 'Activo');
  if (!periodoActivo) { toast('No hay periodo activo', '#ef4444'); return; }
  const seccionesDisponibles = seccionesDB.filter(s => s.id_periodo === periodoActivo.id_periodo && (s.cupo - s.inscritos) > 0);
  const container = document.getElementById('seccion-list-modal');
  container.innerHTML = seccionesDisponibles.map(sec => {
    const curso = cursosDB.find(c => c.id_curso === sec.id_curso);
    return `<label class="course-check-item"><input type="checkbox" value="${sec.id_seccion}"><div><div class="ci-name">${curso.codigo} - ${curso.nombre}</div><div class="ci-code">${curso.creditos} créditos | Cupos: ${sec.cupo - sec.inscritos}</div></div></label>`;
  }).join('');
  document.getElementById('matricula-student-field').style.display = 'block';
  document.getElementById('m-estudiante').value = '';
  document.getElementById('m-title').textContent = 'Nueva Matrícula (Admin)';
  openMod('modal-matricula');
}

function confirmarMatriculaAdmin() {
  const studentName = document.getElementById('m-estudiante').value.trim();
  if (!studentName) { toast('Ingrese nombre del estudiante', '#ef4444'); return; }
  const checkboxes = document.querySelectorAll('#seccion-list-modal input[type=checkbox]:checked');
  const selectedSeccionesIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
  if (selectedSeccionesIds.length === 0) { toast('Seleccione al menos una sección', '#ef4444'); return; }
  // Crear estudiante y usuario ficticio para demo
  const newUserId = usuariosDB.length + 1;
  usuariosDB.push({ id_usuario: newUserId, nombre: studentName, correo_institucional: `${studentName.replace(/\s/g,'')}@demo.edu`, id_rol: 1, estado: 'Activo' });
  const newEstId = estudiantesDB.length + 1;
  estudiantesDB.push({ id_estudiante: newEstId, id_usuario: newUserId, carnet: `DEMO${newEstId}`, estado_academico: 'Activo', tieneDeuda: false, montoDeuda: 0 });
  let totalCreditos = 0;
  for (const idSec of selectedSeccionesIds) {
    const sec = seccionesDB.find(s => s.id_seccion === idSec);
    const curso = cursosDB.find(c => c.id_curso === sec.id_curso);
    totalCreditos += curso.creditos;
    matriculasDB.push({
      id_matricula: nextIdMatricula++,
      id_estudiante: newEstId,
      id_seccion: idSec,
      fecha: new Date().toISOString().split('T')[0],
      estado: 'Confirmada'
    });
    sec.inscritos++;
    sec.disponibles = sec.cupo - sec.inscritos;
  }
  const monto = totalCreditos * 60000;
  facturasDB.push({ id_factura: nextIdFactura++, id_estudiante: newEstId, monto, fecha_emision: new Date().toISOString().split('T')[0], estado: 'Pagada' });
  registrarAuditoria(currentUser.id_usuario, `Admin matriculó a ${studentName} con ${selectedSeccionesIds.length} secciones`);
  addNotification(newUserId, 'Matrícula registrada', `Tu matrícula ha sido registrada por administración.`, 'success');
  closeMods();
  toast(`Matrícula registrada para ${studentName}`, '#10b981');
  loadAdminMatriculas();
  loadOfertaData();
}

function loadAdminMatriculas() {
  const tbody = document.getElementById('matricula-tbody-admin');
  tbody.innerHTML = matriculasDB.map(mat => {
    const est = estudiantesDB.find(e => e.id_estudiante === mat.id_estudiante);
    const user = usuariosDB.find(u => u.id_usuario === est.id_usuario);
    const sec = seccionesDB.find(s => s.id_seccion === mat.id_seccion);
    const curso = cursosDB.find(c => c.id_curso === sec.id_curso);
    const periodo = periodosDB.find(p => p.id_periodo === sec.id_periodo);
    const monto = curso.creditos * 60000;
    return `<tr><td>MAT-${mat.id_matricula}</td><td>${user?.nombre || 'N/A'}</td><td>${curso.codigo}</td><td>${periodo.nombre}</td><td>₡${monto.toLocaleString()}</td><td><span class="badge ${mat.estado === 'Confirmada' ? 'badge-green' : 'badge-amber'}">${mat.estado}</span></td><td><div class="action-btns"><button class="btn-icon danger" onclick="confirmDeleteMatricula(${mat.id_matricula}, 'MAT-${mat.id_matricula}')">🗑️</button></div></td></tr>`;
  }).join('');
}

function loadAdminFacturas() {
  const tbody = document.getElementById('facturas-tbody-admin');
  const statsContainer = document.getElementById('pagos-stats-admin');
  const pendingTotal = facturasDB.filter(f => f.estado === 'Pendiente').reduce((sum, f) => sum + f.monto, 0);
  const paidTotal = facturasDB.filter(f => f.estado === 'Pagada').reduce((sum, f) => sum + f.monto, 0);
  statsContainer.innerHTML = `<div class="pago-stat"><div><div class="amount">₡${(paidTotal/1000000).toFixed(1)}M</div><div class="plbl">Recibido</div></div><div class="stat-icon green">✓</div></div><div class="pago-stat"><div><div class="amount">₡${(pendingTotal/1000000).toFixed(1)}M</div><div class="plbl">Pendiente</div></div><div class="stat-icon amber">⏱</div></div>`;
  tbody.innerHTML = facturasDB.map(f => {
    const est = estudiantesDB.find(e => e.id_estudiante === f.id_estudiante);
    const user = usuariosDB.find(u => u.id_usuario === est.id_usuario);
    return `<tr><td><span class="badge badge-blue">INV-${f.id_factura}</span></td><td>${user?.nombre || 'N/A'}</td><td>Matrícula</td><td>₡${f.monto.toLocaleString()}</td><td>${f.fecha_emision}</td><td><span class="badge ${f.estado === 'Pagada' ? 'badge-green' : 'badge-amber'}">${f.estado}</span></td><td>${f.estado === 'Pendiente' ? `<button class="btn-pagar" onclick="abrirPagoAdmin(${f.id_factura})">Registrar Pago</button>` : '-'}</td></tr>`;
  }).join('');
}

function abrirPagoAdmin(idFactura) {
  const factura = facturasDB.find(f => f.id_factura === idFactura);
  if (factura) {
    document.getElementById('pago-info').innerHTML = `<div><b>Factura:</b> INV-${factura.id_factura}</div><div><b>Estudiante:</b> ${usuariosDB.find(u => u.id_usuario === estudiantesDB.find(e => e.id_estudiante === factura.id_estudiante)?.id_usuario)?.nombre}</div><div><b>Monto:</b> ₡${factura.monto.toLocaleString()}</div>`;
    window.currentPagoFactura = factura;
    openMod('modal-pago');
  }
}

function confirmDeleteMatricula(id, name) {
  window.deleteTarget = { type: 'matricula', id, name };
  document.getElementById('del-name').textContent = `"${name}"`;
  openMod('modal-delete');
}

function doDelete() {
  if (!window.deleteTarget) return;
  if (window.deleteTarget.type === 'seccion') {
    const index = seccionesDB.findIndex(s => s.id_seccion === window.deleteTarget.id);
    if (index !== -1) seccionesDB.splice(index, 1);
    toast('Sección eliminada', '#ef4444');
    registrarAuditoria(currentUser.id_usuario, `Eliminó sección ${window.deleteTarget.id}`);
    loadOfertaData();
  } else if (window.deleteTarget.type === 'matricula') {
    const index = matriculasDB.findIndex(m => m.id_matricula === window.deleteTarget.id);
    if (index !== -1) matriculasDB.splice(index, 1);
    toast('Matrícula eliminada', '#ef4444');
    registrarAuditoria(currentUser.id_usuario, `Eliminó matrícula ${window.deleteTarget.id}`);
    loadAdminMatriculas();
  }
  closeMods();
  window.deleteTarget = null;
}

// ================== NUEVAS FUNCIONES PARA CUMPLIR REQUERIMIENTOS ==================

// RF-13: Generar comprobante de matrícula
let ultimoComprobanteData = null;

function generarComprobanteMatricula(estudiante, secciones, montoTotal, idMatricula) {
  const fecha = new Date().toLocaleDateString();
  const comprobante = {
    numero: `MAT-${idMatricula}-${Date.now()}`,
    fecha: fecha,
    estudiante: estudiante.nombre,
    carnet: estudiante.carnet,
    secciones: secciones.map(s => ({
      curso: cursosDB.find(c => c.id_curso === s.id_curso)?.codigo,
      nombre: cursosDB.find(c => c.id_curso === s.id_curso)?.nombre,
      creditos: cursosDB.find(c => c.id_curso === s.id_curso)?.creditos,
      horario: s.horario,
      aula: s.aula
    })),
    totalCreditos: secciones.reduce((sum, s) => sum + (cursosDB.find(c => c.id_curso === s.id_curso)?.creditos || 0), 0),
    montoTotal: montoTotal,
    estado: "Pendiente de pago"
  };
  ultimoComprobanteData = comprobante;
  mostrarComprobante(comprobante);
  return comprobante;
}

function mostrarComprobante(comprobante) {
  const container = document.getElementById('comprobante-content');
  container.innerHTML = `
    <div style="text-align:center; margin-bottom:20px;">
      <h2>🏛️ Universidad UniMatricula</h2>
      <h3>Comprobante de Matrícula</h3>
      <p><strong>N°:</strong> ${comprobante.numero}</p>
      <p><strong>Fecha:</strong> ${comprobante.fecha}</p>
    </div>
    <div style="margin-bottom:20px;">
      <p><strong>Estudiante:</strong> ${comprobante.estudiante}</p>
      <p><strong>Carnet:</strong> ${comprobante.carnet}</p>
    </div>
    <div class="table-responsive">
      <table style="width:100%">
        <thead><tr><th>Código</th><th>Curso</th><th>Créditos</th><th>Horario</th><th>Aula</th></tr></thead>
        <tbody>
          ${comprobante.secciones.map(s => `
            <tr><td>${s.curso}</td><td>${s.nombre}</td><td>${s.creditos}</td><td>${s.horario}</td><td>${s.aula}</td></tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div style="margin-top:20px; text-align:right;">
      <p><strong>Total Créditos:</strong> ${comprobante.totalCreditos}</p>
      <p><strong>Monto Total:</strong> ₡${comprobante.montoTotal.toLocaleString()}</p>
      <p><strong>Estado:</strong> ${comprobante.estado}</p>
    </div>
    <div style="margin-top:20px; font-size:11px; text-align:center; color:#666;">
      <p>Este comprobante no es válido como factura. El pago debe realizarse para confirmar la matrícula.</p>
    </div>
  `;
  openMod('modal-comprobante');
}

function downloadComprobantePDF() {
  const element = document.getElementById('comprobante-content');
  html2pdf().from(element).set({
    margin: [10, 10, 10, 10],
    filename: `comprobante_matricula_${ultimoComprobanteData?.numero || 'descarga'}.pdf`,
    html2canvas: { scale: 2, backgroundColor: '#ffffff' },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  }).save();
}

// Modificar confirmarMatricula para incluir comprobante
const originalConfirmarMatricula = window.confirmarMatricula;
window.confirmarMatricula = function() {
  const checkboxes = document.querySelectorAll('#seccion-list-modal input[type=checkbox]:checked');
  const selectedSeccionesIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
  if (selectedSeccionesIds.length === 0) { toast('Selecciona al menos una sección', '#ef4444'); return; }
  
  const seccionesSeleccionadas = seccionesDB.filter(s => selectedSeccionesIds.includes(s.id_seccion));
  const validation = validarMatricula(currentEstudiante.id_estudiante, seccionesSeleccionadas);
  if (!validation.valido) { toast(validation.errors.join(' • '), '#ef4444'); return; }
  
  const nuevasMatriculas = [];
  for (const sec of seccionesSeleccionadas) {
    const nuevaMatricula = {
      id_matricula: nextIdMatricula++,
      id_estudiante: currentEstudiante.id_estudiante,
      id_seccion: sec.id_seccion,
      fecha: new Date().toISOString().split('T')[0],
      estado: 'Pendiente'
    };
    matriculasDB.push(nuevaMatricula);
    nuevasMatriculas.push(nuevaMatricula);
    sec.inscritos++;
    sec.disponibles = sec.cupo - sec.inscritos;
  }
  
  const totalCreditos = seccionesSeleccionadas.reduce((sum, sec) => sum + (cursosDB.find(c => c.id_curso === sec.id_curso)?.creditos || 0), 0);
  const monto = totalCreditos * 60000;
  const factura = {
    id_factura: nextIdFactura++,
    id_estudiante: currentEstudiante.id_estudiante,
    monto: monto,
    fecha_emision: new Date().toISOString().split('T')[0],
    estado: 'Pendiente'
  };
  facturasDB.push(factura);
  
  // RF-13: Generar comprobante
  const estudianteInfo = {
    nombre: currentUser.nombre,
    carnet: currentEstudiante.carnet
  };
  generarComprobanteMatricula(estudianteInfo, seccionesSeleccionadas, monto, nuevasMatriculas[0]?.id_matricula);
  
  registrarAuditoria(currentUser.id_usuario, `Registró matrícula con ${selectedSeccionesIds.length} secciones, factura ${factura.id_factura}`);
  addNotification(currentUser.id_usuario, 'Matrícula registrada', `Tu matrícula ha sido registrada. Debes pagar ₡${monto.toLocaleString()} para confirmarla.`, 'warning');
  closeMods();
  toast(`✅ Matrícula registrada. Total a pagar: ₡${monto.toLocaleString()}`, '#10b981');
  loadMisMatriculas();
  loadDashboardData();
  loadOfertaData();
};

// RF-14: Ajustes de matrícula (Retiro/Adición)
function habilitarPeriodoAjustes(fechaLimite) {
  const ajustesCard = document.getElementById('periodo-ajustes-card');
  if (ajustesCard) {
    ajustesCard.style.display = 'block';
    document.getElementById('ajuste-fecha-limite').textContent = fechaLimite;
    cargarAjustes();
  }
}

function cargarAjustes() {
  const container = document.getElementById('ajustes-container');
  const misMatriculas = matriculasDB.filter(m => m.id_estudiante === currentEstudiante.id_estudiante && m.estado === 'Confirmada');
  
  container.innerHTML = `
    <h4>Retirar Cursos</h4>
    <div class="table-responsive">
      <table>
        <thead><tr><th>Curso</th><th>Horario</th><th>Acción</th></tr></thead>
        <tbody>
          ${misMatriculas.map(mat => {
            const sec = seccionesDB.find(s => s.id_seccion === mat.id_seccion);
            const curso = cursosDB.find(c => c.id_curso === sec.id_curso);
            return `<tr>
              <td>${curso.codigo} - ${curso.nombre}</td>
              <td>${sec.horario}</td>
              <td><button class="btn-icon danger" onclick="retirarCurso(${mat.id_matricula})">Retirar</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <h4 style="margin-top:20px;">Agregar Cursos</h4>
    <div class="course-list" id="ajustes-agregar-list"></div>
  `;
  
  const seccionesDisponibles = seccionesDB.filter(s => 
    s.id_periodo === periodosDB.find(p => p.estado === 'Activo')?.id_periodo && 
    (s.cupo - s.inscritos) > 0 &&
    !misMatriculas.some(m => m.id_seccion === s.id_seccion)
  );
  
  const agregarContainer = document.getElementById('ajustes-agregar-list');
  agregarContainer.innerHTML = seccionesDisponibles.map(sec => {
    const curso = cursosDB.find(c => c.id_curso === sec.id_curso);
    return `<label class="course-check-item">
      <input type="checkbox" value="${sec.id_seccion}" class="ajuste-seccion-check">
      <div><div class="ci-name">${curso.codigo} - ${curso.nombre}</div><div class="ci-code">${curso.creditos} créditos | Cupos: ${sec.cupo - sec.inscritos} | ${sec.horario}</div></div>
    </label>`;
  }).join('');
  
  const btnAgregar = document.createElement('button');
  btnAgregar.className = 'btn-primary';
  btnAgregar.style.marginTop = '10px';
  btnAgregar.textContent = 'Agregar Cursos Seleccionados';
  btnAgregar.onclick = agregarCursosAjuste;
  agregarContainer.parentNode.appendChild(btnAgregar);
}

function retirarCurso(idMatricula) {
  const index = matriculasDB.findIndex(m => m.id_matricula === idMatricula);
  if (index !== -1) {
    const matricula = matriculasDB[index];
    const seccion = seccionesDB.find(s => s.id_seccion === matricula.id_seccion);
    if (seccion) {
      seccion.inscritos--;
      seccion.disponibles = seccion.cupo - seccion.inscritos;
    }
    matriculasDB.splice(index, 1);
    toast('Curso retirado exitosamente', '#10b981');
    registrarAuditoria(currentUser.id_usuario, `Retiró curso de matrícula ${idMatricula}`);
    loadMisMatriculas();
    cargarAjustes();
    loadOfertaData();
  }
}

function agregarCursosAjuste() {
  const checkboxes = document.querySelectorAll('.ajuste-seccion-check:checked');
  const selectedIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
  const seccionesAgregar = seccionesDB.filter(s => selectedIds.includes(s.id_seccion));
  
  for (const sec of seccionesAgregar) {
    const nuevaMatricula = {
      id_matricula: nextIdMatricula++,
      id_estudiante: currentEstudiante.id_estudiante,
      id_seccion: sec.id_seccion,
      fecha: new Date().toISOString().split('T')[0],
      estado: 'Confirmada'
    };
    matriculasDB.push(nuevaMatricula);
    sec.inscritos++;
    sec.disponibles = sec.cupo - sec.inscritos;
  }
  
  toast(`${seccionesAgregar.length} curso(s) agregado(s)`, '#10b981');
  registrarAuditoria(currentUser.id_usuario, `Agregó ${seccionesAgregar.length} cursos por ajuste`);
  loadMisMatriculas();
  cargarAjustes();
  loadOfertaData();
}

// RF-20,21,22: Exportar reportes
function exportReport(tipo = 'matriculas') {
  let data = [];
  let filename = '';
  let headers = [];
  
  if (tipo === 'matriculas') {
    data = matriculasDB.map(m => {
      const est = estudiantesDB.find(e => e.id_estudiante === m.id_estudiante);
      const user = usuariosDB.find(u => u.id_usuario === est?.id_usuario);
      const sec = seccionesDB.find(s => s.id_seccion === m.id_seccion);
      const curso = cursosDB.find(c => c.id_curso === sec?.id_curso);
      return {
        'ID Matrícula': m.id_matricula,
        'Estudiante': user?.nombre || 'N/A',
        'Carnet': est?.carnet || 'N/A',
        'Curso': curso?.codigo || 'N/A',
        'Fecha': m.fecha,
        'Estado': m.estado
      };
    });
    headers = ['ID Matrícula', 'Estudiante', 'Carnet', 'Curso', 'Fecha', 'Estado'];
    filename = 'reporte_matriculas.csv';
  } else if (tipo === 'financiero') {
    data = facturasDB.map(f => {
      const est = estudiantesDB.find(e => e.id_estudiante === f.id_estudiante);
      const user = usuariosDB.find(u => u.id_usuario === est?.id_usuario);
      return {
        'Factura': f.id_factura,
        'Estudiante': user?.nombre || 'N/A',
        'Monto': f.monto,
        'Fecha Emisión': f.fecha_emision,
        'Estado': f.estado
      };
    });
    headers = ['Factura', 'Estudiante', 'Monto', 'Fecha Emisión', 'Estado'];
    filename = 'reporte_financiero.csv';
  } else if (tipo === 'estudiantes') {
    data = estudiantesDB.map(e => {
      const user = usuariosDB.find(u => u.id_usuario === e.id_usuario);
      return {
        'ID Estudiante': e.id_estudiante,
        'Nombre': user?.nombre || 'N/A',
        'Carnet': e.carnet,
        'Estado Académico': e.estado_academico,
        'Tiene Deuda': e.tieneDeuda ? 'Sí' : 'No',
        'Monto Deuda': e.montoDeuda
      };
    });
    headers = ['ID Estudiante', 'Nombre', 'Carnet', 'Estado Académico', 'Tiene Deuda', 'Monto Deuda'];
    filename = 'reporte_estudiantes.csv';
  }
  
  // Convertir a CSV
  const csvRows = [headers.join(',')];
  for (const row of data) {
    const values = headers.map(header => {
      let value = row[header];
      if (typeof value === 'number') value = value.toString();
      if (value.includes(',') || value.includes('"')) value = `"${value.replace(/"/g, '""')}"`;
      return value;
    });
    csvRows.push(values.join(','));
  }
  
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  
  toast(`Reporte ${tipo} exportado a CSV`, '#10b981');
  registrarAuditoria(currentUser?.id_usuario || 0, `Exportó reporte ${tipo}`);
}

function exportMatriculaPDF() {
  const element = document.getElementById('my-courses-table');
  if (element && element.querySelector('tbody tr td')) {
    html2pdf().from(element).set({
      margin: 10,
      filename: `mis_cursos_${new Date().toISOString().split('T')[0]}.pdf`,
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
    }).save();
  } else {
    toast('No hay cursos para exportar', '#ef4444');
  }
}

// Gráficos con Chart.js
let chartMatriculas = null;
let chartPagos = null;

function generarGraficos() {
  const container = document.getElementById('graficos-container');
  container.style.display = 'block';
  
  // Datos por periodo
  const matriculasPorPeriodo = {};
  const pagosPorMes = {};
  
  matriculasDB.forEach(m => {
    const sec = seccionesDB.find(s => s.id_seccion === m.id_seccion);
    const periodo = periodosDB.find(p => p.id_periodo === sec?.id_periodo);
    if (periodo) {
      matriculasPorPeriodo[periodo.nombre] = (matriculasPorPeriodo[periodo.nombre] || 0) + 1;
    }
  });
  
  facturasDB.forEach(f => {
    const mes = f.fecha_emision.substring(0, 7);
    pagosPorMes[mes] = (pagosPorMes[mes] || 0) + (f.estado === 'Pagada' ? f.monto : 0);
  });
  
  const ctxMat = document.getElementById('chart-matriculas').getContext('2d');
  if (chartMatriculas) chartMatriculas.destroy();
  chartMatriculas = new Chart(ctxMat, {
    type: 'bar',
    data: {
      labels: Object.keys(matriculasPorPeriodo),
      datasets: [{
        label: 'Matrículas por Periodo',
        data: Object.values(matriculasPorPeriodo),
        backgroundColor: '#3b82f6'
      }]
    },
    options: { responsive: true, plugins: { legend: { position: 'top' } } }
  });
  
  const ctxPag = document.getElementById('chart-pagos').getContext('2d');
  if (chartPagos) chartPagos.destroy();
  chartPagos = new Chart(ctxPag, {
    type: 'line',
    data: {
      labels: Object.keys(pagosPorMes),
      datasets: [{
        label: 'Ingresos por Mes (₡)',
        data: Object.values(pagosPorMes),
        borderColor: '#10b981',
        tension: 0.1
      }]
    },
    options: { responsive: true }
  });
}

// Agregar item de Reportes al menú de admin
const originalRenderSidebarMenu = window.renderSidebarMenu;
window.renderSidebarMenu = function() {
  const navMenu = document.getElementById('nav-menu');
  const menuItems = currentUser.id_rol === 2 ? [
    { id: 'dashboard', name: 'Dashboard', icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z' },
    { id: 'oferta', name: 'Oferta Académica', icon: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z' },
    { id: 'matricula', name: 'Gestión Matrículas', icon: 'M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z' },
    { id: 'pagos', name: 'Gestión Pagos', icon: 'M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z' },
    { id: 'reportes', name: 'Reportes', icon: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z' }
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
};

// Modificar showPage para incluir reportes
const originalShowPage = window.showPage;
window.showPage = function(pageId) {
  if (typeof originalShowPage === 'function') {
    originalShowPage(pageId);
  }
  if (pageId === 'reportes') {
    // Mostrar botones de reportes
    document.getElementById('page-reportes').classList.add('active');
  }
  if (pageId === 'mis-matriculas' && currentUser?.id_rol === 1) {
    // Verificar si estamos en periodo de ajustes
    const hoy = new Date();
    const fechaAjuste = new Date('2025-02-15'); // Ejemplo: hasta 15 de febrero
    if (hoy <= fechaAjuste) {
      habilitarPeriodoAjustes('15/02/2025');
    }
  }
};

// Correquisitos (RF-07)
let correquisitosDB = [
  { id_curso: 2, id_curso_correquisito: 1 } // Cálculo II con Cálculo I
];

function verificarCorrequisitos(id_estudiante, id_curso) {
  const correquisitos = correquisitosDB.filter(r => r.id_curso === id_curso).map(r => r.id_curso_correquisito);
  if (correquisitos.length === 0) return true;
  
  const matriculasActuales = matriculasDB.filter(m => 
    m.id_estudiante === id_estudiante && 
    seccionesDB.find(s => s.id_seccion === m.id_seccion)?.id_periodo === periodosDB.find(p => p.estado === 'Activo')?.id_periodo
  );
  const cursosActuales = matriculasActuales.map(m => seccionesDB.find(s => s.id_seccion === m.id_seccion)?.id_curso);
  
  const cumple = correquisitos.every(req => cursosActuales.includes(req));
  if (!cumple) {
    const nombresReq = correquisitos.map(r => cursosDB.find(c => c.id_curso === r)?.codigo).join(', ');
    toast(`⚠️ Debe matricular simultáneamente: ${nombresReq}`, '#fb923c');
  }
  return cumple;
}

// Actualizar validarMatricula para incluir correquisitos
const originalValidarMatricula = window.validarMatricula;
window.validarMatricula = function(estudianteId, seccionesSeleccionadas) {
  let errors = [];
  let totalCreditos = 0;
  
  const estudiante = estudiantesDB.find(e => e.id_estudiante === estudianteId);
  if (estudiante?.tieneDeuda) {
    errors.push('No puedes matricularte porque tienes una deuda pendiente (RF-18).');
  }
  
  for (const sec of seccionesSeleccionadas) {
    if (sec.disponibles <= 0) {
      const curso = cursosDB.find(c => c.id_curso === sec.id_curso);
      errors.push(`No hay cupos disponibles para ${curso?.codigo || 'curso'}`);
    }
    if (!verificarPrerrequisitos(estudianteId, sec.id_curso)) {
      const curso = cursosDB.find(c => c.id_curso === sec.id_curso);
      errors.push(`Prerrequisito no cumplido para ${curso?.codigo}`);
    }
    if (!verificarCorrequisitos(estudianteId, sec.id_curso)) {
      const curso = cursosDB.find(c => c.id_curso === sec.id_curso);
      errors.push(`Correquisito requerido para ${curso?.codigo}`);
    }
    totalCreditos += cursosDB.find(c => c.id_curso === sec.id_curso)?.creditos || 0;
  }
  
  if (totalCreditos > 18) {
    errors.push(`Excede el límite de créditos (máximo 18, seleccionaste ${totalCreditos})`);
  }
  
  // Mejorar validación de conflictos de horario
  for (let i = 0; i < seccionesSeleccionadas.length; i++) {
    for (let j = i+1; j < seccionesSeleccionadas.length; j++) {
      if (hayConflictoHorarioDetallado(seccionesSeleccionadas[i].horario, seccionesSeleccionadas[j].horario)) {
        errors.push(`Conflicto de horario: ${seccionesSeleccionadas[i].horario} vs ${seccionesSeleccionadas[j].horario}`);
      }
    }
  }
  
  return { valido: errors.length === 0, errors, totalCreditos };
};

function hayConflictoHorarioDetallado(horario1, horario2) {
  const diasMap = { 'Lun': 1, 'Mar': 2, 'Mie': 3, 'Jue': 4, 'Vie': 5, 'Sab': 6 };
  const dias1 = horario1.match(/Lun|Mar|Mie|Jue|Vie|Sab/g) || [];
  const dias2 = horario2.match(/Lun|Mar|Mie|Jue|Vie|Sab/g) || [];
  
  // Extraer horas
  const horaRegex = /(\d{2}:\d{2})-(\d{2}:\d{2})/;
  const match1 = horario1.match(horaRegex);
  const match2 = horario2.match(horaRegex);
  
  if (!match1 || !match2) return dias1.some(d => dias2.includes(d));
  
  const inicio1 = match1[1];
  const fin1 = match1[2];
  const inicio2 = match2[1];
  const fin2 = match2[2];
  
  const haySolapamiento = (inicio1 < fin2 && fin1 > inicio2);
  
  // Hay conflicto si comparten día Y hay solapamiento horario
  return dias1.some(d => dias2.includes(d)) && haySolapamiento;
}

// ========================== MODALES Y OTROS ==========================
function openMod(id) {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
  document.getElementById(id).classList.add('open');
}
function closeMods() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
  window.deleteTarget = null;
  window.editSeccionId = null;
  window.currentPagoFactura = null;
}
document.querySelectorAll('.modal-overlay').forEach(o => o.addEventListener('click', function(e) { if (e.target === this) closeMods(); }));

function toggleNotif() { document.getElementById('notif-panel').classList.toggle('open'); }
function closeNotif() { document.getElementById('notif-panel').classList.remove('open'); }
document.addEventListener('click', e => { const panel = document.getElementById('notif-panel'); if (panel?.classList.contains('open') && !panel.contains(e.target) && !e.target.closest('#notif-trigger')) closeNotif(); });

function doLogout() {
  currentUser = null;
  currentEstudiante = null;
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
  registrarAuditoria(currentUser?.id_usuario || 0, 'Logout');
}

// Inicialización de selects en modales
function populateSelects() {
  const cursoSelect = document.getElementById('c-id-curso');
  if (cursoSelect) {
    cursoSelect.innerHTML = cursosDB.map(c => `<option value="${c.id_curso}">${c.codigo} - ${c.nombre}</option>`).join('');
  }
  const periodoSelect = document.getElementById('c-id-periodo');
  if (periodoSelect) {
    periodoSelect.innerHTML = periodosDB.map(p => `<option value="${p.id_periodo}">${p.nombre}</option>`).join('');
  }
}
setTimeout(populateSelects, 100);

// Sidebar responsive
document.getElementById('sidebarToggle')?.addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
document.getElementById('mobileMenuBtn')?.addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));