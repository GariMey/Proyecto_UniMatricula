const sql = require('mssql');

async function testAllConfigurations() {
    console.log('🔍 Probando configuraciones para el servidor correcto...\n');
    
    // Contraseña real que usaste en Plesk para el usuario GARITA
    const TU_CONTRASEÑA = 'LA_CONTRASEÑA_QUE_PUSISTE_EN_PLESK';  // ← CAMBIA ESTO
    
    // Configuraciones a probar (basadas en tus datos reales)
    const configs = [
        {
            name: '✅ CORRECTO - Servidor tiusr19pl con usuario GARITA',
            config: {
                server: 'tiusr19pl.cuc-carrera-ti.ac.cr',
                port: 1433,
                database: 'MatriculaUNI',
                user: 'GARITA',
                password: GARITA123,
                options: {
                    trustServerCertificate: true,
                    encrypt: false,
                    connectTimeout: 15000
                }
            }
        },
        {
            name: 'Servidor tiusr19pl con puerto 1433 (trusted)',
            config: {
                server: 'tiusr19pl.cuc-carrera-ti.ac.cr',
                port: 1433,
                database: 'MatriculaUNI',
                options: {
                    trustedConnection: true,
                    trustServerCertificate: true,
                    encrypt: false,
                    connectTimeout: 15000
                }
            }
        },
        {
            name: 'IP del servidor (si la conoces)',
            config: {
                server: '201.207.100.XXX',  // Si conoces la IP
                port: 1433,
                database: 'MatriculaUNI',
                user: 'GARITA',
                password: GARITA123,
                options: {
                    trustServerCertificate: true,
                    encrypt: false,
                    connectTimeout: 15000
                }
            }
        }
    ];
    
    let workingConfig = null;
    
    for (const test of configs) {
        try {
            console.log(`📡 Probando: ${test.name}`);
            await sql.connect(test.config);
            const result = await sql.query`SELECT @@SERVERNAME as servidor, DB_NAME() as db, GETDATE() as fecha`;
            console.log(`✅ ¡CONECTADO!`);
            console.log(`   Servidor: ${result.recordset[0].servidor}`);
            console.log(`   Base de datos: ${result.recordset[0].db}`);
            console.log(`   Fecha: ${result.recordset[0].fecha}\n`);
            workingConfig = test.config;
            await sql.close();
            break;
        } catch (err) {
            console.log(`❌ Falló: ${err.message.substring(0, 100)}\n`);
        }
    }
    
    if (workingConfig) {
        console.log('🎉 Configuración que funciona:');
        console.log(JSON.stringify(workingConfig, null, 2));
        console.log('\n📝 Copia estos valores a tu archivo .env:');
        console.log(`DB_SERVER=${workingConfig.server}`);
        console.log(`DB_USER=${workingConfig.user || '(Windows Auth)'}`);
        console.log(`DB_PASSWORD=${workingConfig.password || '(Windows Auth)'}`);
    } else {
        console.log('❌ Ninguna configuración funcionó');
        console.log('\n🔧 Posibles problemas:');
        console.log('1. La contraseña del usuario GARITA es incorrecta');
        console.log('2. El firewall bloquea el puerto 1433');
        console.log('3. SQL Server no permite conexiones remotas');
        console.log('4. El servicio SQL Server no está corriendo');
    }
}

testAllConfigurations();