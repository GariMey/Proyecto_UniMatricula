const mysql = require('mysql2/promise');

async function checkUsers() {
    const connection = await mysql.createConnection({
        host: 'tiusr20pl.cuc-carrera-ti.ac.cr',
        port: 3306,
        database: 'matriculauni',
        user: 'matricula_user',
        password: 'XPf^mf0fly1@Q1ey'
    });

    console.log('🔍 Buscando usuarios en la base de datos...\n');
    
    // Ver todos los usuarios
    const [users] = await connection.execute(`
        SELECT id_usuario, nombre, correo_institucional, contrasena_hash, id_rol, estado 
        FROM Usuario
    `);
    
    console.log('📋 Usuarios encontrados:');
    console.log('='.repeat(80));
    users.forEach(user => {
        console.log(`ID: ${user.id_usuario}`);
        console.log(`  Nombre: ${user.nombre}`);
        console.log(`  Email: ${user.correo_institucional}`);
        console.log(`  Rol ID: ${user.id_rol}`);
        console.log(`  Estado: ${user.estado}`);
        console.log(`  Hash: ${user.contrasena_hash ? 'Sí' : 'NULL'}`);
        console.log('-'.repeat(40));
    });
    
    await connection.end();
}

checkUsers().catch(console.error);