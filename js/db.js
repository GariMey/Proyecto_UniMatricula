const sql = require('mssql');

async function testAllConfigurations() {
    console.log('🔍 Probando todas las configuraciones posibles...\n');
    
    // Configuraciones a probar
    const configs = [
        {
            name: 'SQL Auth - Garita:1433 con sa',
            config: {
                server: 'Garita',
                port: 1433,
                database: 'MatriculaUNI',
                user: 'sa',
                password: '1234',  // Prueba con '1234' o la contraseña que uses
                options: {
                    trustServerCertificate: true,
                    encrypt: false,
                    connectTimeout: 15000
                }
            }
        },
        {
            name: 'SQL Auth - Garita\\PRINCIPAL con sa',
            config: {
                server: 'Garita\\PRINCIPAL',
                database: 'MatriculaUNI',
                user: 'sa',
                password: '1234',
                options: {
                    trustServerCertificate: true,
                    encrypt: false,
                    connectTimeout: 15000
                }
            }
        },
        {
            name: 'SQL Auth - localhost con sa',
            config: {
                server: 'localhost',
                port: 1433,
                database: 'MatriculaUNI',
                user: 'sa',
                password: '1234',
                options: {
                    trustServerCertificate: true,
                    encrypt: false,
                    connectTimeout: 15000
                }
            }
        },
        {
            name: 'Windows Auth - Garita (sin puerto)',
            config: {
                server: 'Garita',
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
            name: 'Windows Auth - Garita\\PRINCIPAL',
            config: {
                server: 'Garita\\PRINCIPAL',
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
            name: 'Windows Auth - localhost\\PRINCIPAL',
            config: {
                server: 'localhost\\PRINCIPAL',
                database: 'MatriculaUNI',
                options: {
                    trustedConnection: true,
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
    } else {
        console.log('❌ Ninguna configuración funcionó');
        console.log('\n🔧 Posibles soluciones:');
        console.log('1. Verifica que SQL Server permita autenticación mixta');
        console.log('2. Habilita el usuario sa en SQL Server');
        console.log('3. Verifica la contraseña del usuario sa');
        console.log('4. Reinicia el servicio SQL Server');
    }
}

testAllConfigurations();