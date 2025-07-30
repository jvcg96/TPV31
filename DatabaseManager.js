// DatabaseManager.js - Sistema de almacenamiento con IndexedDB
// Preparado para futura migración a backend

const DB_NAME = 'TPV_Hosteleria_DB';
const DB_VERSION = 1;

// Hacer disponible la función de licencias si existe
if (typeof window !== 'undefined' && !window.obtenerEstadoLicencia) {
    window.obtenerEstadoLicencia = function () {
        return { tipo: 'standard', activa: true, pagada: false };
    };
}


class DatabaseManager {
    constructor() {
        this.db = null;
        this.isReady = false;
    }

    // Inicializar la base de datos
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('Error al abrir IndexedDB:', request.error);
                reject(request.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.isReady = true;
                console.log('✅ IndexedDB inicializada correctamente');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Crear almacenes (stores)

                // Facturación
                if (!db.objectStoreNames.contains('facturacion')) {
                    const facturacionStore = db.createObjectStore('facturacion', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    facturacionStore.createIndex('fecha', 'fecha', { unique: false });
                    facturacionStore.createIndex('mesa', 'mesa', { unique: false });
                    facturacionStore.createIndex('total', 'total', { unique: false });
                    facturacionStore.createIndex('fechaHora', ['fecha', 'hora'], { unique: false });
                }

                // Movimientos de inventario
                if (!db.objectStoreNames.contains('movimientos')) {
                    const movimientosStore = db.createObjectStore('movimientos', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    movimientosStore.createIndex('fecha', 'fecha', { unique: false });
                    movimientosStore.createIndex('productoId', 'productoId', { unique: false });
                    movimientosStore.createIndex('tipo', 'tipo', { unique: false });
                }

                // Imágenes de productos
                if (!db.objectStoreNames.contains('imagenes')) {
                    const imagenesStore = db.createObjectStore('imagenes', {
                        keyPath: 'productoId'
                    });
                }

                // Estadísticas precalculadas
                if (!db.objectStoreNames.contains('estadisticas')) {
                    const statsStore = db.createObjectStore('estadisticas', {
                        keyPath: 'clave'
                    });
                }

                // Búsquedas guardadas (premium)
                if (!db.objectStoreNames.contains('busquedasGuardadas')) {
                    const busquedasStore = db.createObjectStore('busquedasGuardadas', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                }

                console.log('📊 Estructura de base de datos creada');
            };
        });
    }

    // Verificar si la DB está lista
    async waitForReady() {
        if (this.isReady) return;

        let intentos = 0;
        while (!this.isReady && intentos < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            intentos++;
        }

        if (!this.isReady) {
            throw new Error('Timeout esperando IndexedDB');
        }
    }

    // ========== MÉTODOS DE FACTURACIÓN ==========

    async guardarFacturacion(venta) {
        await this.waitForReady();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['facturacion'], 'readwrite');
            const store = transaction.objectStore('facturacion');

            // Agregar campos adicionales para búsqueda
            const ventaConDatos = {
                ...venta,
                fecha: new Date(venta.fecha).toISOString().split('T')[0],
                hora: new Date(venta.fecha).toISOString().split('T')[1].split('.')[0],
                año: new Date(venta.fecha).getFullYear(),
                mes: new Date(venta.fecha).getMonth() + 1,
                dia: new Date(venta.fecha).getDate(),

                fechaUnica: venta.fechaUnica || `${venta.fecha}_${venta.mesa}_${venta.total}_${Date.now()}`
            };

            const request = store.add(ventaConDatos);

            request.onsuccess = () => {
                // Actualizar estadísticas en segundo plano
                this.actualizarEstadisticas(ventaConDatos);
                resolve(request.result);
            };

            request.onerror = () => reject(request.error);
        });
    }

    async obtenerFacturacion(filtros = {}) {
        await this.waitForReady();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['facturacion'], 'readonly');
            const store = transaction.objectStore('facturacion');
            const resultado = [];

            let request;

            // Aplicar filtros según plan de usuario
            const licencia = window.obtenerEstadoLicencia ? window.obtenerEstadoLicencia() : { tipo: 'standard' };
            const diasLimite = this.obtenerLimiteHistorico(licencia.tipo);
            const fechaLimite = new Date();
            fechaLimite.setDate(fechaLimite.getDate() - diasLimite);

            if (filtros.fecha) {
                const index = store.index('fecha');
                request = index.openCursor(IDBKeyRange.only(filtros.fecha));
            } else if (filtros.mesa) {
                const index = store.index('mesa');
                request = index.openCursor(IDBKeyRange.only(filtros.mesa));
            } else {
                request = store.openCursor();
            }

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const venta = cursor.value;

                    // Verificar límite de tiempo según plan
                    if (new Date(venta.fecha) >= fechaLimite) {
                        resultado.push(venta);
                    }

                    cursor.continue();
                } else {
                    resolve(resultado);
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    // ========== MÉTODOS DE INVENTARIO ==========

    async guardarMovimiento(movimiento) {
        await this.waitForReady();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['movimientos'], 'readwrite');
            const store = transaction.objectStore('movimientos');

            const movimientoConDatos = {
                ...movimiento,
                fecha: new Date().toISOString(),
                timestamp: Date.now()
            };

            const request = store.add(movimientoConDatos);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async obtenerMovimientos(productoId = null, limite = 500) {
        await this.waitForReady();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['movimientos'], 'readonly');
            const store = transaction.objectStore('movimientos');
            const resultado = [];

            let request;
            if (productoId) {
                const index = store.index('productoId');
                request = index.openCursor(IDBKeyRange.only(productoId));
            } else {
                request = store.openCursor(null, 'prev'); // Orden descendente
            }

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && resultado.length < limite) {
                    resultado.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(resultado);
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    // ========== MÉTODOS DE IMÁGENES ==========

    async guardarImagen(productoId, imagenBase64) {
        await this.waitForReady();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['imagenes'], 'readwrite');
            const store = transaction.objectStore('imagenes');

            const request = store.put({
                productoId: productoId,
                imagen: imagenBase64,
                fechaActualizacion: new Date().toISOString()
            });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async obtenerImagen(productoId) {
        await this.waitForReady();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['imagenes'], 'readonly');
            const store = transaction.objectStore('imagenes');
            const request = store.get(productoId);

            request.onsuccess = () => {
                resolve(request.result ? request.result.imagen : null);
            };

            request.onerror = () => reject(request.error);
        });
    }

    // ========== UTILIDADES ==========

    obtenerLimiteHistorico(tipoLicencia) {
        const limites = {
            'standard': 180,  // 6 meses
            'standard-pagado': 180,
            'pro': 365,      // 1 año
            'premium': 730,  // 2 años
            'trial': 30      // 30 días
        };
        return limites[tipoLicencia] || 180;
    }

    async actualizarEstadisticas(venta) {
        // Actualizar estadísticas diarias
        const fechaKey = `stats_${venta.fecha}`;

        const transaction = this.db.transaction(['estadisticas'], 'readwrite');
        const store = transaction.objectStore('estadisticas');

        const request = store.get(fechaKey);

        request.onsuccess = async () => {
            const stats = request.result || {
                clave: fechaKey,
                fecha: venta.fecha,
                totalVentas: 0,
                numeroVentas: 0,
                productosMasVendidos: {},
                ventasPorHora: {}
            };

            // Actualizar estadísticas
            stats.totalVentas += venta.total;
            stats.numeroVentas += 1;

            // Actualizar productos más vendidos
            venta.items.forEach(item => {
                if (!stats.productosMasVendidos[item.id]) {
                    stats.productosMasVendidos[item.id] = {
                        nombre: item.nombre,
                        cantidad: 0,
                        total: 0
                    };
                }
                stats.productosMasVendidos[item.id].cantidad += 1;
                stats.productosMasVendidos[item.id].total += item.precio;
            });

            // Actualizar ventas por hora
            const hora = new Date(venta.fecha).getHours();
            if (!stats.ventasPorHora[hora]) {
                stats.ventasPorHora[hora] = {
                    ventas: 0,
                    total: 0
                };
            }
            stats.ventasPorHora[hora].ventas += 1;
            stats.ventasPorHora[hora].total += venta.total;

            store.put(stats);
        };
    }

    // ========== BÚSQUEDAS AVANZADAS (PREMIUM) ==========

    async busquedaAvanzada(criterios) {
        await this.waitForReady();

        const licencia = window.obtenerEstadoLicencia ? window.obtenerEstadoLicencia() : { tipo: 'standard' };
        if (licencia.tipo !== 'premium' && licencia.tipo !== 'pro') {
            throw new Error('Función disponible solo para usuarios Premium/Pro');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['facturacion'], 'readonly');
            const store = transaction.objectStore('facturacion');
            const resultado = [];

            const request = store.openCursor();

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const venta = cursor.value;
                    let cumpleCriterios = true;

                    // Aplicar filtros complejos
                    if (criterios.productoId) {
                        cumpleCriterios = venta.items.some(item => item.id === criterios.productoId);
                    }

                    if (criterios.rangoTotal && cumpleCriterios) {
                        cumpleCriterios = venta.total >= criterios.rangoTotal.min &&
                            venta.total <= criterios.rangoTotal.max;
                    }

                    if (criterios.horaInicio && criterios.horaFin && cumpleCriterios) {
                        const hora = new Date(venta.fecha).getHours();
                        cumpleCriterios = hora >= criterios.horaInicio && hora <= criterios.horaFin;
                    }

                    if (criterios.metodoPago && cumpleCriterios) {
                        cumpleCriterios = venta.metodoPago === criterios.metodoPago;
                    }

                    if (cumpleCriterios) {
                        resultado.push(venta);
                    }

                    cursor.continue();
                } else {
                    resolve(resultado);
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    // ========== LIMPIEZA Y MANTENIMIENTO ==========

    async limpiarDatosAntiguos() {
        await this.waitForReady();

        const licencia = obtenerEstadoLicencia();
        const diasLimite = this.obtenerLimiteHistorico(licencia.tipo);
        const fechaLimite = new Date();
        fechaLimite.setDate(fechaLimite.getDate() - diasLimite);

        // Limpiar facturación antigua
        const transaction = this.db.transaction(['facturacion', 'movimientos'], 'readwrite');

        // Limpiar facturación
        const factStore = transaction.objectStore('facturacion');
        const factIndex = factStore.index('fecha');
        const factRequest = factIndex.openCursor();

        factRequest.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                if (new Date(cursor.value.fecha) < fechaLimite) {
                    cursor.delete();
                }
                cursor.continue();
            }
        };

        // Limpiar movimientos
        const movStore = transaction.objectStore('movimientos');
        const movRequest = movStore.openCursor();

        movRequest.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                if (new Date(cursor.value.fecha) < fechaLimite) {
                    cursor.delete();
                }
                cursor.continue();
            }
        };
    }

    // ========== EXPORTACIÓN/IMPORTACIÓN ==========

    async exportarDatos() {
        await this.waitForReady();

        const datos = {
            fecha_exportacion: new Date().toISOString(),
            version: DB_VERSION,
            facturacion: await this.obtenerFacturacion(),
            movimientos: await this.obtenerMovimientos(null, 9999),
            estadisticas: await this.obtenerTodasEstadisticas()
        };

        return datos;
    }

    async importarDatos(datos) {
        await this.waitForReady();

        // Validar formato
        if (!datos.version || !datos.facturacion) {
            throw new Error('Formato de datos inválido');
        }

        // Importar facturación
        const transaction = this.db.transaction(['facturacion', 'movimientos'], 'readwrite');

        for (const venta of datos.facturacion) {
            await this.guardarFacturacion(venta);
        }

        for (const movimiento of (datos.movimientos || [])) {
            await this.guardarMovimiento(movimiento);
        }

        return true;
    }

    async obtenerTodasEstadisticas() {
        await this.waitForReady();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['estadisticas'], 'readonly');
            const store = transaction.objectStore('estadisticas');
            const resultado = [];

            const request = store.openCursor();

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    resultado.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(resultado);
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    // ========== CACHÉ INTELIGENTE ==========

    async obtenerDatosHoy() {
        const hoy = new Date().toISOString().split('T')[0];
        const cacheKey = `cache_${hoy}`;

        // Intentar obtener del localStorage para velocidad
        const cacheLocal = localStorage.getItem(cacheKey);
        if (cacheLocal) {
            return JSON.parse(cacheLocal);
        }

        // Si no está en caché, obtener de IndexedDB
        const datos = await this.obtenerFacturacion({ fecha: hoy });

        // Guardar en caché local
        localStorage.setItem(cacheKey, JSON.stringify(datos));

        return datos;
    }

    // Limpiar caché antiguo
    limpiarCacheLocal() {
        const hoy = new Date().toISOString().split('T')[0];
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('cache_') && !key.includes(hoy)) {
                localStorage.removeItem(key);
            }
        });
    }
}

// Crear instancia global
const DB = new DatabaseManager();

// Exportar para uso en otros archivos
window.DatabaseManager = DB;