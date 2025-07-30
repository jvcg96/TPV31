// Datos del sistema con emojis - Ahora modificable
let productos = JSON.parse(localStorage.getItem('productosPersonalizados')) || [
    { id: 1, nombre: "Café", precio: 1.20, emoji: "☕", stock: 100, stockMinimo: 20, categoria: "barra" },
    { id: 2, nombre: "Tostada", precio: 1.50, emoji: "🍞", stock: 50, stockMinimo: 10, categoria: "cocina" },
    { id: 3, nombre: "Coca-Cola", precio: 2.00, emoji: "🥤", stock: 50, stockMinimo: 15, categoria: "barra" },
    { id: 4, nombre: "Cerveza", precio: 2.50, emoji: "🍺", stock: 50, stockMinimo: 15, categoria: "barra" }
];

let mesas = {};
let facturacion = [];
let mesaActual = null;
let historialMovimientos = [];
let pedidosFiltrados = []; // AGREGAR ESTA LÍNEA
// Sistema de categorías personalizables
let areas = JSON.parse(localStorage.getItem('areasPersonalizadas')) || [
    { id: 'barra', nombre: 'Barra', activa: true },
    { id: 'cocina', nombre: 'Cocina', activa: true },
    { id: 'terraza', nombre: 'Terraza', activa: true }
];

// Sistema de categorías (tipo de producto)
let categorias = JSON.parse(localStorage.getItem('categoriasPersonalizadas')) || [
    { id: 'bebidas', nombre: 'Bebidas', activa: true },
    { id: 'comida', nombre: 'Comida', activa: true },
    { id: 'alcohol', nombre: 'Alcohol', activa: true }
];

// ========================================
// SISTEMA DE HARDWARE ID Y LICENCIAS
// ========================================

function getHardwareFingerprint() {
    // Crear fingerprint único del dispositivo
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('TPV_HW_2024', 2, 2);

    const info = [
        navigator.userAgent,
        screen.width + 'x' + screen.height,
        screen.colorDepth,
        navigator.language,
        new Date().getTimezoneOffset(),
        navigator.hardwareConcurrency || 'NC'
    ].join('|');

    // Generar ID corto y legible
    const hash = btoa(info).replace(/[^A-Z0-9]/gi, '').substring(0, 8).toUpperCase();
    return hash;
}
// Sistema de migración de datos existentes
async function migrarDatosExistentes() {
    // Verificar si ya se migró
    if (localStorage.getItem('datosMigradosIndexedDB') === 'true') {
        return;
    }

    console.log('🔄 Iniciando migración de datos existentes...');

    try {
        // Migrar facturación existente si hay
        const datosGuardados = localStorage.getItem('barCafeteriaDatos');
        if (datosGuardados) {
            const datos = JSON.parse(datosGuardados);

            // IMPORTANTE: Manejar facturación de versión antigua
            if (datos.facturacion && datos.facturacion.length > 0) {
                console.log(`📊 Importando ${datos.facturacion.length} ventas...`);

                // LIMPIAR TODA LA FACTURACIÓN ANTERIOR
                mostrarNotificacion('🗑️ Limpiando datos anteriores...');

                // Limpiar IndexedDB completamente
                const transaction = DB.db.transaction(['facturacion'], 'readwrite');
                const store = transaction.objectStore('facturacion');
                await store.clear(); // Elimina TODOS los registros

                // Limpiar array local
                facturacion = [];

                console.log('✅ Datos anteriores limpiados');

                // Ahora importar cada venta a IndexedDB
                // Ahora importar cada venta a IndexedDB verificando duplicados
                let ventasMigradas = 0;
                for (const venta of datos.facturacion) {
                    try {
                        // Agregar un ID único si no tiene
                        if (!venta.fechaUnica) {
                            venta.fechaUnica = `${venta.fecha}_${venta.mesa}_${venta.total}_${Math.random().toString(36).substr(2, 9)}`;
                        }
                        await DB.guardarFacturacion(venta);
                        ventasMigradas++;
                    } catch (error) {
                        console.warn('Venta posiblemente duplicada, ignorando:', error);
                    }
                }

                console.log(`✅ Facturación migrada: ${ventasMigradas} de ${datos.facturacion.length} ventas`);
            }
        }

        // Migrar historial de movimientos si existe
        const movimientosGuardados = localStorage.getItem('historialMovimientos');
        if (movimientosGuardados) {
            const movimientos = JSON.parse(movimientosGuardados);

            if (movimientos && movimientos.length > 0) {
                console.log(`📦 Migrando ${movimientos.length} movimientos...`);

                for (const movimiento of movimientos) {
                    await DB.guardarMovimiento(movimiento);
                }

                console.log('✅ Movimientos migrados correctamente');
            }
        }

        // Marcar como migrado
        localStorage.setItem('datosMigradosIndexedDB', 'true');
        console.log('✅ Migración completada exitosamente');

    } catch (error) {
        console.error('❌ Error durante la migración:', error);
    }
}

// Sistema de licencias
const LICENCIA_CONFIG = {
    TRIAL_DIAS: 7,
    PRECIO_PRO: '69€/mes',
    PRECIO_PREMIUM: '130€/mes',
    FEATURES_PRO: [
        'Análisis básico de facturación',
        'Gráficos de ventas diarias',
        'Filtros por categoría',
        'Exportación CSV básica',
        'Historial 90 días',
        'Soporte por email'
    ],
    FEATURES_PREMIUM: [
        'Todo lo de Pro +',
        'Análisis avanzado completo',
        'Gráficos interactivos ilimitados',
        'Filtros por producto individual',
        'Exportación avanzada (CSV, PDF, Excel)',
        'Historial ilimitado',
        'API para integraciones',
        'Soporte prioritario 24/7',
        'Actualizaciones anticipadas'
    ]
};

// Verificar estado de licencia
function obtenerEstadoLicencia() {
    const licData = localStorage.getItem('lic_data');

    if (!licData) {
        // Verificar formato antiguo por compatibilidad
        const tipoAntiguo = localStorage.getItem('licenciaTipo');
        if (tipoAntiguo) {
            // Migrar al nuevo formato
            const tipo = tipoAntiguo;
            const key = localStorage.getItem('licenciaKey');
            activarLicencia(key || `${tipo.toUpperCase()}-MIGRADO`, tipo);
        }
        return { tipo: 'standard', activa: true, pagada: false };
    }

    try {
        const datos = JSON.parse(atob(licData));
        const tipo = atob(datos.t);

        // Verificar que el hardware coincida
        const hardwareActual = getHardwareFingerprint();
        if (datos.h && datos.h !== hardwareActual) {
            console.warn('⚠️ Hardware ID no coincide');
            return { tipo: 'standard', activa: true, pagada: false };
        }

        return {
            tipo: tipo,
            activa: true,
            key: '****-****', // No mostrar la key real
            pagada: true,
            hardwareId: datos.h
        };
    } catch (e) {
        return { tipo: 'standard', activa: true, pagada: false };
    }
}

// Función para activar premium
function activarPremium(key) {
    return activarLicencia(key, 'premium');
}

function activarLicencia(key, tipo) {
    // Determinar tipo por prefijo si no se especifica
    if (!tipo) {
        if (key.startsWith('STD-')) tipo = 'standard';
        else if (key.startsWith('PRO-')) tipo = 'pro';
        else if (key.startsWith('PREM-')) tipo = 'premium';
        else return false;
    }

    // Validar que la licencia sea para este hardware
    const hardwareId = getHardwareFingerprint();
    const partes = key.split('-');

    // Verificar formato: TIPO-HARDWARE-XXXX-XXXX
    if (partes.length >= 3 && partes[1] !== hardwareId && partes[1] !== 'TEST') {
        alert('⚠️ Esta licencia no es válida para este dispositivo');
        return false;
    }

    if (key && key.length >= 16) {
        // Ofuscar datos antes de guardar
        const datosLicencia = {
            t: btoa(tipo),
            k: btoa(key),
            h: hardwareId,
            f: new Date().toISOString()
        };

        localStorage.setItem('lic_data', btoa(JSON.stringify(datosLicencia)));
        return true;
    }
    return false;
}

// Función para iniciar trial
function iniciarTrial() {
    const licencia = obtenerEstadoLicencia();
    if (licencia.tipo === 'standard') {
        localStorage.setItem('licenciaTipo', 'trial');
        localStorage.setItem('licenciaFecha', new Date().toISOString());
        return true;
    }
    return false;
}

// Variable global para estado de licencia
let licenciaActual = obtenerEstadoLicencia();

window.onload = async function () {
    // Inicializar IndexedDB
    try {
        await DB.init();
        console.log('✅ Sistema de base de datos iniciado correctamente');

        // Migrar datos existentes si es necesario
        await migrarDatosExistentes();

    } catch (error) {
        console.error('❌ Error al iniciar base de datos:', error);
        alert('Error al iniciar el sistema. Por favor recarga la página.');
        return;
    }



    // Cargar estado del teclado virtual
    setTimeout(() => {
        cargarEstadoTeclado();
        // CÓDIGO SECRETO: Ocultar panel de desarrollo por defecto
        const panelDev = document.getElementById('panelDesarrollo');
        if (panelDev) panelDev.style.display = 'none';

        // Activar con: Ctrl+Shift+D seguido de escribir "DEV"
        let secretSequence = [];
        let ctrlShiftPressed = false;

        document.addEventListener('keydown', (e) => {
            // Detectar Ctrl+Shift+D
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                ctrlShiftPressed = true;
                secretSequence = [];
                mostrarNotificacion('🔑 Escribe el código...');

                // Timeout de 3 segundos para escribir DEV
                setTimeout(() => {
                    ctrlShiftPressed = false;
                    secretSequence = [];
                }, 3000);
            }
            // Si ya presionó Ctrl+Shift+D, capturar las siguientes teclas
            else if (ctrlShiftPressed && e.key.length === 1) {
                secretSequence.push(e.key.toUpperCase());

                // Verificar si escribió "DEV"
                if (secretSequence.join('') === 'DEV') {
                    if (panelDev) {
                        panelDev.style.display = 'block';
                        panelDev.scrollIntoView({ behavior: 'smooth' });
                        mostrarNotificacion('🔧 Panel de Desarrollo Activado');
                    }
                    ctrlShiftPressed = false;
                    secretSequence = [];
                }
            }
        });

        // ALTERNATIVA: Triple click en el título mientras presionas Alt
        const titulo = document.querySelector('header h1');
        let clickCount = 0;
        let clickTimer = null;

        titulo.addEventListener('click', (e) => {
            if (e.altKey) {
                clickCount++;

                if (clickCount === 3) {
                    if (panelDev) {
                        panelDev.style.display = panelDev.style.display === 'none' ? 'block' : 'none';
                        if (panelDev.style.display === 'block') {
                            panelDev.scrollIntoView({ behavior: 'smooth' });
                            mostrarNotificacion('🔧 Panel de Desarrollo Activado');
                        }
                    }
                    clickCount = 0;
                }

                // Reset contador después de 1 segundo
                clearTimeout(clickTimer);
                clickTimer = setTimeout(() => {
                    clickCount = 0;
                }, 1000);
            }
        });
    }, 500);

    // Mostrar indicador si el teclado está activado
    if (esDispositivoTactil()) {
        console.log('🔧 Teclado virtual activado');
        document.body.classList.add('dispositivo-tactil');
    }

    // Ya se inicializó arriba, ahora solo cargar datos
    await cargarDatos();
    // NUEVO: Intentar recuperar mesas no cobradas
    const mesasRecuperadas = recuperarEstadoMesas();
    if (mesasRecuperadas) {
        let hayMesasConProductos = false;

        // Verificar si hay mesas con productos sin cobrar
        Object.entries(mesasRecuperadas).forEach(([mesaId, productos]) => {
            if (productos && productos.length > 0) {
                hayMesasConProductos = true;
            }
        });

        if (hayMesasConProductos) {
            if (confirm('⚠️ Se detectaron mesas con productos sin cobrar de una sesión anterior.\n\n¿Deseas recuperarlas?')) {
                mesas = mesasRecuperadas;
                renderizarMesas();
                mostrarNotificacion('✅ Mesas recuperadas correctamente');
            } else {
                // Limpiar datos temporales si no se quieren recuperar
                localStorage.removeItem('mesasTemporales');
            }
        }
    }


    // Cargar historial de movimientos desde IndexedDB
    try {
        historialMovimientos = await DB.obtenerMovimientos();
        console.log(`📦 Cargados ${historialMovimientos.length} movimientos de inventario`);
    } catch (error) {
        console.error('Error al cargar movimientos:', error);
        historialMovimientos = [];
    }

    actualizarFecha();
    renderizarMesas();

    // Mostrar tipo de licencia en header
    mostrarTipoLicencia();
    function mostrarTipoLicencia() {
        const licencia = obtenerEstadoLicencia();
        const header = document.querySelector('header h1');

        if (licencia.tipo === 'premium') {
            header.innerHTML += ' <span style="font-size: 0.5em; background: linear-gradient(135deg, #ffd700, #ffed4e); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">PREMIUM</span>';
        } else if (licencia.tipo === 'trial') {
            header.innerHTML += ` <span style="font-size: 0.5em; color: #22c55e;">TRIAL (${licencia.diasRestantes} días)</span>`;
        }
    }

    actualizarFacturacion();
    renderizarListaProductos();
    renderizarListaMesas();
    renderizarListaCategorias();
    actualizarSelectoresCategorias();
    renderizarListaAreas();
    actualizarSelectoresAreas();

    // Inicializar filtros de pedidos solo si existen los elementos
    setTimeout(() => {
        if (document.getElementById('filtroFecha')) {
            inicializarFiltrosPedidos();
        }
    }, 100);

    setInterval(guardarDatos, 5000); // Guardar cada 5 segundos

    // Actualizar estado del panel de desarrollo
    setTimeout(() => {
        actualizarEstadoLicenciaDev();
    }, 1000);

    // Limpiar datos antiguos automáticamente (ejecutar 1 vez al día)
    const ultimaLimpieza = localStorage.getItem('ultimaLimpiezaDB');
    const hoy = new Date().toDateString();

    if (ultimaLimpieza !== hoy) {
        setTimeout(async () => {
            try {
                await DB.limpiarDatosAntiguos();
                DB.limpiarCacheLocal();
                localStorage.setItem('ultimaLimpiezaDB', hoy);
                console.log('✅ Limpieza automática completada');
            } catch (error) {
                console.error('Error en limpieza automática:', error);
            }
        }, 5000); // Ejecutar 5 segundos después de cargar
    }
};

function actualizarFecha() {
    const fecha = new Date();
    const opciones = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('fecha').textContent = fecha.toLocaleDateString('es-ES', opciones);
}

function showTab(tabName) {
    const tabs = document.querySelectorAll('.tab-content');
    const buttons = document.querySelectorAll('.tab-button');

    tabs.forEach(tab => tab.classList.remove('active'));
    buttons.forEach(btn => btn.classList.remove('active'));

    document.getElementById(tabName).classList.add('active');
    event.target.classList.add('active');

    if (tabName === 'facturacion') {
        actualizarFacturacion();
    } else if (tabName === 'configuracion') {
        renderizarListaProductos();
        renderizarListaMesas();
    } else if (tabName === 'pedidos') {
        // Esperar un poco para que se cargue la UI
        setTimeout(() => {
            actualizarTabPedidos();
        }, 100);
    } else if (tabName === 'inventario') {
        // Actualizar pestaña de inventario
        setTimeout(() => {
            actualizarTabInventario();
        }, 100);
    }
}

function renderizarMesas() {
    const grid = document.getElementById('mesasGrid');
    grid.innerHTML = '';

    // Inicializar configuración de mesas si no existe
    inicializarMesasConfig();

    // Obtener solo mesas activas
    const mesasActivas = mesasConfig.filter(m => m.activa);

    if (mesasActivas.length === 0) {
        grid.innerHTML = '<p style="text-align: center; padding: 40px; color: #888; grid-column: 1/-1;">No hay mesas configuradas<br><small>Ve a Configuración → Gestión de Mesas para agregar mesas</small></p>';
        return;
    }

    mesasActivas.forEach(mesaConfig => {
        const mesaId = mesaConfig.id;

        // Inicializar array de productos si no existe
        if (!mesas[mesaId]) mesas[mesaId] = [];

        const total = calcularTotalMesa(mesaId);
        const div = document.createElement('div');
        div.className = `mesa ${total > 0 ? 'ocupada' : ''}`;
        div.onclick = () => abrirMesa(mesaId);

        // Crear contenido de la mesa
        const capacidadInfo = mesaConfig.capacidad > 0 ? `👥 ${mesaConfig.capacidad}` : '';
        const descripcionInfo = mesaConfig.descripcion ? `<small style="opacity: 0.7;">${mesaConfig.descripcion}</small>` : '';

        div.innerHTML = `
            <h3>${mesaConfig.nombre}</h3>
            <div style="font-size: 0.9em; color: #888; margin: 5px 0;">
                ${capacidadInfo}
                ${descripcionInfo}
            </div>
            <p style="margin-top: 10px;">${total > 0 ? `€${total.toFixed(2)}` : 'Libre'}</p>
        `;

        grid.appendChild(div);
    });
}

function calcularTotalMesa(numMesa) {
    return mesas[numMesa].reduce((total, item) => total + item.precio, 0);
}

async function abrirMesa(mesaId) {
    const mesaConfig = mesasConfig.find(m => m.id === mesaId);
    if (!mesaConfig) return;

    // Esperar a que IndexedDB esté lista
    try {
        await DB.waitForReady();
    } catch (error) {
        console.error('Error: IndexedDB no está lista:', error);
        // Continuar de todos modos, las imágenes usarán emoji como fallback
    }

    mesaActual = mesaId;
    document.getElementById('mesaTitulo').textContent = mesaConfig.nombre;

    // Renderizar productos con emojis o imágenes
    const grid = document.getElementById('productosGrid');
    grid.innerHTML = '';
    productos.forEach(producto => {
        const btn = document.createElement('button');
        btn.className = 'producto-btn';
        btn.setAttribute('data-producto-id', producto.id);

        const stockColor = producto.stock <= 0 ? '#ff6b6b' :
            producto.stock <= producto.stockMinimo ? '#ffa502' : '#888';

        const stockText = producto.stock <= 0 ? 'SIN STOCK' : `Stock: ${producto.stock}`;

        // Determinar qué mostrar: imagen o emoji
        let visualElement = '';
        if (producto.tieneImagen) {
            // Usar emoji como fallback mientras carga o si falla
            visualElement = `<span style="font-size: 40px; line-height: 1;" data-loading="true">${producto.emoji}</span>`;

            // Cargar imagen asíncronamente con mejor manejo
            DB.obtenerImagen(producto.id).then(imagenBase64 => {
                if (imagenBase64) {
                    const img = `<img src="${imagenBase64}" alt="${producto.nombre}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px; margin-bottom: 5px;">`;
                    // Actualizar el botón con la imagen
                    const boton = document.querySelector(`[data-producto-id="${producto.id}"]`);
                    if (boton) {
                        const visualContainer = boton.querySelector('span[data-loading="true"], img');
                        if (visualContainer) {
                            visualContainer.outerHTML = img;
                        }
                    }
                }
                // Si no hay imagen, dejar el emoji (ya está mostrándose)
            }).catch(error => {
                console.error(`Error al cargar imagen del producto ${producto.id}:`, error);
                // El emoji ya está visible como fallback, no hacer nada más
            });
        } else {
            visualElement = `<span style="font-size: 40px; line-height: 1;">${producto.emoji}</span>`;
        }

        btn.innerHTML = `
            ${visualElement}
            <div style="font-weight: 600; margin: 5px 0;">${producto.nombre}</div>
            <div style="font-size: 1.1em; color: #ffa502;">€${producto.precio.toFixed(2)}</div>
            <span class="stock-info" style="font-size: 0.8em; color: ${stockColor};">${stockText}</span>
        `;

        if (producto.stock <= 0) {
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
        } else {
            btn.onclick = () => agregarProducto(producto);
        }

        grid.appendChild(btn);
    });

    actualizarTicket();
    document.getElementById('mesaModal').style.display = 'block';
}


function agregarProducto(producto) {
    // Verificar stock antes de agregar
    if (!verificarStock(producto.id)) {
        return;
    }

    mesas[mesaActual].push({
        ...producto,
        timestamp: new Date().toISOString()
    });

    // YA NO REDUCIMOS STOCK AQUÍ - Solo lo haremos al cobrar
    // reducirStock(producto.id); // COMENTADO

    actualizarTicket();
    renderizarMesas();

    // NUEVO: Guardar estado de mesas en localStorage por si se cierra
    guardarEstadoMesas();
}
// AGREGAR después de la función agregarProducto:
function verificarStock(productoId) {
    const producto = productos.find(p => p.id === productoId);
    if (!producto) return false;

    if (producto.stock <= 0) {
        mostrarNotificacion(`❌ ${producto.nombre} sin stock disponible`);
        return false;
    }

    if (producto.stock <= producto.stockMinimo) {
        mostrarNotificacion(`⚠️ Stock bajo: ${producto.nombre} (${producto.stock} restantes)`);
    }

    return true;
}

function reducirStock(productoId) {
    const producto = productos.find(p => p.id === productoId);
    if (producto && producto.stock > 0) {
        const stockAnterior = producto.stock;
        producto.stock--;

        // Registrar movimiento de stock
        registrarMovimientoStock(producto, stockAnterior, producto.stock, 'Venta - Reducción automática');

        localStorage.setItem('productosPersonalizados', JSON.stringify(productos));

        // Actualizar visualización si estamos en productos
        if (document.getElementById('listaProductos')) {
            renderizarListaProductos();
        }

        // Actualizar productos en modal si está abierto
        if (mesaActual !== null) {
            const grid = document.getElementById('productosGrid');
            if (grid) {
                const btn = grid.querySelector(`[data-producto-id="${productoId}"]`);
                if (btn) {
                    const stockSpan = btn.querySelector('.stock-info');
                    if (stockSpan) {
                        stockSpan.textContent = `Stock: ${producto.stock}`;
                        stockSpan.style.color = producto.stock <= producto.stockMinimo ? '#ff6b6b' : '#888';
                    }
                }
            }
        }
    }
}

function obtenerProductosBajoStock() {
    return productos.filter(p => p.stock <= p.stockMinimo && p.stock > 0);
}

function obtenerProductosSinStock() {
    return productos.filter(p => p.stock <= 0);
}

function actualizarTicket() {
    const container = document.getElementById('ticketItems');
    container.innerHTML = '';

    // Agrupar productos
    const grupos = {};
    mesas[mesaActual].forEach(item => {
        if (!grupos[item.id]) {
            grupos[item.id] = {
                nombre: item.nombre,
                precio: item.precio,
                cantidad: 0,
                emoji: item.emoji
            };
        }
        grupos[item.id].cantidad++;
    });

    // Mostrar productos agrupados con emojis
    Object.values(grupos).forEach(grupo => {
        const div = document.createElement('div');
        div.className = 'ticket-item';
        div.innerHTML = `
            <span>${grupo.emoji} ${grupo.cantidad}x ${grupo.nombre}</span>
            <span>€${(grupo.precio * grupo.cantidad).toFixed(2)}</span>
        `;
        container.appendChild(div);
    });

    // Actualizar total
    const total = calcularTotalMesa(mesaActual);
    document.getElementById('totalMesa').textContent = `Total: €${total.toFixed(2)}`;
}

function cobrarMesa() {
    const total = calcularTotalMesa(mesaActual);
    if (total === 0) {
        alert('La mesa está vacía');
        return;
    }

    // Abrir modal de cobro en lugar de confirm simple
    abrirModalCobro(total);
}

// Nueva función para abrir modal de cobro
function abrirModalCobro(total) {
    // Resetear todos los valores del modal
    document.getElementById('totalACobrar').textContent = `€${total.toFixed(2)}`;
    document.getElementById('cantidadRecibida').value = '';
    document.getElementById('cambioCalculado').textContent = '€0.00';
    document.getElementById('metodoPago').value = 'efectivo';

    // Resetear estado de los botones y secciones
    const confirmarBtn = document.getElementById('confirmarCobroBtn');
    confirmarBtn.disabled = true;
    confirmarBtn.style.opacity = '0.5';

    // Asegurar que las secciones correctas estén visibles
    document.getElementById('seccionEfectivo').style.display = 'block';
    document.getElementById('seccionCambio').style.display = 'block';

    // Mostrar modal
    document.getElementById('modalCobro').style.display = 'block';

    // Configurar teclado virtual para el campo de cantidad si es dispositivo táctil
    if (esDispositivoTactil()) {
        setTimeout(() => {
            const inputCantidad = document.getElementById('cantidadRecibida');
            inputCantidad.readOnly = true;

            // Remover listeners anteriores para evitar duplicados
            const newInput = inputCantidad.cloneNode(true);
            inputCantidad.parentNode.replaceChild(newInput, inputCantidad);

            // Agregar nuevo listener
            newInput.addEventListener('click', function (e) {
                e.preventDefault();
                this.blur();
                abrirTecladoNumerico(this);
            });
        }, 200);
    } else {
        // Solo hacer focus si NO es dispositivo táctil
        setTimeout(() => {
            document.getElementById('cantidadRecibida').focus();
            document.getElementById('cantidadRecibida').select();
        }, 100);
    }
}

// Función para calcular cambio en tiempo real
function calcularCambio() {
    const total = parseFloat(document.getElementById('totalACobrar').textContent.replace('€', ''));
    const recibido = parseFloat(document.getElementById('cantidadRecibida').value) || 0;
    const cambio = recibido - total;

    const cambioElement = document.getElementById('cambioCalculado');
    const confirmarBtn = document.getElementById('confirmarCobroBtn');

    if (recibido >= total) {
        cambioElement.textContent = `€${cambio.toFixed(2)}`;
        cambioElement.style.color = '#22c55e';
        confirmarBtn.disabled = false;
        confirmarBtn.style.opacity = '1';
    } else {
        cambioElement.textContent = `Falta: €${Math.abs(cambio).toFixed(2)}`;
        cambioElement.style.color = '#ff6b6b';
        confirmarBtn.disabled = true;
        confirmarBtn.style.opacity = '0.5';
    }
}

// Función para confirmar el cobro
async function confirmarCobro() {
    if (!mesaActual || !mesas[mesaActual]) {
        alert('Error: No hay mesa seleccionada');
        cerrarModalCobro();
        return;
    }
    const total = parseFloat(document.getElementById('totalACobrar').textContent.replace('€', ''));
    const recibido = parseFloat(document.getElementById('cantidadRecibida').value) || 0;
    const metodoPago = document.getElementById('metodoPago').value;
    const cambio = recibido - total;

    if (metodoPago === 'efectivo' && recibido < total) {
        alert('La cantidad recibida es insuficiente');
        return;
    }

    // Crear objeto de venta
    const venta = {
        fecha: new Date().toISOString(),
        mesa: mesaActual,
        total: total,
        items: [...mesas[mesaActual]],
        metodoPago: metodoPago,
        cantidadRecibida: metodoPago === 'efectivo' ? recibido : total,
        cambio: metodoPago === 'efectivo' ? cambio : 0
    };

    // NUEVO: Reducir stock SOLO al confirmar el cobro
    const productosVendidos = {};
    mesas[mesaActual].forEach(item => {
        if (!productosVendidos[item.id]) {
            productosVendidos[item.id] = 0;
        }
        productosVendidos[item.id]++;
    });

    // Reducir stock de cada producto vendido
    Object.entries(productosVendidos).forEach(([productoId, cantidad]) => {
        const producto = productos.find(p => p.id === parseInt(productoId));
        if (producto) {
            const stockAnterior = producto.stock;
            producto.stock = Math.max(0, producto.stock - cantidad);

            // Registrar movimiento de stock
            registrarMovimientoStock(
                producto,
                stockAnterior,
                producto.stock,
                `Venta confirmada - Mesa ${obtenerNombreMesa(mesaActual)}`
            );
        }
    });

    // Guardar cambios de productos
    localStorage.setItem('productosPersonalizados', JSON.stringify(productos));

    try {
        // Guardar SOLO en IndexedDB - NO en memoria
        await DB.guardarFacturacion(venta);

        // NO agregamos a facturacion.push(venta) para evitar duplicados

    } catch (error) {
        console.error('Error al guardar venta:', error);
        alert('Error al procesar la venta. Por favor intenta de nuevo.');
        return;
    }

    // Limpiar mesa
    mesas[mesaActual] = [];
    cerrarModalCobro();
    cerrarModal();
    renderizarMesas();
    guardarDatos();
    guardarEstadoMesas(); // Actualizar con mesas vacías

    // Mostrar confirmación con detalles del cobro
    let mensaje = `✅ Mesa ${obtenerNombreMesa(mesaActual)} cobrada: €${total.toFixed(2)}`;
    if (metodoPago === 'efectivo' && cambio > 0) {
        mensaje += `\n💰 Cambio: €${cambio.toFixed(2)}`;
    }
    mensaje += `\n💳 Método: ${metodoPago.charAt(0).toUpperCase() + metodoPago.slice(1)}`;

    mostrarNotificacion(mensaje);

    // Resetear modal para próxima operación
    setTimeout(() => {
        resetearModalCobro();
    }, 100);
}

// Función para cerrar modal de cobro
function cerrarModalCobro() {
    // Resetear completamente el modal al cerrarlo
    document.getElementById('cantidadRecibida').value = '';
    document.getElementById('cambioCalculado').textContent = '€0.00';
    document.getElementById('metodoPago').value = 'efectivo';

    const confirmarBtn = document.getElementById('confirmarCobroBtn');
    confirmarBtn.disabled = true;
    confirmarBtn.style.opacity = '0.5';

    // Asegurar que las secciones estén en estado por defecto (efectivo)
    document.getElementById('seccionEfectivo').style.display = 'block';
    document.getElementById('seccionCambio').style.display = 'block';

    // Cerrar modal
    document.getElementById('modalCobro').style.display = 'none';
}

// Función para resetear completamente el modal de cobro
function resetearModalCobro() {
    const metodoPago = document.getElementById('metodoPago');
    const cantidadRecibida = document.getElementById('cantidadRecibida');
    const cambioCalculado = document.getElementById('cambioCalculado');
    const confirmarBtn = document.getElementById('confirmarCobroBtn');
    const seccionEfectivo = document.getElementById('seccionEfectivo');
    const seccionCambio = document.getElementById('seccionCambio');

    // Resetear valores
    metodoPago.value = 'efectivo';
    cantidadRecibida.value = '';
    cambioCalculado.textContent = '€0.00';
    cambioCalculado.style.color = '#22c55e';

    // Resetear estado del botón
    confirmarBtn.disabled = true;
    confirmarBtn.style.opacity = '0.5';

    // Mostrar secciones de efectivo por defecto
    seccionEfectivo.style.display = 'block';
    seccionCambio.style.display = 'block';
}

// Función para manejar cambio de método de pago
function toggleCantidadRecibida() {
    const metodoPago = document.getElementById('metodoPago').value;
    const seccionEfectivo = document.getElementById('seccionEfectivo');
    const seccionCambio = document.getElementById('seccionCambio');
    const confirmarBtn = document.getElementById('confirmarCobroBtn');
    const cantidadRecibida = document.getElementById('cantidadRecibida');
    const cambioCalculado = document.getElementById('cambioCalculado');

    if (metodoPago === 'efectivo') {
        // Mostrar secciones de efectivo
        seccionEfectivo.style.display = 'block';
        seccionCambio.style.display = 'block';

        // Resetear valores
        cantidadRecibida.value = '';
        cambioCalculado.textContent = '€0.00';
        cambioCalculado.style.color = '#22c55e';

        // Deshabilitar botón hasta que se ingrese cantidad válida
        confirmarBtn.disabled = true;
        confirmarBtn.style.opacity = '0.5';

        // Focus en input de cantidad
        setTimeout(() => {
            cantidadRecibida.focus();
        }, 50);

    } else {
        // Ocultar secciones de efectivo
        seccionEfectivo.style.display = 'none';
        seccionCambio.style.display = 'none';

        // Habilitar botón para métodos digitales
        confirmarBtn.disabled = false;
        confirmarBtn.style.opacity = '1';

        // Limpiar valores que no se necesitan
        cantidadRecibida.value = '';
        cambioCalculado.textContent = '€0.00';
    }
}

// Función para establecer el importe exacto
function establecerImporteExacto() {
    const total = document.getElementById('totalACobrar').textContent.replace('€', '');
    document.getElementById('cantidadRecibida').value = total;
    calcularCambio();
}



function limpiarMesa() {
    // PRIMERO verificar que hay productos
    if (!mesas[mesaActual] || mesas[mesaActual].length === 0) {
        alert('La mesa ya está vacía');
        return;
    }

    if (confirm('¿Limpiar todos los productos de la mesa?')) {
        // Con el nuevo sistema, NO restauramos stock porque nunca se redujo
        // El stock solo se reduce al COBRAR, no al agregar a la mesa

        // Obtener info para la notificación
        const totalItems = mesas[mesaActual].length;
        const productosUnicos = new Set(mesas[mesaActual].map(item => item.id)).size;

        // Limpiar la mesa
        mesas[mesaActual] = [];
        actualizarTicket();
        renderizarMesas();

        // NUEVO: Actualizar estado temporal de mesas
        guardarEstadoMesas();

        // Actualizar vista de productos si el modal está abierto
        if (document.getElementById('mesaModal').style.display === 'block') {
            abrirMesa(mesaActual);
        }

        // Mostrar notificación
        mostrarNotificacion(`🔄 Mesa limpiada: ${totalItems} items (${productosUnicos} productos diferentes)`);
    }
}

function cerrarModal() {
    document.getElementById('mesaModal').style.display = 'none';
    mesaActual = null;
}
// NUEVA FUNCIÓN: Guardar estado de mesas temporalmente
function guardarEstadoMesas() {
    const estadoMesas = {
        mesas: mesas,
        timestamp: new Date().toISOString()
    };
    localStorage.setItem('mesasTemporales', JSON.stringify(estadoMesas));
}

// NUEVA FUNCIÓN: Recuperar estado de mesas
function recuperarEstadoMesas() {
    const estadoGuardado = localStorage.getItem('mesasTemporales');
    if (estadoGuardado) {
        try {
            const estado = JSON.parse(estadoGuardado);
            // Solo recuperar si los datos son de las últimas 24 horas
            const hace24Horas = new Date();
            hace24Horas.setHours(hace24Horas.getHours() - 24);

            if (new Date(estado.timestamp) > hace24Horas) {
                return estado.mesas;
            }
        } catch (error) {
            console.error('Error al recuperar estado de mesas:', error);
        }
    }
    return null;
}

async function actualizarFacturacion() {
    // NUEVO: Obtener TODAS las ventas para totales reales
    let todasLasVentas = [];
    try {
        // Usar función especial que obtiene TODO sin filtros
        todasLasVentas = await DB.obtenerTodasLasVentasReales();
    } catch (error) {
        console.error('Error al obtener facturación:', error);
        todasLasVentas = [];
    }

    // Para las tablas de detalles, obtener solo lo permitido por licencia
    try {
        facturacion = await DB.obtenerFacturacion();
    } catch (error) {
        console.error('Error al obtener facturación:', error);
        facturacion = [];
    }

    // Verificar licencia
    licenciaActual = obtenerEstadoLicencia();

    // Si no es premium, mostrar versión standard
    if (licenciaActual.tipo === 'standard') {
        mostrarFacturacionStandard();
        return;
    }

    // Si es trial, mostrar aviso
    if (licenciaActual.tipo === 'trial') {
        mostrarAvisoTrial();
    }

    // Continuar con facturación premium...
    const hoy = new Date();
    const inicioSemana = new Date(hoy);
    inicioSemana.setDate(hoy.getDate() - hoy.getDay() + 1);
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    // Calcular totales CON TODAS LAS VENTAS (sin restricción de licencia)
    let totalHoy = 0;
    let totalSemana = 0;
    let totalMes = 0;
    let totalTrimestre = 0;
    const trimestreActual = getTrimestreActual();
    const totalesPorAño = {}; // NUEVO: Totales por año

    // Usar TODAS las ventas para totales reales
    todasLasVentas.forEach(venta => {
        const fechaVenta = new Date(venta.fecha);
        const año = fechaVenta.getFullYear();

        // Acumular por año
        if (!totalesPorAño[año]) {
            totalesPorAño[año] = {
                total: 0,
                ventas: 0
            };
        }
        totalesPorAño[año].total += venta.total;
        totalesPorAño[año].ventas++;

        // Totales normales
        if (fechaVenta.toDateString() === hoy.toDateString()) {
            totalHoy += venta.total;
        }
        if (fechaVenta >= inicioSemana) {
            totalSemana += venta.total;
        }
        if (fechaVenta >= inicioMes) {
            totalMes += venta.total;
        }
        if (fechaVenta >= trimestreActual.inicio) {
            totalTrimestre += venta.total;
        }
    });

    // Para las tablas de detalles, usar solo ventas filtradas por licencia
    const facturacionPorDia = {};
    const facturacionPorSemana = {};

    facturacion.forEach(venta => {
        const fechaVenta = new Date(venta.fecha);
        const dia = fechaVenta.toLocaleDateString('es-ES');
        const semana = getNumeroSemana(fechaVenta);

        // Por día
        if (!facturacionPorDia[dia]) {
            facturacionPorDia[dia] = 0;
        }
        facturacionPorDia[dia] += venta.total;

        // Por semana
        const keySemana = `Semana ${semana} - ${fechaVenta.getFullYear()}`;
        if (!facturacionPorSemana[keySemana]) {
            facturacionPorSemana[keySemana] = 0;
        }
        facturacionPorSemana[keySemana] += venta.total;

        // Totales
        if (fechaVenta.toDateString() === hoy.toDateString()) {
            totalHoy += venta.total;
        }
        if (fechaVenta >= inicioSemana) {
            totalSemana += venta.total;
        }
        if (fechaVenta >= inicioMes) {
            totalMes += venta.total;
        }
    });



    // Actualizar UI
    document.getElementById('facturacionHoy').textContent = `€${totalHoy.toFixed(2)}`;
    document.getElementById('facturacionSemana').textContent = `€${totalSemana.toFixed(2)}`;
    document.getElementById('facturacionMes').textContent = `€${totalMes.toFixed(2)}`;

    // Actualizar total del trimestre
    document.getElementById('facturacionTrimestre').textContent = `€${totalTrimestre.toFixed(2)}`;


    // Actualizar nombre del trimestre
    const nombresTrimestres = {
        1: 'Q1 (Ene-Mar)',
        2: 'Q2 (Abr-Jun)',
        3: 'Q3 (Jul-Sep)',
        4: 'Q4 (Oct-Dic)'
    };

    const elemNombreTrimestre = document.getElementById('nombreTrimestre');
    if (elemNombreTrimestre) {
        elemNombreTrimestre.textContent = nombresTrimestres[trimestreActual.numero];
    }

    // Mostrar totales por año
    mostrarTotalesPorAño(totalesPorAño);

    // Tabla diaria
    const tbodyDiaria = document.getElementById('facturacionDiaria');
    tbodyDiaria.innerHTML = '';

    // Últimos 7 días
    const diasMostrar = [];
    for (let i = 6; i >= 0; i--) {
        const fecha = new Date();
        fecha.setDate(fecha.getDate() - i);
        diasMostrar.push(fecha.toLocaleDateString('es-ES'));
    }

    diasMostrar.forEach(dia => {
        const tr = document.createElement('tr');
        const total = facturacionPorDia[dia] || 0;
        tr.innerHTML = `
            <td>${dia}</td>
            <td><strong>€${total.toFixed(2)}</strong></td>
        `;
        tbodyDiaria.appendChild(tr);
    });

    // Tabla semanal
    const tbodySemanal = document.getElementById('facturacionSemanal');
    tbodySemanal.innerHTML = '';

    Object.entries(facturacionPorSemana).slice(-4).forEach(([semana, total]) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${semana}</td>
            <td><strong>€${total.toFixed(2)}</strong></td>
        `;
        tbodySemanal.appendChild(tr);
    });
}


function mostrarTotalesPorAño(totalesPorAño) {
    // Buscar o crear contenedor
    let contenedorAños = document.getElementById('totalesPorAño');

    if (!contenedorAños) {
        // Crear contenedor si no existe
        const statsGrid = document.querySelector('#facturacion .stats-grid');
        if (!statsGrid) return;

        contenedorAños = document.createElement('div');
        contenedorAños.id = 'totalesPorAño';
        contenedorAños.style.cssText = `
            background: linear-gradient(135deg, rgba(30, 30, 30, 0.9), rgba(40, 40, 40, 0.9));
            border: 2px solid rgba(255, 165, 2, 0.3);
            padding: 25px;
            border-radius: 20px;
            margin: 30px 0;
            position: relative;
            overflow: hidden;
        `;

        // Insertar después de stats-grid
        statsGrid.parentNode.insertBefore(contenedorAños, statsGrid.nextSibling);
    }

    // Ordenar años de más reciente a más antiguo
    const añosOrdenados = Object.keys(totalesPorAño).sort((a, b) => b - a);

    // Generar HTML
    let html = `
        <div style="position: absolute; top: -30px; right: -30px; font-size: 120px; opacity: 0.05; transform: rotate(-15deg);">
            📊
        </div>
        <h3 style="color: #ffa502; margin-bottom: 20px; font-size: 1.3em;">
            💰 Facturación por Año Fiscal
        </h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;">
    `;

    añosOrdenados.forEach(año => {
        const datos = totalesPorAño[año];
        const esAñoActual = año == new Date().getFullYear();

        html += `
            <div style="
                background: ${esAñoActual ? 'rgba(255, 165, 2, 0.1)' : 'rgba(50, 50, 50, 0.5)'};
                border: 1px solid ${esAñoActual ? 'rgba(255, 165, 2, 0.5)' : 'rgba(255, 255, 255, 0.1)'};
                padding: 20px;
                border-radius: 15px;
                text-align: center;
                transition: all 0.3s ease;
                cursor: default;
                position: relative;
            " 
            onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 5px 15px rgba(0,0,0,0.3)'"
            onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'">
                ${esAñoActual ? '<div style="position: absolute; top: 5px; right: 10px; background: #ffa502; color: white; padding: 2px 8px; border-radius: 10px; font-size: 0.7em;">ACTUAL</div>' : ''}
                <h4 style="color: ${esAñoActual ? '#ffa502' : '#fff'}; font-size: 1.4em; margin-bottom: 10px;">
                    ${año}
                </h4>
                <div style="font-size: 2em; font-weight: bold; color: ${esAñoActual ? '#ffa502' : '#22c55e'}; margin-bottom: 5px;">
                    €${datos.total.toFixed(2)}
                </div>
                <div style="color: #888; font-size: 0.9em;">
                    ${datos.ventas.toLocaleString()} ventas
                </div>
            </div>
        `;
    });

    html += `</div>`;

    // Agregar nota según licencia
    const licencia = obtenerEstadoLicencia();
    if (licencia.tipo === 'standard' && !licencia.pagada) {
        html += `
            <div style="margin-top: 20px; padding: 15px; background: rgba(255, 165, 2, 0.1); border: 1px solid rgba(255, 165, 2, 0.3); border-radius: 10px; text-align: center;">
                <p style="color: #ffa502; margin: 0;">
                    📌 <strong>Nota:</strong> Los totales incluyen todo tu histórico. 
                    Con la versión gratuita solo puedes ver el detalle de los últimos 6 meses.
                </p>
            </div>
        `;
    }

    contenedorAños.innerHTML = html;
}
// Función para mostrar facturación standard
async function mostrarFacturacionStandard() {
    // Asegurar que facturacion esté cargada
    if (!facturacion || facturacion.length === 0) {
        facturacion = await DB.obtenerFacturacion();
    }

    const contenedor = document.querySelector('#facturacion');

    // Calcular totales básicos
    const hoy = new Date();
    const inicioSemana = new Date(hoy);
    inicioSemana.setDate(hoy.getDate() - hoy.getDay() + 1);
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    let totalHoy = 0;
    let totalSemana = 0;
    let totalMes = 0;

    facturacion.forEach(venta => {
        const fechaVenta = new Date(venta.fecha);
        if (fechaVenta.toDateString() === hoy.toDateString()) {
            totalHoy += venta.total;
        }
        if (fechaVenta >= inicioSemana) {
            totalSemana += venta.total;
        }
        if (fechaVenta >= inicioMes) {
            totalMes += venta.total;
        }
    });

    // Actualizar solo los totales básicos
    document.getElementById('facturacionHoy').textContent = `€${totalHoy.toFixed(2)}`;
    document.getElementById('facturacionSemana').textContent = `€${totalSemana.toFixed(2)}`;
    document.getElementById('facturacionMes').textContent = `€${totalMes.toFixed(2)}`;

    // NUEVO: Mostrar datos archivados si existen
    const datosArchivados = localStorage.getItem('datosArchivados');
    if (datosArchivados) {
        const { ventasOcultas, totalOculto } = JSON.parse(datosArchivados);

        if (ventasOcultas > 0) {
            // Crear mensaje persuasivo
            let mensajeArchivado = document.getElementById('mensajeArchivado');
            if (!mensajeArchivado) {
                mensajeArchivado = document.createElement('div');
                mensajeArchivado.id = 'mensajeArchivado';
                mensajeArchivado.style.cssText = `
                    background: linear-gradient(135deg, rgba(255, 165, 2, 0.1), rgba(255, 215, 0, 0.1));
                    border: 1px solid rgba(255, 165, 2, 0.3);
                    padding: 20px;
                    border-radius: 15px;
                    margin: 20px 0;
                    text-align: center;
                    position: relative;
                    overflow: hidden;
                `;

                mensajeArchivado.innerHTML = `
                    <div style="position: absolute; top: -50px; right: -50px; font-size: 100px; opacity: 0.1; transform: rotate(-15deg);">
                        🔒
                    </div>
                    <h3 style="color: #ffa502; margin-bottom: 15px;">
                        💎 Tu histórico completo está seguro
                    </h3>
                    <p style="color: #e0e0e0; margin-bottom: 15px;">
                        Tienes <strong>${ventasOcultas} ventas</strong> anteriores a los 6 meses visibles.
                        Todos tus totales anuales incluyen el histórico completo.
                    </p>
                    <div style="margin: 20px 0; padding: 15px; background: rgba(40, 40, 40, 0.5); border-radius: 10px;">
                        <p style="color: #22c55e; font-size: 1.1em; margin: 0;">
                            ✅ Tus totales por año son REALES y COMPLETOS
                        </p>
                        <p style="color: #888; font-size: 0.9em; margin: 5px 0 0 0;">
                            Solo el detalle diario está limitado a 6 meses
                        </p>
                    </div>
                    <button class="btn-warning" onclick="mostrarModalPremium()" 
                            style="padding: 12px 30px; font-size: 16px; font-weight: bold;">
                        🔓 Desbloquear Detalle Completo
                    </button>
                    <p style="color: #888; margin-top: 10px; font-size: 0.9em;">
                        Solo 69€/mes - Accede a todo el historial detallado
                    </p>
                `;

                const statsGrid = document.querySelector('#facturacion .stats-grid');
                if (statsGrid) {
                    statsGrid.parentNode.insertBefore(mensajeArchivado, statsGrid);
                }
            }
        }
    }

    // Mostrar el banner apropiado según la licencia
    const licencia = obtenerEstadoLicencia();

    if (licencia.tipo === 'standard' && !licencia.pagada) {
        // Usuario gratuito - mostrar upgrade a Standard pagado
        mostrarBannerUpgradeStandard();
    } else if (licencia.tipo === 'standard' && licencia.pagada) {
        // Usuario con Standard pagado - mostrar upgrade a Pro
        mostrarBannerUpgradePro();
    }
}
// Banner para usuarios gratuitos -> Standard 49€
function mostrarBannerUpgradeStandard() {
    let bannerContainer = document.getElementById('bannerUpgrade');

    if (!bannerContainer) {
        bannerContainer = document.createElement('div');
        bannerContainer.id = 'bannerUpgrade';
        bannerContainer.style.cssText = `
            background: linear-gradient(135deg, rgba(74, 85, 104, 0.1), rgba(74, 85, 104, 0.2));
            border: 2px solid rgba(74, 85, 104, 0.5);
            padding: 30px;
            border-radius: 20px;
            margin: 30px 0;
            text-align: center;
        `;

        bannerContainer.innerHTML = `
            <h3 style="color: #e0e0e0; margin-bottom: 20px;">📊 Desbloquea Facturación Completa</h3>
            <p style="color: #e0e0e0; margin-bottom: 20px;">
                Obtén acceso a reportes detallados, exportación de datos y soporte técnico.
            </p>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0;">
                <div style="background: rgba(40, 40, 40, 0.5); padding: 15px; border-radius: 10px;">
                    <h4 style="color: #e0e0e0;">📊 Reportes Completos</h4>
                    <p style="color: #888; font-size: 0.9em;">Accede a todos tus datos históricos</p>
                </div>
                <div style="background: rgba(40, 40, 40, 0.5); padding: 15px; border-radius: 10px;">
                    <h4 style="color: #e0e0e0;">💾 Exportación</h4>
                    <p style="color: #888; font-size: 0.9em;">Descarga tus datos cuando quieras</p>
                </div>
                <div style="background: rgba(40, 40, 40, 0.5); padding: 15px; border-radius: 10px;">
                    <h4 style="color: #e0e0e0;">🛟 Soporte</h4>
                    <p style="color: #888; font-size: 0.9em;">Ayuda técnica cuando la necesites</p>
                </div>
            </div>
            <div style="margin-top: 30px;">
                <button class="btn-primary" onclick="mostrarModalPremium()" style="padding: 15px 40px; font-size: 18px;">
                    🔓 Ver Planes de Pago
                </button>
                <p style="color: #888; margin-top: 10px; font-size: 0.9em;">
                    Desde solo 49€/mes
                </p>
            </div>
        `;

        const statsGrid = document.querySelector('#facturacion .stats-grid');
        if (statsGrid) {
            statsGrid.parentNode.insertBefore(bannerContainer, statsGrid.nextSibling);
        }
    }
}

// Banner para usuarios Standard 49€ -> Pro 69€
function mostrarBannerUpgradePro() {
    let bannerContainer = document.getElementById('bannerUpgrade');

    if (!bannerContainer) {
        bannerContainer = document.createElement('div');
        bannerContainer.id = 'bannerUpgrade';
        bannerContainer.style.cssText = `
            background: linear-gradient(135deg, rgba(255, 107, 107, 0.1), rgba(255, 165, 2, 0.1));
            border: 2px solid rgba(255, 165, 2, 0.5);
            padding: 30px;
            border-radius: 20px;
            margin: 30px 0;
            text-align: center;
            position: relative;
            overflow: hidden;
        `;

        // Badge "RECOMENDADO"
        bannerContainer.innerHTML = `
            <div style="position: absolute; top: 20px; right: 20px; background: #ffa502; color: white; padding: 5px 15px; border-radius: 20px; font-weight: bold; font-size: 0.9em;">
                🔥 RECOMENDADO
            </div>
            <h3 style="color: #ffa502; margin-bottom: 20px; font-size: 1.8em;">⭐ Desbloquea Análisis Avanzado PRO</h3>
            <p style="color: #e0e0e0; margin-bottom: 25px; font-size: 1.1em;">
                Lleva tu negocio al siguiente nivel con herramientas profesionales de análisis
            </p>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 25px 0;">
                <div style="background: rgba(40, 40, 40, 0.8); padding: 20px; border-radius: 15px; border: 1px solid rgba(255, 165, 2, 0.3);">
                    <h4 style="color: #ffa502; font-size: 1.2em;">📊 Gráficos Interactivos</h4>
                    <p style="color: #e0e0e0; font-size: 0.95em; margin-top: 10px;">Visualiza tus ventas con gráficos dinámicos y personalizables</p>
                </div>
                <div style="background: rgba(40, 40, 40, 0.8); padding: 20px; border-radius: 15px; border: 1px solid rgba(255, 165, 2, 0.3);">
                    <h4 style="color: #ffa502; font-size: 1.2em;">🔍 Filtros Avanzados</h4>
                    <p style="color: #e0e0e0; font-size: 0.95em; margin-top: 10px;">Analiza por producto individual, categoría y período personalizado</p>
                </div>
                <div style="background: rgba(40, 40, 40, 0.8); padding: 20px; border-radius: 15px; border: 1px solid rgba(255, 165, 2, 0.3);">
                    <h4 style="color: #ffa502; font-size: 1.2em;">📈 Predicción de Tendencias</h4>
                    <p style="color: #e0e0e0; font-size: 0.95em; margin-top: 10px;">Identifica productos estrella y patrones de venta</p>
                </div>
            </div>
            
            <div style="background: rgba(255, 165, 2, 0.1); padding: 20px; border-radius: 15px; margin: 20px 0;">
                <p style="color: #ffa502; font-size: 1.3em; font-weight: bold; margin: 0;">
                                       🎯 Oferta Especial: Solo 20€ más al mes
                </p>
                <p style="color: #e0e0e0; margin: 5px 0 0 0;">
                    Actualiza de Standard (49€) a Pro (69€)
                </p>
            </div>
            
            <div style="margin-top: 30px;">
                <button class="btn-warning" onclick="mostrarModalPremium()" style="padding: 15px 40px; font-size: 18px; font-weight: bold; animation: pulse 2s infinite;">
                    🚀 Actualizar a PRO ahora
                </button>
                <p style="color: #888; margin-top: 10px; font-size: 0.9em;">
                    Cancela cuando quieras • Sin compromisos
                </p>
            </div>
        `;

        const statsGrid = document.querySelector('#facturacion .stats-grid');
        if (statsGrid) {
            statsGrid.parentNode.insertBefore(bannerContainer, statsGrid.nextSibling);
        }
    }
}

// Función para mostrar botón de upgrade
function mostrarBotonUpgrade() {
    // Buscar si ya existe el contenedor de upgrade
    let upgradeContainer = document.getElementById('upgradeContainer');

    if (!upgradeContainer) {
        upgradeContainer = document.createElement('div');
        upgradeContainer.id = 'upgradeContainer';
        upgradeContainer.style.cssText = `
            background: linear-gradient(135deg, rgba(255, 107, 107, 0.1), rgba(255, 165, 2, 0.1));
            border: 2px solid rgba(255, 165, 2, 0.5);
            padding: 30px;
            border-radius: 20px;
            margin: 30px 0;
            text-align: center;
        `;

        upgradeContainer.innerHTML = `
            <h3 style="color: #ffa502; margin-bottom: 20px;">🌟 Desbloquea Análisis Avanzado</h3>
            <p style="color: #e0e0e0; margin-bottom: 20px;">
                Obtén acceso a gráficos detallados, filtros por producto, análisis de tendencias y mucho más.
            </p>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0;">
                <div style="background: rgba(40, 40, 40, 0.5); padding: 15px; border-radius: 10px;">
                    <h4 style="color: #ffa502;">📊 Gráficos Interactivos</h4>
                    <p style="color: #888; font-size: 0.9em;">Visualiza tus ventas con gráficos dinámicos</p>
                </div>
                                <div style="background: rgba(40, 40, 40, 0.5); padding: 15px; border-radius: 10px;">
                    <h4 style="color: #ffa502;">🔍 Filtros Avanzados</h4>
                    <p style="color: #888; font-size: 0.9em;">Analiza por producto, categoría y período</p>
                </div>
                <div style="background: rgba(40, 40, 40, 0.5); padding: 15px; border-radius: 10px;">
                    <h4 style="color: #ffa502;">📈 Tendencias</h4>
                    <p style="color: #888; font-size: 0.9em;">Identifica productos estrella y patrones</p>
                </div>
            </div>
            <div style="margin-top: 30px;">
                <button class="btn-warning" onclick="mostrarModalPremium()" style="padding: 15px 40px; font-size: 18px; font-weight: bold;">
                    ⭐ Probar Premium Gratis (30 días)
                </button>
                <p style="color: #888; margin-top: 10px; font-size: 0.9em;">
                    Después ${LICENCIA_CONFIG.PRECIO_PREMIUM}
                </p>
            </div>
        `;

        // Insertar después de los stats-grid
        const statsGrid = document.querySelector('#facturacion .stats-grid');
        if (statsGrid) {
            statsGrid.parentNode.insertBefore(upgradeContainer, statsGrid.nextSibling);
        }
    }
}

// Función para mostrar aviso de trial
function mostrarAvisoTrial() {
    const diasRestantes = licenciaActual.diasRestantes;

    let trialBanner = document.getElementById('trialBanner');
    if (!trialBanner) {
        trialBanner = document.createElement('div');
        trialBanner.id = 'trialBanner';
        trialBanner.style.cssText = `
            background: linear-gradient(135deg, #22c55e, #10b981);
            color: white;
            padding: 15px;
            border-radius: 10px;
            margin-bottom: 20px;
            text-align: center;
            font-weight: bold;
        `;

        const facturacionDiv = document.getElementById('facturacion');
        facturacionDiv.insertBefore(trialBanner, facturacionDiv.firstChild.nextSibling);
    }

    trialBanner.innerHTML = `
        🎉 Versión Premium de Prueba - ${diasRestantes} días restantes
        <button onclick="mostrarModalPremium()" style="background: white; color: #22c55e; border: none; padding: 5px 15px; border-radius: 5px; margin-left: 20px; cursor: pointer; font-weight: bold;">
            Activar Licencia Completa
        </button>
    `;
}

function getNumeroSemana(fecha) {
    const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}
// Función para obtener el trimestre actual
function getTrimestreActual() {
    const mes = new Date().getMonth(); // 0-11
    const trimestre = Math.floor(mes / 3) + 1; // 1-4

    const inicioTrimestre = new Date();
    inicioTrimestre.setMonth((trimestre - 1) * 3); // Mes inicio (0, 3, 6, 9)
    inicioTrimestre.setDate(1);
    inicioTrimestre.setHours(0, 0, 0, 0);

    return {
        numero: trimestre,
        inicio: inicioTrimestre,
        nombre: `Q${trimestre}`
    };
}

// Funciones de almacenamiento
function guardarDatos() {
    const datos = {
        mesas: mesas,
        // NO guardamos facturacion aquí - solo está en IndexedDB
        // facturacion: [], // Vacío para compatibilidad
        mesasConfig: mesasConfig,
        ultimaActualizacion: new Date().toISOString()
    };
    localStorage.setItem('barCafeteriaDatos', JSON.stringify(datos));
    if (document.getElementById('ultimaActualizacion')) {
        document.getElementById('ultimaActualizacion').textContent = new Date().toLocaleString('es-ES');
    }
}

async function cargarDatos() {
    // Primero intentar cargar datos básicos de localStorage
    const datosGuardados = localStorage.getItem('barCafeteriaDatos');
    if (datosGuardados) {
        const datos = JSON.parse(datosGuardados);
        mesas = datos.mesas || {};
        mesasConfig = datos.mesasConfig || [];

        if (datos.ultimaActualizacion && document.getElementById('ultimaActualizacion')) {
            document.getElementById('ultimaActualizacion').textContent =
                new Date(datos.ultimaActualizacion).toLocaleString('es-ES');
        }
    }


    // SIEMPRE verificar que mesasConfig tenga datos
    if (!mesasConfig || mesasConfig.length === 0) {
        console.log('🔧 Creando configuración inicial de mesas...');

        // Crear mesas por defecto
        mesasConfig = [
            { id: 1, nombre: 'Mesa 1', capacidad: 4, descripcion: '', activa: true },
            { id: 2, nombre: 'Mesa 2', capacidad: 4, descripcion: '', activa: true },
            { id: 3, nombre: 'Mesa 3', capacidad: 4, descripcion: '', activa: true },
            { id: 4, nombre: 'Mesa 4', capacidad: 6, descripcion: '', activa: true },
            { id: 5, nombre: 'Mesa 5', capacidad: 2, descripcion: '', activa: true },
            { id: 6, nombre: 'Barra 1', capacidad: 1, descripcion: 'Asiento en barra', activa: true },
            { id: 7, nombre: 'Barra 2', capacidad: 1, descripcion: 'Asiento en barra', activa: true },
            { id: 8, nombre: 'Barra 3', capacidad: 1, descripcion: 'Asiento en barra', activa: true },
            { id: 9, nombre: 'Terraza 1', capacidad: 4, descripcion: 'Mesa exterior', activa: true },
            { id: 10, nombre: 'Terraza 2', capacidad: 4, descripcion: 'Mesa exterior', activa: true }
        ];

        // Guardar configuración inicial
        localStorage.setItem('mesasConfiguracion', JSON.stringify(mesasConfig));
    }

    // Inicializar el objeto mesas para todas las mesas configuradas
    mesasConfig.forEach(mesa => {
        if (!mesas[mesa.id]) {
            mesas[mesa.id] = [];
        }
    });
    // IMPORTANTE: Limpiar array en memoria antes de cargar
    facturacion = [];
    // Cargar facturación desde IndexedDB
    try {
        facturacion = await DB.obtenerFacturacion();
        console.log(`📊 Cargadas ${facturacion.length} ventas desde la base de datos`);
    } catch (error) {
        console.error('Error al cargar facturación:', error);
        facturacion = [];
    }
}

async function exportarDatos() {
    try {
        // Obtener TODOS los datos, incluyendo los de IndexedDB
        const datosDB = await DB.exportarDatos();

        const datos = {
            // Datos de configuración
            productos: productos,
            mesasConfig: mesasConfig,
            categorias: categorias,

            // Estado actual
            mesas: mesas,

            // Datos de IndexedDB
            facturacion: datosDB.facturacion || facturacion,
            movimientos: datosDB.movimientos || historialMovimientos,
            estadisticas: datosDB.estadisticas || [],

            // Metadatos
            fechaExportacion: new Date().toISOString(),
            version: '2.0',

            // Configuraciones
            tecladoVirtual: localStorage.getItem('tecladoVirtualActivado') === 'true'
        };

        const dataStr = JSON.stringify(datos, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

        const exportFileDefaultName = `bar_cafeteria_backup_${new Date().toISOString().split('T')[0]}.json`;

        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();

        mostrarNotificacion('📥 Datos exportados correctamente');
    } catch (error) {
        console.error('Error al exportar datos:', error);
        mostrarNotificacion('❌ Error al exportar datos');
    }
}
// NUEVA FUNCIÓN: Crear backup de seguridad antes de importar
async function crearBackupSeguridad() {
    try {
        mostrarNotificacion('🔄 Creando backup de seguridad...');

        const backupDatos = {
            fecha: new Date().toISOString(),
            facturacion: await DB.obtenerFacturacion(),
            movimientos: await DB.obtenerMovimientos(null, 99999),
            productos: productos,
            mesasConfig: mesasConfig,
            categorias: categorias,
            areas: areas
        };

        // Guardar en localStorage temporal
        localStorage.setItem('backupEmergencia', JSON.stringify(backupDatos));

        return true;
    } catch (error) {
        console.error('Error al crear backup:', error);
        return false;
    }
}

// Restaurar desde backup de emergencia
async function restaurarBackupEmergencia() {
    const backupStr = localStorage.getItem('backupEmergencia');
    if (!backupStr) {
        alert('No hay backup de emergencia disponible');
        return false;
    }

    try {
        const backup = JSON.parse(backupStr);
        mostrarNotificacion('🔄 Restaurando backup de emergencia...');

        // Restaurar cada tipo de datos
        for (const venta of backup.facturacion) {
            await DB.guardarFacturacion(venta);
        }

        for (const movimiento of backup.movimientos) {
            await DB.guardarMovimiento(movimiento);
        }

        // Restaurar configuraciones
        productos = backup.productos;
        mesasConfig = backup.mesasConfig;
        categorias = backup.categorias;
        areas = backup.areas;

        // Guardar en localStorage
        localStorage.setItem('productosPersonalizados', JSON.stringify(productos));
        localStorage.setItem('mesasConfiguracion', JSON.stringify(mesasConfig));
        localStorage.setItem('categoriasPersonalizadas', JSON.stringify(categorias));
        localStorage.setItem('areasPersonalizadas', JSON.stringify(areas));

        mostrarNotificacion('✅ Backup restaurado correctamente');
        return true;
    } catch (error) {
        console.error('Error al restaurar backup:', error);
        alert('Error crítico al restaurar backup. Contacta soporte.');
        return false;
    }
}

async function importarDatos(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const datos = JSON.parse(e.target.result);

            // Detectar versión del backup
            const esVersionAntigua = !datos.version;

            if (confirm(`¿Estás seguro de importar estos datos${esVersionAntigua ? ' (versión antigua)' : ''}? Se sobrescribirán los datos actuales.`)) {

                // NUEVO: Crear backup de emergencia ANTES de hacer cualquier cambio
                const backupCreado = await crearBackupSeguridad();
                if (!backupCreado) {
                    if (!confirm('⚠️ No se pudo crear backup de seguridad. ¿Continuar de todos modos?')) {
                        return;
                    }
                }

                // Mensaje de progreso
                mostrarNotificacion('⏳ Importando datos...');

                // Importar datos básicos
                mesas = datos.mesas || {};

                // Importar configuración de mesas (compatible con versión antigua)
                if (datos.mesasConfig) {
                    mesasConfig = datos.mesasConfig;
                } else {
                    // Si no hay mesasConfig, mantener la actual
                    console.log('📌 Manteniendo configuración de mesas actual');
                }

                // Importar productos si existen
                if (datos.productos) {
                    productos = datos.productos;
                    localStorage.setItem('productosPersonalizados', JSON.stringify(productos));
                } else {
                    console.log('📌 No hay productos en el backup, manteniendo actuales');
                }

                // Importar categorías si existen
                if (datos.categorias) {
                    categorias = datos.categorias;
                    localStorage.setItem('categoriasPersonalizadas', JSON.stringify(categorias));
                } else {
                    console.log('📌 No hay categorías en el backup, manteniendo actuales');
                }

                // Importar configuración de teclado si existe
                if (datos.tecladoVirtual !== undefined) {
                    localStorage.setItem('tecladoVirtualActivado', datos.tecladoVirtual);
                }

                // NUEVO: Primero intentar importar a una tabla temporal
                mostrarNotificacion('📥 Validando datos a importar...');

                // Validar que los datos sean correctos
                let datosValidos = true;
                let ventasAImportar = [];

                if (datos.facturacion && datos.facturacion.length > 0) {
                    // Validar cada venta antes de importar
                    for (const venta of datos.facturacion) {
                        if (venta.total !== undefined && venta.fecha && venta.mesa !== undefined) {
                            ventasAImportar.push(venta);
                        } else {
                            console.warn('Venta inválida ignorada:', venta);
                        }
                    }

                    if (ventasAImportar.length === 0) {
                        throw new Error('No hay ventas válidas para importar');
                    }

                    mostrarNotificacion(`✅ ${ventasAImportar.length} ventas válidas encontradas`);
                }

                // AHORA SÍ: Limpiar datos antiguos SOLO si hay datos válidos
                if (ventasAImportar.length > 0) {
                    mostrarNotificacion('🔄 Reemplazando datos anteriores...');

                    try {
                        await new Promise((resolve, reject) => {
                            const transaction = DB.db.transaction(['facturacion'], 'readwrite');
                            const store = transaction.objectStore('facturacion');
                            const request = store.clear();

                            request.onsuccess = () => resolve();
                            request.onerror = () => reject(request.error);
                        });

                        // Limpiar array local también
                        facturacion = [];

                    } catch (error) {
                        console.error('Error al limpiar datos:', error);
                        // Si falla el borrado, restaurar backup
                        await restaurarBackupEmergencia();
                        throw new Error('Error al preparar la importación. Backup restaurado.');
                    }
                }

                // Importar las ventas validadas
                let ventasImportadas = 0;
                let erroresImportacion = 0;

                for (const venta of ventasAImportar) {
                    try {
                        await DB.guardarFacturacion(venta);
                        ventasImportadas++;
                    } catch (error) {
                        console.error('Error al importar venta:', error);
                        erroresImportacion++;
                    }
                }

                // Verificar resultado
                if (ventasImportadas === 0 && ventasAImportar.length > 0) {
                    // Si no se importó nada, restaurar backup
                    await restaurarBackupEmergencia();
                    throw new Error('No se pudo importar ninguna venta. Backup restaurado.');
                }

                console.log(`✅ ${ventasImportadas} de ${ventasAImportar.length} ventas importadas`);

                if (erroresImportacion > 0) {
                    mostrarNotificacion(`⚠️ ${erroresImportacion} ventas no se pudieron importar`);
                }

                // Si hay movimientos, importarlos
                if (datos.movimientos && datos.movimientos.length > 0) {
                    console.log(`📦 Importando ${datos.movimientos.length} movimientos...`);

                    // Limpiar movimientos anteriores también
                    try {
                        await new Promise((resolve, reject) => {
                            const transaction = DB.db.transaction(['movimientos'], 'readwrite');
                            const store = transaction.objectStore('movimientos');
                            const request = store.clear();

                            request.onsuccess = () => resolve();
                            request.onerror = () => reject(request.error);
                        });
                    } catch (error) {
                        console.error('Error al limpiar movimientos:', error);
                    }

                    // Importar nuevos movimientos
                    for (const movimiento of datos.movimientos) {
                        try {
                            await DB.guardarMovimiento(movimiento);
                        } catch (error) {
                            console.error('Error al guardar movimiento:', error);
                        }
                    }
                }

                // Guardar configuración de mesas
                if (mesasConfig && mesasConfig.length > 0) {
                    localStorage.setItem('mesasConfiguracion', JSON.stringify(mesasConfig));
                }

                // Guardar datos básicos
                guardarDatos();

                // Actualizar todas las interfaces
                renderizarMesas();
                await actualizarFacturacion(); // Hacer async
                renderizarListaProductos();
                renderizarListaMesas();
                renderizarListaCategorias();
                actualizarSelectoresCategorias();
                renderizarListaAreas();
                actualizarSelectoresAreas();

                // Mensaje de éxito con detalles
                let mensaje = '✅ Datos importados correctamente';
                if (esVersionAntigua) {
                    mensaje += '\n⚠️ Backup de versión antigua - algunos datos podrían faltar';
                }

                // NUEVO: Limpiar backup de emergencia si todo salió bien
                localStorage.removeItem('backupEmergencia');
                console.log('✅ Backup de emergencia eliminado (ya no es necesario)');

                mostrarNotificacion(mensaje);

                // MODIFICADO: Para TPV no recargar página, solo actualizar interfaces
                setTimeout(() => {
                    // Actualizar todo sin recargar
                    actualizarTabInventario();
                    if (document.getElementById('pedidos').classList.contains('active')) {
                        actualizarTabPedidos();
                    }

                    // Mostrar mensaje de éxito más largo
                    mostrarNotificacion('✅ Importación completada. Sistema actualizado.');
                }, 1000);
            }
        } catch (error) {
            console.error('Error durante importación:', error);

            // Intentar restaurar backup si existe
            const backupDisponible = localStorage.getItem('backupEmergencia');
            if (backupDisponible) {
                if (confirm(`❌ Error al importar: ${error.message}\n\n¿Deseas restaurar el backup de seguridad?`)) {
                    const restaurado = await restaurarBackupEmergencia();
                    if (restaurado) {
                        // Para TPV, actualizar interfaces sin recargar
                        renderizarMesas();
                        await actualizarFacturacion();
                        renderizarListaProductos();
                        renderizarListaMesas();
                        mostrarNotificacion('✅ Backup restaurado. Sistema operativo.');
                    }
                }
            } else {
                alert(`❌ Error al importar los datos:\n${error.message}\n\nNo hay backup disponible para restaurar.`);
            }
        }
    };

    reader.onerror = function () {
        alert('Error al leer el archivo');
    };

    reader.readAsText(file);
}

async function limpiarTodo() {
    // Confirmar con más detalle
    const confirmacion1 = confirm('⚠️ ADVERTENCIA: Esta acción borrará TODOS los datos:\n\n' +
        '• Todas las ventas y facturación\n' +
        '• TODOS los productos (volverán los 10 de fábrica)\n' +
        '• TODAS las categorías personalizadas\n' +
        '• Configuración de mesas\n' +
        '• Historial de inventario\n' +
        '• TODO volverá a los valores de fábrica\n\n' +
        '¿Estás seguro?');

    if (!confirmacion1) return;

    // Segunda confirmación para estar seguros
    const confirmacion2 = confirm('🚨 ÚLTIMA CONFIRMACIÓN:\n\n' +
        'Esta acción NO se puede deshacer.\n' +
        'Se recomienda exportar un backup antes.\n\n' +
        '¿Realmente quieres restablecer TODO a valores de fábrica?');

    if (!confirmacion2) return;

    mostrarNotificacion('🔄 Restableciendo valores de fábrica...');

    try {
        // 1. Limpiar toda la base de datos IndexedDB
        console.log('🗑️ Limpiando base de datos...');

        // Limpiar facturación
        await new Promise((resolve) => {
            const transaction = DB.db.transaction(['facturacion'], 'readwrite');
            const store = transaction.objectStore('facturacion');
            store.clear();
            transaction.oncomplete = resolve;
        });

        // Limpiar movimientos
        await new Promise((resolve) => {
            const transaction = DB.db.transaction(['movimientos'], 'readwrite');
            const store = transaction.objectStore('movimientos');
            store.clear();
            transaction.oncomplete = resolve;
        });

        // Limpiar estadísticas
        await new Promise((resolve) => {
            const transaction = DB.db.transaction(['estadisticas'], 'readwrite');
            const store = transaction.objectStore('estadisticas');
            store.clear();
            transaction.oncomplete = resolve;
        });

        // Limpiar imágenes
        await new Promise((resolve) => {
            const transaction = DB.db.transaction(['imagenes'], 'readwrite');
            const store = transaction.objectStore('imagenes');
            store.clear();
            transaction.oncomplete = resolve;
        });

        // 2. Limpiar todo localStorage excepto licencia
        const licenciaBackup = localStorage.getItem('lic_data');
        const keysToRemove = [
            'barCafeteriaDatos',
            'productosPersonalizados',
            'mesasConfiguracion',
            'categoriasPersonalizadas',
            'historialMovimientos',
            'tecladoVirtualActivado',
            'datosMigradosIndexedDB'
        ];

        keysToRemove.forEach(key => localStorage.removeItem(key));

        // Restaurar licencia si existía
        if (licenciaBackup) {
            localStorage.setItem('lic_data', licenciaBackup);
        }

        // 2.5 FORZAR limpieza completa de productos y categorías
        console.log('🗑️ Limpiando productos personalizados...');

        // Eliminar del localStorage
        localStorage.removeItem('productosPersonalizados');
        localStorage.removeItem('categoriasPersonalizadas');

        // Limpiar cualquier rastro en localStorage
        const keysToDelete = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.includes('producto') || key.includes('categoria') || key.includes('Product') || key.includes('Categor'))) {
                if (key !== 'lic_data') {
                    keysToDelete.push(key);
                }
            }
        }
        keysToDelete.forEach(key => localStorage.removeItem(key));

        // IMPORTANTE: Vaciar los arrays en memoria
        productos = [];
        categorias = [];

        // Forzar que no quede nada en caché
        window.productos = [];
        window.categorias = [];

        // 3. Restablecer valores de fábrica
        // IMPORTANTE: Crear arrays completamente nuevos
        window.productos = [
            { id: 1, nombre: "Café", precio: 1.20, emoji: "☕", stock: 100, stockMinimo: 20, categoria: "barra" },
            { id: 2, nombre: "Tostada", precio: 1.50, emoji: "🍞", stock: 50, stockMinimo: 10, categoria: "cocina" },
            { id: 3, nombre: "Coca-Cola", precio: 2.00, emoji: "🥤", stock: 50, stockMinimo: 15, categoria: "barra" },
            { id: 4, nombre: "Cerveza", precio: 2.50, emoji: "🍺", stock: 50, stockMinimo: 15, categoria: "barra" }
        ];

        productos = window.productos;

        window.areas = [
            { id: 'barra', nombre: 'Barra', activa: true },
            { id: 'cocina', nombre: 'Cocina', activa: true },
            { id: 'terraza', nombre: 'Terraza', activa: true }
        ];

        window.categorias = [
            { id: 'bebidas', nombre: 'Bebidas', activa: true },
            { id: 'comida', nombre: 'Comida', activa: true },
            { id: 'alcohol', nombre: 'Alcohol', activa: true }
        ];

        areas = window.areas;
        categorias = window.categorias;

        mesasConfig = [
            { id: 1, nombre: 'Mesa 1', capacidad: 4, descripcion: '', activa: true },
            { id: 2, nombre: 'Mesa 2', capacidad: 4, descripcion: '', activa: true },
            { id: 3, nombre: 'Mesa 3', capacidad: 4, descripcion: '', activa: true },
            { id: 4, nombre: 'Mesa 4', capacidad: 6, descripcion: '', activa: true },
            { id: 5, nombre: 'Mesa 5', capacidad: 2, descripcion: '', activa: true },
            { id: 6, nombre: 'Barra 1', capacidad: 1, descripcion: 'Asiento en barra', activa: true },
            { id: 7, nombre: 'Barra 2', capacidad: 1, descripcion: 'Asiento en barra', activa: true },
            { id: 8, nombre: 'Barra 3', capacidad: 1, descripcion: 'Asiento en barra', activa: true },
            { id: 9, nombre: 'Terraza 1', capacidad: 4, descripcion: 'Mesa exterior', activa: true },
            { id: 10, nombre: 'Terraza 2', capacidad: 4, descripcion: 'Mesa exterior', activa: true }
        ];

        // Reinicializar mesas vacías
        mesas = {};
        mesasConfig.forEach(mesa => {
            mesas[mesa.id] = [];
        });

        // Reinicializar arrays
        facturacion = [];
        historialMovimientos = [];

        // 4. Guardar configuración por defecto

        localStorage.setItem('productosPersonalizados', JSON.stringify(productos));
        localStorage.setItem('areasPersonalizadas', JSON.stringify(areas));
        localStorage.setItem('categoriasPersonalizadas', JSON.stringify(categorias));
        localStorage.setItem('mesasConfiguracion', JSON.stringify(mesasConfig));

        // 5. Actualizar todas las interfaces
        renderizarMesas();
        await actualizarFacturacion();
        renderizarListaProductos();
        renderizarListaMesas();
        renderizarListaCategorias();
        actualizarSelectoresCategorias();
        renderizarListaAreas();
        actualizarSelectoresAreas();

        // Forzar guardado de valores de fábrica
        localStorage.setItem('productosPersonalizados', JSON.stringify(productos));
        localStorage.setItem('categoriasPersonalizadas', JSON.stringify(categorias));
        localStorage.setItem('mesasConfiguracion', JSON.stringify(mesasConfig));

        // Verificar que se guardó correctamente
        console.log('✅ Productos restablecidos:', productos.length);
        console.log('✅ Categorías restablecidas:', categorias.length);

        mostrarNotificacion('✅ Sistema restablecido a valores de fábrica');

        // Recargar página después de 2 segundos
        setTimeout(() => {
            location.reload();
        }, 2000);

    } catch (error) {
        console.error('Error al limpiar:', error);
        alert('Hubo un error al restablecer el sistema. Por favor, recarga la página.');
    }
}
// Variables para manejar imágenes
let tipoVisualSeleccionado = 'emoji';

// Función para cambiar entre emoji e imagen
function toggleSelectorVisual(tipo) {
    tipoVisualSeleccionado = tipo;

    // Actualizar botones
    document.getElementById('btnEmoji').style.background = tipo === 'emoji' ? '#4a5568' : '#2d3748';
    document.getElementById('btnImagen').style.background = tipo === 'imagen' ? '#4a5568' : '#2d3748';

    // Mostrar/ocultar selectores
    document.getElementById('selectorEmoji').style.display = tipo === 'emoji' ? 'block' : 'none';
    document.getElementById('selectorImagen').style.display = tipo === 'imagen' ? 'block' : 'none';
}

// Función para seleccionar emoji
function seleccionarEmoji(emoji) {
    document.getElementById('nuevoEmoji').value = emoji;

    // Efecto visual al seleccionar
    event.target.style.background = 'rgba(255, 107, 107, 0.2)';
    setTimeout(() => {
        event.target.style.background = 'rgba(255,255,255,0.05)';
    }, 200);
}

// Función para preview de imagen
function previewImagen(event) {
    const file = event.target.files[0];
    if (file) {
        // Verificar tamaño (máximo 500KB)
        if (file.size > 500000) {
            alert('La imagen es muy grande. Por favor selecciona una imagen menor a 500KB');
            event.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = function (e) {
            // Comprimir imagen
            const img = new Image();
            img.onload = function () {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Tamaño máximo 150x150
                const maxSize = 150;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxSize) {
                        height *= maxSize / width;
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width *= maxSize / height;
                        height = maxSize;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);

                const compressedImage = canvas.toDataURL('image/jpeg', 0.8);
                document.getElementById('previewImagen').src = compressedImage;
                document.getElementById('previewImagen').style.display = 'block';
                document.getElementById('nuevoImagen').value = compressedImage;
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

// Funciones para gestión de productos
async function agregarNuevoProducto() {
    const nombre = document.getElementById('nuevoNombre').value.trim();
    const precio = parseFloat(document.getElementById('nuevoPrecio').value);
    const stock = parseInt(document.getElementById('nuevoStock').value) || 0;
    const stockMinimo = parseInt(document.getElementById('nuevoStockMinimo').value) || 5;
    const area = document.getElementById('nuevaArea').value || '';  // ÁREA OPCIONAL
    const categoria = document.getElementById('nuevaCategoria').value;  // CATEGORÍA OBLIGATORIA

    let visual = {};
    if (tipoVisualSeleccionado === 'emoji') {
        visual.tipo = 'emoji';
        visual.valor = document.getElementById('nuevoEmoji').value.trim() || '🍽️';
    } else {
        const imagen = document.getElementById('nuevoImagen').value;
        if (!imagen) {
            alert('Por favor selecciona una imagen');
            return;
        }
        visual.tipo = 'imagen';
        visual.valor = imagen;
    }

    if (!nombre) {
        alert('Por favor ingresa un nombre para el producto');
        return;
    }

    if (isNaN(precio) || precio <= 0) {
        alert('Por favor ingresa un precio válido');
        return;
    }

    if (stock < 0) {
        alert('El stock no puede ser negativo');
        return;
    }

    if (stockMinimo < 0) {
        alert('El stock mínimo no puede ser negativo');
        return;
    }

    // Generar nuevo ID
    const nuevoId = productos.length > 0 ? Math.max(...productos.map(p => p.id)) + 1 : 1;

    // Validar que tenga categoría
    if (!categoria) {
        alert('Por favor selecciona una categoría para el producto');
        return;
    }

    // Crear producto base
    const nuevoProducto = {
        id: nuevoId,
        nombre: nombre,
        precio: precio,
        emoji: visual.tipo === 'emoji' ? visual.valor : '🍽️',
        stock: stock,
        stockMinimo: stockMinimo,
        area: area,          // AÑADIR ÁREA
        categoria: categoria
    };

    // Si es imagen, guardarla en IndexedDB
    if (visual.tipo === 'imagen') {
        try {
            await DB.guardarImagen(nuevoId, visual.valor);
            nuevoProducto.tieneImagen = true;
        } catch (error) {
            console.error('Error al guardar imagen:', error);
            alert('Error al guardar la imagen. Se usará emoji por defecto.');
            nuevoProducto.emoji = '🍽️';
        }
    }

    // Agregar producto
    productos.push(nuevoProducto);

    // Guardar en localStorage (sin la imagen base64)
    localStorage.setItem('productosPersonalizados', JSON.stringify(productos));

    // Limpiar campos
    document.getElementById('nuevoPrecio').value = '';
    document.getElementById('nuevoEmoji').value = '🍽️';
    document.getElementById('nuevoStock').value = '';
    document.getElementById('nuevoStockMinimo').value = '';
    document.getElementById('nuevoImagen').value = '';
    document.getElementById('previewImagen').style.display = 'none';
    document.getElementById('nuevoImagenFile').value = '';
    document.getElementById('nuevaArea').value = '';          // RESETEAR ÁREA
    document.getElementById('nuevaCategoria').value = '';      // RESETEAR CATEGORÍA

    // Resetear a emoji por defecto
    toggleSelectorVisual('emoji');

    // Actualizar lista
    renderizarListaProductos();

    mostrarNotificacion(`✅ Producto "${nombre}" agregado correctamente`);
}

function eliminarProducto(id) {
    if (confirm('¿Estás seguro de eliminar este producto?')) {
        productos = productos.filter(p => p.id !== id);
        localStorage.setItem('productosPersonalizados', JSON.stringify(productos));
        renderizarListaProductos();
        mostrarNotificacion('🗑️ Producto eliminado');
    }
}

function renderizarListaProductos() {
    const lista = document.getElementById('listaProductos');
    if (!lista) return;

    lista.innerHTML = '';

    if (productos.length === 0) {
        lista.innerHTML = '<p style="text-align: center; padding: 20px; color: #888;">No hay productos registrados</p>';
        return;
    }

    productos.forEach(producto => {
        const item = document.createElement('div');
        item.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 15px 20px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            transition: background 0.3s ease;
        `;

        const stockColor = producto.stock <= 0 ? '#ff6b6b' :
            producto.stock <= producto.stockMinimo ? '#ffa502' : '#22c55e';

        const stockIcon = producto.stock <= 0 ? '🔴' :
            producto.stock <= producto.stockMinimo ? '🟡' : '🟢';

        item.innerHTML = `
            <div style="flex: 1;">
                <span style="font-size: 1.2em; margin-right: 10px;">${producto.emoji}</span>
                <span style="font-weight: 600;">${producto.nombre}</span>
                <div style="font-size: 0.8em; margin-top: 5px;">
                    <span style="color: ${stockColor};">${stockIcon} Stock: ${producto.stock}</span>
                    <span style="color: #888; margin-left: 15px;">Mín: ${producto.stockMinimo}</span>
                </div>
                <div style="font-size: 0.75em; margin-top: 3px; color: #666;">
                    ${producto.area ? `📍 ${obtenerNombreArea(producto.area)}` : ''} 
                    ${producto.area && producto.categoria ? ' • ' : ''}
                    📂 ${obtenerNombreCategoria(producto.categoria)}
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 15px;">
                <span style="color: #ffa502; font-weight: 600;">€${producto.precio.toFixed(2)}</span>
                <button onclick="editarStockProducto(${producto.id})" style="background: #4a5568; color: white; border: none; padding: 8px 12px; border-radius: 8px; cursor: pointer; font-size: 12px; transition: all 0.3s ease;">📦 Stock</button>
                <button onclick="abrirModalEditarProducto(${producto.id})" style="background: #4a5568; color: white; border: none; padding: 8px 15px; border-radius: 8px; cursor: pointer; font-size: 14px; transition: all 0.3s ease;">✏️ Editar</button>
                <button onclick="eliminarProducto(${producto.id})" style="background: #ef4444; color: white; border: none; padding: 8px 15px; border-radius: 8px; cursor: pointer; font-size: 14px; transition: all 0.3s ease;">🗑️ Eliminar</button>
            </div>
        `;

        lista.appendChild(item);
    });
}



// ========================================
// FUNCIONES AUXILIARES PARA ÁREAS Y CATEGORÍAS
// ========================================

// Función para obtener el nombre de un área por su ID
function obtenerNombreArea(areaId) {
    const area = areas.find(a => a.id === areaId && a.activa);
    return area ? area.nombre : areaId;
}

// Función para obtener el nombre de una categoría por su ID
function obtenerNombreCategoria(categoriaId) {
    const categoria = categorias.find(c => c.id === categoriaId && c.activa);
    return categoria ? categoria.nombre : categoriaId;
}

// ========================================
// GESTIÓN DE CATEGORÍAS
// ===============================================================================

// Función para renderizar lista de categorías
function renderizarListaCategorias() {
    const lista = document.getElementById('listaCategorias');
    if (!lista) return;

    lista.innerHTML = '';

    const categoriasActivas = categorias.filter(c => c.activa);

    if (categoriasActivas.length === 0) {
        lista.innerHTML = '<p style="text-align: center; padding: 20px; color: #888;">No hay categorías registradas</p>';
        return;
    }

    categoriasActivas.forEach(categoria => {
        const item = document.createElement('div');
        item.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 15px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            transition: all 0.3s ease;
        `;

        item.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 1.2em;">🏷️</span>
                <span style="font-weight: 600; color: #fff;">${categoria.nombre}</span>
                <span style="color: #666; font-size: 0.9em;">(${contarProductosPorCategoria(categoria.id)} productos)</span>
            </div>
            <div style="display: flex; gap: 10px;">
                               <button onclick="editarCategoria('${categoria.id}')" style="background: #4a5568; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; margin-right: 8px;">✏️ Editar</button>
                ${categoria.id !== 'barra' && categoria.id !== 'cocina' ?
                `<button onclick="eliminarCategoria('${categoria.id}')" style="background: #ef4444; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px;">🗑️ Eliminar</button>` :
                '<span style="color: #666; font-size: 0.9em;">(Base)</span>'
            }
            </div>
        `;

        item.onmouseover = () => item.style.background = 'rgba(255, 255, 255, 0.05)';
        item.onmouseout = () => item.style.background = 'transparent';

        lista.appendChild(item);
    });
}

// Función para contar productos por categoría
function contarProductosPorCategoria(categoriaId) {
    return productos.filter(p => p.categoria === categoriaId).length;
}

// Función para agregar nueva categoría
function agregarCategoria() {
    const nombre = document.getElementById('nuevaCategoriaNombre').value.trim();

    if (!nombre) {
        alert('Por favor ingresa un nombre para la categoría');
        return;
    }

    // Verificar si ya existe
    if (categorias.some(c => c.nombre.toLowerCase() === nombre.toLowerCase() && c.activa)) {
        alert('Ya existe una categoría con ese nombre');
        return;
    }

    // Crear ID único basado en el nombre
    const id = nombre.toLowerCase().replace(/[^a-z0-9]/g, '_');

    // Agregar categoría
    categorias.push({
        id: id,
        nombre: nombre,
        activa: true
    });

    // Guardar en localStorage
    localStorage.setItem('categoriasPersonalizadas', JSON.stringify(categorias));

    // Limpiar campo
    document.getElementById('nuevaCategoriaNombre').value = '';

    // Actualizar listas
    renderizarListaCategorias();
    actualizarSelectoresCategorias();

    mostrarNotificacion(`✅ Categoría "${nombre}" agregada correctamente`);
}

// Función para eliminar categoría
function eliminarCategoria(id) {
    const categoria = categorias.find(c => c.id === id);
    if (!categoria) return;

    // Verificar si hay productos en esta categoría
    const productosEnCategoria = contarProductosPorCategoria(id);

    let mensaje = `¿Estás seguro de eliminar la categoría "${categoria.nombre}"?`;
    if (productosEnCategoria > 0) {
        mensaje += `\n\n⚠️ ATENCIÓN: Hay ${productosEnCategoria} productos en esta categoría.\nSe cambiarán automáticamente a la categoría "Barra".`;
    }

    if (confirm(mensaje)) {
        // Cambiar productos de esta categoría a "barra"
        productos.forEach(producto => {
            if (producto.categoria === id) {
                producto.categoria = 'barra';
            }
        });

        // Marcar categoría como inactiva
        const categoriaIndex = categorias.findIndex(c => c.id === id);
        if (categoriaIndex !== -1) {
            categorias[categoriaIndex].activa = false;
        }

        // Guardar cambios
        localStorage.setItem('categoriasPersonalizadas', JSON.stringify(categorias));
        localStorage.setItem('productosPersonalizados', JSON.stringify(productos));

        // Actualizar interfaces
        renderizarListaCategorias();
        actualizarSelectoresCategorias();
        renderizarListaProductos();

        mostrarNotificacion(`🗑️ Categoría "${categoria.nombre}" eliminada`);
    }
}

// Función para editar categoría
function editarCategoria(id) {
    const categoria = categorias.find(c => c.id === id && c.activa);
    if (!categoria) return;

    // Si hay teclado virtual activado, usar un modal en lugar de prompt
    if (esDispositivoTactil()) {
        // Crear un modal temporal para editar
        const modalHTML = `
            <div id="modalEditarCategoria" class="modal" style="display: block;">
                <div class="modal-content" style="max-width: 400px;">
                    <span class="close" onclick="document.getElementById('modalEditarCategoria').remove()">&times;</span>
                    <h2 style="margin-bottom: 20px; color: #fff;">✏️ Editar Categoría</h2>
                    
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 5px; color: #888;">Nombre de la categoría:</label>
                        <input type="text" id="editarCategoriaNombre" value="${categoria.nombre}"
                            style="width: 100%; padding: 12px; background: rgba(40, 40, 40, 0.9); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; color: white; font-size: 16px;">
                    </div>
                    
                    <div style="text-align: center;">
                        <button class="btn-success" onclick="guardarEdicionCategoria('${id}')">💾 Guardar</button>
                        <button class="btn-primary" onclick="document.getElementById('modalEditarCategoria').remove()">Cancelar</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Configurar teclado virtual
        setTimeout(() => {
            const input = document.getElementById('editarCategoriaNombre');
            if (input) {
                input.readOnly = true;
                input.addEventListener('click', function (e) {
                    e.preventDefault();
                    this.blur();
                    abrirTecladoCompleto(this);
                });
            }
        }, 100);

    } else {
        // Usar prompt normal si no hay teclado táctil
        const nuevoNombre = prompt(`Editar nombre de categoría:\n\nNombre actual: ${categoria.nombre}`, categoria.nombre);

        if (nuevoNombre && nuevoNombre.trim() !== '') {
            actualizarNombreCategoria(id, nuevoNombre.trim());
        }
    }
}

// Nueva función para guardar edición desde modal
function guardarEdicionCategoria(id) {
    const nuevoNombre = document.getElementById('editarCategoriaNombre').value.trim();

    if (nuevoNombre) {
        actualizarNombreCategoria(id, nuevoNombre);
        document.getElementById('modalEditarCategoria').remove();
    }
}

// Función auxiliar para actualizar nombre de categoría
function actualizarNombreCategoria(id, nuevoNombre) {
    // Verificar que no exista otra categoría con ese nombre
    if (categorias.some(c => c.nombre.toLowerCase() === nuevoNombre.toLowerCase() && c.id !== id && c.activa)) {
        alert('Ya existe una categoría con ese nombre');
        return;
    }

    // Encontrar y actualizar categoría
    const categoria = categorias.find(c => c.id === id);
    if (categoria) {
        categoria.nombre = nuevoNombre;

        // Guardar cambios
        localStorage.setItem('categoriasPersonalizadas', JSON.stringify(categorias));

        // Actualizar interfaces
        renderizarListaCategorias();
        actualizarSelectoresCategorias();

        mostrarNotificacion(`✅ Categoría renombrada a "${nuevoNombre}"`);
    }
}

// Función para editar categoría
function editarCategoria(id) {
    const categoria = categorias.find(c => c.id === id && c.activa);
    if (!categoria) return;

    const nuevoNombre = prompt(`Editar nombre de categoría:\n\nNombre actual: ${categoria.nombre}`, categoria.nombre);

    if (nuevoNombre && nuevoNombre.trim() !== '') {
        // Verificar que no exista otra categoría con ese nombre
        if (categorias.some(c => c.nombre.toLowerCase() === nuevoNombre.toLowerCase() && c.id !== id && c.activa)) {
            alert('Ya existe una categoría con ese nombre');
            return;
        }

        // Actualizar nombre
        categoria.nombre = nuevoNombre.trim();

        // Guardar cambios
        localStorage.setItem('categoriasPersonalizadas', JSON.stringify(categorias));

        // Actualizar interfaces
        renderizarListaCategorias();
        actualizarSelectoresCategorias();
        renderizarListaProductos(); // Por si se muestra el nombre de categoría

        mostrarNotificacion(`✅ Categoría renombrada a "${nuevoNombre}"`);
    }
}

// Función para actualizar todos los selectores de categorías
function actualizarSelectoresCategorias() {
    // Actualizar selector en nuevo producto
    const selectNuevo = document.getElementById('nuevaCategoria');
    if (selectNuevo) {
        actualizarSelectorCategoria(selectNuevo);
    }

    // Actualizar selector en filtros de inventario si existe
    const selectFiltroArea = document.getElementById('filtroArea');
    if (selectFiltroArea) {
        const valorActual = selectFiltroArea.value;
        selectFiltroArea.innerHTML = '<option value="todos">Todas las áreas</option>';

        const areasActivas = areas.filter(a => a.activa);
        areasActivas.forEach(area => {
            const option = document.createElement('option');
            option.value = area.id;
            option.textContent = area.nombre;
            selectFiltroArea.appendChild(option);
        });

        // Opción para productos sin área
        const optionSinArea = document.createElement('option');
        optionSinArea.value = 'sin_area';
        optionSinArea.textContent = 'Sin área asignada';
        selectFiltroArea.appendChild(optionSinArea);

        // Mantener selección si todavía existe
        if (valorActual && Array.from(selectFiltroArea.options).some(opt => opt.value === valorActual)) {
            selectFiltroArea.value = valorActual;
        }
    }
}

// Función auxiliar para actualizar un selector específico
function actualizarSelectorCategoria(selector) {
    const valorActual = selector.value;
    selector.innerHTML = '';

    const categoriasActivas = categorias.filter(c => c.activa);
    categoriasActivas.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = cat.nombre;
        selector.appendChild(option);
    });

    // Mantener selección si todavía existe
    if (valorActual && Array.from(selector.options).some(opt => opt.value === valorActual)) {
        selector.value = valorActual;
    }
}

// ========================================
// GESTIÓN DE ÁREAS
// ========================================

// Función para renderizar lista de áreas
function renderizarListaAreas() {
    const lista = document.getElementById('listaAreas');
    if (!lista) return;

    lista.innerHTML = '';

    const areasActivas = areas.filter(a => a.activa);

    if (areasActivas.length === 0) {
        lista.innerHTML = '<p style="text-align: center; padding: 20px; color: #888;">No hay áreas registradas</p>';
        return;
    }

    areasActivas.forEach(area => {
        const item = document.createElement('div');
        item.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 15px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            transition: all 0.3s ease;
        `;

        item.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 1.2em;">🏢</span>
                <span style="font-weight: 600; color: #fff;">${area.nombre}</span>
                <span style="color: #666; font-size: 0.9em;">(${contarProductosPorArea(area.id)} productos)</span>
            </div>
            <div style="display: flex; gap: 10px;">
                <button onclick="editarArea('${area.id}')" style="background: #4a5568; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px;">✏️ Editar</button>
                ${area.id !== 'barra' && area.id !== 'cocina' && area.id !== 'terraza' ?
                `<button onclick="eliminarArea('${area.id}')" style="background: #ef4444; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px;">🗑️ Eliminar</button>` :
                '<span style="color: #666; font-size: 0.9em;">(Base)</span>'
            }
            </div>
        `;

        item.onmouseover = () => item.style.background = 'rgba(255, 255, 255, 0.05)';
        item.onmouseout = () => item.style.background = 'transparent';

        lista.appendChild(item);
    });
}

// Función para contar productos por área
function contarProductosPorArea(areaId) {
    return productos.filter(p => p.area === areaId).length;
}

// Función para agregar nueva área
function agregarArea() {
    const nombre = document.getElementById('nuevaAreaNombre').value.trim();

    if (!nombre) {
        alert('Por favor ingresa un nombre para el área');
        return;
    }

    // Verificar si ya existe
    if (areas.some(a => a.nombre.toLowerCase() === nombre.toLowerCase() && a.activa)) {
        alert('Ya existe un área con ese nombre');
        return;
    }

    // Crear ID único basado en el nombre
    const id = nombre.toLowerCase().replace(/[^a-z0-9]/g, '_');

    // Agregar área
    areas.push({
        id: id,
        nombre: nombre,
        activa: true
    });

    // Guardar en localStorage
    localStorage.setItem('areasPersonalizadas', JSON.stringify(areas));

    // Limpiar campo
    document.getElementById('nuevaAreaNombre').value = '';

    // Actualizar listas
    renderizarListaAreas();
    actualizarSelectoresAreas();

    mostrarNotificacion(`✅ Área "${nombre}" agregada correctamente`);
}

// Función para eliminar área
function eliminarArea(id) {
    const area = areas.find(a => a.id === id);
    if (!area) return;

    const productosEnArea = contarProductosPorArea(id);

    let mensaje = `¿Estás seguro de eliminar el área "${area.nombre}"?`;
    if (productosEnArea > 0) {
        mensaje += `\n\n⚠️ ATENCIÓN: Hay ${productosEnArea} productos en esta área.\nSe cambiarán a "Sin área asignada".`;
    }

    if (confirm(mensaje)) {
        // Cambiar productos de esta área a vacío
        productos.forEach(producto => {
            if (producto.area === id) {
                producto.area = '';
            }
        });

        // Marcar área como inactiva
        const areaIndex = areas.findIndex(a => a.id === id);
        if (areaIndex !== -1) {
            areas[areaIndex].activa = false;
        }

        // Guardar cambios
        localStorage.setItem('areasPersonalizadas', JSON.stringify(areas));
        localStorage.setItem('productosPersonalizados', JSON.stringify(productos));

        // Actualizar interfaces
        renderizarListaAreas();
        actualizarSelectoresAreas();
        renderizarListaProductos();

        mostrarNotificacion(`🗑️ Área "${area.nombre}" eliminada`);
    }
}

// Función para editar área
function editarArea(id) {
    const area = areas.find(a => a.id === id && a.activa);
    if (!area) return;

    // Si hay teclado virtual activado, usar un modal en lugar de prompt
    if (esDispositivoTactil()) {
        // Crear un modal temporal para editar
        const modalHTML = `
            <div id="modalEditarArea" class="modal" style="display: block;">
                <div class="modal-content" style="max-width: 400px;">
                    <span class="close" onclick="document.getElementById('modalEditarArea').remove()">&times;</span>
                    <h2 style="margin-bottom: 20px; color: #fff;">✏️ Editar Área</h2>
                    
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 5px; color: #888;">Nombre del área:</label>
                        <input type="text" id="editarAreaNombre" value="${area.nombre}"
                            style="width: 100%; padding: 12px; background: rgba(40, 40, 40, 0.9); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; color: white; font-size: 16px;">
                    </div>
                    
                    <div style="text-align: center;">
                        <button class="btn-success" onclick="guardarEdicionArea('${id}')">💾 Guardar</button>
                        <button class="btn-primary" onclick="document.getElementById('modalEditarArea').remove()">Cancelar</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Configurar teclado virtual
        setTimeout(() => {
            const input = document.getElementById('editarAreaNombre');
            if (input) {
                input.readOnly = true;
                input.addEventListener('click', function (e) {
                    e.preventDefault();
                    this.blur();
                    abrirTecladoCompleto(this);
                });
            }
        }, 100);

    } else {
        // Usar prompt normal si no hay teclado táctil
        const nuevoNombre = prompt(`Editar nombre de área:\n\nNombre actual: ${area.nombre}`, area.nombre);

        if (nuevoNombre && nuevoNombre.trim() !== '') {
            actualizarNombreArea(id, nuevoNombre.trim());
        }
    }
}

// Nueva función para guardar edición desde modal
function guardarEdicionArea(id) {
    const nuevoNombre = document.getElementById('editarAreaNombre').value.trim();

    if (nuevoNombre) {
        actualizarNombreArea(id, nuevoNombre);
        document.getElementById('modalEditarArea').remove();
    }
}

// Función auxiliar para actualizar nombre de área
function actualizarNombreArea(id, nuevoNombre) {
    // Verificar que no exista otra área con ese nombre
    if (areas.some(a => a.nombre.toLowerCase() === nuevoNombre.toLowerCase() && a.id !== id && a.activa)) {
        alert('Ya existe un área con ese nombre');
        return;
    }

    // Encontrar y actualizar área
    const area = areas.find(a => a.id === id);
    if (area) {
        area.nombre = nuevoNombre;

        // Guardar cambios
        localStorage.setItem('areasPersonalizadas', JSON.stringify(areas));

        // Actualizar interfaces
        renderizarListaAreas();
        actualizarSelectoresAreas();

        mostrarNotificacion(`✅ Área renombrada a "${nuevoNombre}"`);
    }
}

// Función para actualizar todos los selectores de áreas
function actualizarSelectoresAreas() {
    // Actualizar selector en nuevo producto
    const selectNuevo = document.getElementById('nuevaArea');
    if (selectNuevo) {
        const valorActual = selectNuevo.value;
        selectNuevo.innerHTML = '<option value="">Sin área asignada</option>';  // Opción vacía

        const areasActivas = areas.filter(a => a.activa);
        areasActivas.forEach(area => {
            const option = document.createElement('option');
            option.value = area.id;
            option.textContent = area.nombre;
            selectNuevo.appendChild(option);
        });

        // Mantener selección si todavía existe
        if (valorActual && Array.from(selectNuevo.options).some(opt => opt.value === valorActual)) {
            selectNuevo.value = valorActual;
        }
    }

    // Actualizar selector en filtros de inventario si existe
    const selectFiltroArea = document.getElementById('filtroArea');
    if (selectFiltroArea) {
        const valorActual = selectFiltroArea.value;
        selectFiltroArea.innerHTML = '<option value="todos">Todas las áreas</option>';

        const areasActivas = areas.filter(a => a.activa);
        areasActivas.forEach(area => {
            const option = document.createElement('option');
            option.value = area.id;
            option.textContent = area.nombre;
            selectFiltroArea.appendChild(option);
        });

        // Opción para productos sin área
        const optionSinArea = document.createElement('option');
        optionSinArea.value = 'sin_area';
        optionSinArea.textContent = 'Sin área asignada';
        selectFiltroArea.appendChild(optionSinArea);

        // Mantener selección si todavía existe
        if (valorActual && Array.from(selectFiltroArea.options).some(opt => opt.value === valorActual)) {
            selectFiltroArea.value = valorActual;
        }
    }
}

// Función para mostrar notificaciones estilizadas
function mostrarNotificacion(mensaje) {
    // Crear el elemento de notificación
    const notificacion = document.createElement('div');
    notificacion.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #ff6b6b 0%, #ffa502 100%);
        color: white;
        padding: 20px 30px;
        border-radius: 15px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        z-index: 2000;
        animation: slideInRight 0.3s ease;
        font-weight: 600;
    `;
    notificacion.textContent = mensaje;

    // Añadir animación CSS
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideInRight {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        @keyframes slideOutRight {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
    `;

    if (!document.querySelector('style[data-notificacion]')) {
        style.setAttribute('data-notificacion', 'true');
        document.head.appendChild(style);
    }

    // Añadir al documento
    document.body.appendChild(notificacion);

    // Eliminar después de 3 segundos
    setTimeout(() => {
        notificacion.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            if (document.body.contains(notificacion)) {
                document.body.removeChild(notificacion);
            }
        }, 300);
    }, 3000);
}

// Cerrar modal si se hace clic fuera
window.onclick = function (event) {
    const modal = document.getElementById('mesaModal');
    if (event.target == modal) {
        cerrarModal();
    }
}

// Atajos de teclado
document.addEventListener('keydown', function (event) {
    // ESC para cerrar modal
    if (event.key === 'Escape' && mesaActual !== null) {
        cerrarModal();
    }
});

// Variables para edición de productos
let productoEditandoId = null;

// Función para abrir modal de edición
function abrirModalEditarProducto(id) {
    const producto = productos.find(p => p.id === id);
    if (!producto) return;

    productoEditandoId = id;

    // Llenar campos con datos actuales
    document.getElementById('editarNombre').value = producto.nombre;
    document.getElementById('editarPrecio').value = producto.precio;
    document.getElementById('editarEmoji').value = producto.emoji;

    // Mostrar modal
    document.getElementById('editarProductoModal').style.display = 'block';
    // Configurar teclados virtuales para este modal
    if (esDispositivoTactil()) {
        setTimeout(() => {
            // Campo de nombre
            const inputNombre = document.getElementById('editarNombre');
            if (inputNombre) {
                inputNombre.readOnly = true;
                const newInputNombre = inputNombre.cloneNode(true);
                inputNombre.parentNode.replaceChild(newInputNombre, inputNombre);
                newInputNombre.addEventListener('click', function (e) {
                    e.preventDefault();
                    this.blur();
                    abrirTecladoCompleto(this);
                });
            }

            // Campo de precio
            const inputPrecio = document.getElementById('editarPrecio');
            if (inputPrecio) {
                inputPrecio.readOnly = true;
                const newInputPrecio = inputPrecio.cloneNode(true);
                inputPrecio.parentNode.replaceChild(newInputPrecio, inputPrecio);
                newInputPrecio.addEventListener('click', function (e) {
                    e.preventDefault();
                    this.blur();
                    abrirTecladoNumerico(this);
                });
            }
        }, 200);
    }
}

// Función para cerrar modal de edición
function cerrarModalEditarProducto() {
    document.getElementById('editarProductoModal').style.display = 'none';
    productoEditandoId = null;

    // Limpiar campos
    document.getElementById('editarNombre').value = '';
    document.getElementById('editarPrecio').value = '';
    document.getElementById('editarEmoji').value = '';
}

// Función para guardar la edición
function guardarEdicionProducto() {
    const nombre = document.getElementById('editarNombre').value.trim();
    const precio = parseFloat(document.getElementById('editarPrecio').value);
    const emoji = document.getElementById('editarEmoji').value.trim() || '🍽️';

    if (!nombre) {
        alert('Por favor ingresa un nombre para el producto');
        return;
    }

    if (isNaN(precio) || precio <= 0) {
        alert('Por favor ingresa un precio válido');
        return;
    }

    // Encontrar y actualizar el producto
    const productoIndex = productos.findIndex(p => p.id === productoEditandoId);
    if (productoIndex !== -1) {
        const nombreAnterior = productos[productoIndex].nombre;

        productos[productoIndex] = {
            ...productos[productoIndex],
            nombre: nombre,
            precio: precio,
            emoji: emoji
        };

        // Guardar en localStorage
        localStorage.setItem('productosPersonalizados', JSON.stringify(productos));

        // Actualizar lista
        renderizarListaProductos();

        // Cerrar modal
        cerrarModalEditarProducto();

        // Mostrar notificación
        mostrarNotificacion(`✅ Producto "${nombreAnterior}" actualizado correctamente`);
    }
}

// Cerrar modal de edición si se hace clic fuera
window.addEventListener('click', function (event) {
    const modal = document.getElementById('editarProductoModal');
    if (event.target == modal) {
        cerrarModalEditarProducto();
    }
});

window.addEventListener('click', function (event) {
    const modal = document.getElementById('modalCobro');
    if (event.target == modal) {
        cerrarModalCobro();
    }
});

// Atajos de teclado para modal de edición
document.addEventListener('keydown', function (event) {
    // ESC para cerrar modal de edición
    if (event.key === 'Escape' && productoEditandoId !== null) {
        cerrarModalEditarProducto();
    }

    // Enter para guardar cambios
    if (event.key === 'Enter' && productoEditandoId !== null) {
        guardarEdicionProducto();
    }
});

// Atajos de teclado para modal de cobro
document.addEventListener('keydown', function (event) {
    const modalCobro = document.getElementById('modalCobro');
    if (modalCobro && modalCobro.style.display === 'block') {
        // ESC para cerrar modal de cobro
        if (event.key === 'Escape') {
            cerrarModalCobro();
        }

        // Enter para confirmar cobro
        if (event.key === 'Enter') {
            const confirmarBtn = document.getElementById('confirmarCobroBtn');
            if (!confirmarBtn.disabled) {
                confirmarCobro();
            }
        }
    }
});



// Variables para gestión de mesas
let mesaEditandoId = null;
let mesasConfig = JSON.parse(localStorage.getItem('mesasConfiguracion')) || [];

// Inicializar configuración de mesas si no existe
function inicializarMesasConfig() {
    // Cargar de localStorage si existe
    const mesasGuardadas = localStorage.getItem('mesasConfiguracion');
    if (mesasGuardadas) {
        mesasConfig = JSON.parse(mesasGuardadas);
    }

    // Si sigue vacío, crear configuración por defecto
    if (!mesasConfig || mesasConfig.length === 0) {
        mesasConfig = [
            { id: 1, nombre: 'Mesa 1', capacidad: 4, descripcion: '', activa: true },
            { id: 2, nombre: 'Mesa 2', capacidad: 4, descripcion: '', activa: true },
            { id: 3, nombre: 'Mesa 3', capacidad: 4, descripcion: '', activa: true },
            { id: 4, nombre: 'Mesa 4', capacidad: 6, descripcion: '', activa: true },
            { id: 5, nombre: 'Mesa 5', capacidad: 2, descripcion: '', activa: true },
            { id: 6, nombre: 'Barra 1', capacidad: 1, descripcion: 'Asiento en barra', activa: true },
            { id: 7, nombre: 'Barra 2', capacidad: 1, descripcion: 'Asiento en barra', activa: true },
            { id: 8, nombre: 'Barra 3', capacidad: 1, descripcion: 'Asiento en barra', activa: true },
            { id: 9, nombre: 'Terraza 1', capacidad: 4, descripcion: 'Mesa exterior', activa: true },
            { id: 10, nombre: 'Terraza 2', capacidad: 4, descripcion: 'Mesa exterior', activa: true }
        ];

        localStorage.setItem('mesasConfiguracion', JSON.stringify(mesasConfig));
        console.log('✅ Configuración inicial de mesas creada');
    }
}

// Función para abrir modal de crear mesa
function abrirModalCrearMesa() {
    mesaEditandoId = null;
    document.getElementById('tituloModalMesa').textContent = '🪑 Crear Mesa';

    // Limpiar campos
    document.getElementById('gestionMesaNombre').value = '';
    document.getElementById('gestionMesaCapacidad').value = '4';
    document.getElementById('gestionMesaDescripcion').value = '';

    // Mostrar modal
    document.getElementById('gestionMesaModal').style.display = 'block';
}

// Función para abrir modal de editar mesa
function abrirModalEditarMesa(id) {
    const mesa = mesasConfig.find(m => m.id === id);
    if (!mesa) return;

    mesaEditandoId = id;
    document.getElementById('tituloModalMesa').textContent = '✏️ Editar Mesa';

    // Llenar campos con datos actuales
    document.getElementById('gestionMesaNombre').value = mesa.nombre;
    document.getElementById('gestionMesaCapacidad').value = mesa.capacidad;
    document.getElementById('gestionMesaDescripcion').value = mesa.descripcion || '';

    // Mostrar modal
    document.getElementById('gestionMesaModal').style.display = 'block';
}

// Función para cerrar modal de gestión de mesa
function cerrarModalGestionMesa() {
    document.getElementById('gestionMesaModal').style.display = 'none';
    mesaEditandoId = null;

    // Limpiar campos
    document.getElementById('gestionMesaNombre').value = '';
    document.getElementById('gestionMesaCapacidad').value = '4';
    document.getElementById('gestionMesaDescripcion').value = '';
}

// Función para guardar mesa (crear o editar)
function guardarGestionMesa() {
    const nombre = document.getElementById('gestionMesaNombre').value.trim();
    const capacidad = parseInt(document.getElementById('gestionMesaCapacidad').value);
    const descripcion = document.getElementById('gestionMesaDescripcion').value.trim();

    if (!nombre) {
        alert('Por favor ingresa un nombre para la mesa');
        return;
    }

    if (isNaN(capacidad) || capacidad <= 0) {
        alert('Por favor ingresa una capacidad válida');
        return;
    }

    if (mesaEditandoId === null) {
        // Crear nueva mesa
        const nuevoId = mesasConfig.length > 0 ? Math.max(...mesasConfig.map(m => m.id)) + 1 : 1;

        // Verificar que no exista una mesa con el mismo nombre
        if (mesasConfig.some(m => m.nombre.toLowerCase() === nombre.toLowerCase() && m.activa)) {
            alert('Ya existe una mesa con ese nombre');
            return;
        }

        const nuevaMesa = {
            id: nuevoId,
            nombre: nombre,
            capacidad: capacidad,
            descripcion: descripcion,
            activa: true
        };

        mesasConfig.push(nuevaMesa);

        // Inicializar array de productos para la nueva mesa
        if (!mesas[nuevoId]) {
            mesas[nuevoId] = [];
        }

        mostrarNotificacion(`✅ Mesa "${nombre}" creada correctamente`);

    } else {
        // Editar mesa existente
        const mesaIndex = mesasConfig.findIndex(m => m.id === mesaEditandoId);
        if (mesaIndex !== -1) {
            const nombreAnterior = mesasConfig[mesaIndex].nombre;

            // Verificar que no exista otra mesa con el mismo nombre
            if (mesasConfig.some(m => m.nombre.toLowerCase() === nombre.toLowerCase() && m.id !== mesaEditandoId && m.activa)) {
                alert('Ya existe una mesa con ese nombre');
                return;
            }

            mesasConfig[mesaIndex] = {
                ...mesasConfig[mesaIndex],
                nombre: nombre,
                capacidad: capacidad,
                descripcion: descripcion
            };

            mostrarNotificacion(`✅ Mesa "${nombreAnterior}" actualizada correctamente`);
        }
    }

    // Guardar en localStorage
    localStorage.setItem('mesasConfiguracion', JSON.stringify(mesasConfig));

    // Actualizar interfaces
    renderizarListaMesas();
    renderizarMesas();

    // Cerrar modal
    cerrarModalGestionMesa();
}

// Función para eliminar mesa
function eliminarMesa(id) {
    const mesa = mesasConfig.find(m => m.id === id);
    if (!mesa) return;

    // Verificar si la mesa tiene productos
    const tieneProductos = mesas[id] && mesas[id].length > 0;

    const mensaje = tieneProductos
        ? `¿Estás seguro de eliminar "${mesa.nombre}"?\n\n⚠️ ATENCIÓN: Esta mesa tiene productos pendientes que se perderán.`
        : `¿Estás seguro de eliminar "${mesa.nombre}"?`;

    if (confirm(mensaje)) {
        // Marcar como inactiva en lugar de eliminar completamente
        const mesaIndex = mesasConfig.findIndex(m => m.id === id);
        if (mesaIndex !== -1) {
            mesasConfig[mesaIndex].activa = false;
        }

        // Limpiar productos de la mesa
        if (mesas[id]) {
            mesas[id] = [];
        }

        // Guardar cambios
        localStorage.setItem('mesasConfiguracion', JSON.stringify(mesasConfig));

        // Actualizar interfaces
        renderizarListaMesas();
        renderizarMesas();

        mostrarNotificacion(`🗑️ Mesa "${mesa.nombre}" eliminada`);
    }
}

// Función para renderizar lista de mesas en configuración
function renderizarListaMesas() {
    const lista = document.getElementById('listaMesas');
    if (!lista) return;

    lista.innerHTML = '';

    const mesasActivas = mesasConfig.filter(m => m.activa);

    if (mesasActivas.length === 0) {
        lista.innerHTML = '<p style="text-align: center; padding: 20px; color: #888;">No hay mesas registradas</p>';
        return;
    }

    mesasActivas.forEach(mesa => {
        const item = document.createElement('div');
        item.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 15px 20px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            transition: background 0.3s ease;
        `;

        item.innerHTML = `
            <div style="flex: 1;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 1.2em;">🪑</span>
                    <div>
                        <span style="font-weight: 600; color: #fff;">${mesa.nombre}</span>
                        <div style="font-size: 0.9em; color: #888; margin-top: 2px;">
                            Capacidad: ${mesa.capacidad} personas
                            ${mesa.descripcion ? ` • ${mesa.descripcion}` : ''}
                        </div>
                    </div>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
                <button onclick="abrirModalEditarMesa(${mesa.id})" style="background: #4a5568; color: white; border: none; padding: 8px 15px; border-radius: 8px; cursor: pointer; font-size: 14px; transition: all 0.3s ease;">✏️ Editar</button>
                <button onclick="eliminarMesa(${mesa.id})" style="background: #ef4444; color: white; border: none; padding: 8px 15px; border-radius: 8px; cursor: pointer; font-size: 14px; transition: all 0.3s ease;">🗑️ Eliminar</button>
            </div>
        `;

        lista.appendChild(item);
    });
}

// Event listeners adicionales para modal de gestión de mesas
window.addEventListener('click', function (event) {
    const modal = document.getElementById('gestionMesaModal');
    if (event.target == modal) {
        cerrarModalGestionMesa();
    }
});

// Atajos de teclado para modal de gestión de mesas
document.addEventListener('keydown', function (event) {
    // ESC para cerrar modal de gestión de mesas
    if (event.key === 'Escape' && document.getElementById('gestionMesaModal').style.display === 'block') {
        cerrarModalGestionMesa();
    }

    // Enter para guardar mesa
    if (event.key === 'Enter' && document.getElementById('gestionMesaModal').style.display === 'block') {
        guardarGestionMesa();
    }
});



// Función para inicializar filtros de pedidos
function inicializarFiltrosPedidos() {
    // Establecer fecha actual
    const hoy = new Date();
    document.getElementById('filtroFecha').value = hoy.toISOString().split('T')[0];

    // Llenar select de mesas
    const selectMesa = document.getElementById('filtroMesa');
    selectMesa.innerHTML = '<option value="">Todas las mesas</option>';

    const mesasActivas = mesasConfig.filter(m => m.activa);
    mesasActivas.forEach(mesa => {
        const option = document.createElement('option');
        option.value = mesa.id;
        option.textContent = mesa.nombre;
        selectMesa.appendChild(option);
    });

    // Aplicar filtros iniciales
    aplicarFiltrosPedidos();
}

async function aplicarFiltrosPedidos() {
    const fecha = document.getElementById('filtroFecha').value;
    const mesa = document.getElementById('filtroMesa').value;
    const horaDesde = document.getElementById('filtroHoraDesde').value;
    const horaHasta = document.getElementById('filtroHoraHasta').value;

    try {
        // Obtener datos desde IndexedDB
        const todosLosPedidos = await DB.obtenerFacturacion();

        pedidosFiltrados = todosLosPedidos.filter(pedido => {
            const fechaPedido = new Date(pedido.fecha);
            const fechaStr = fechaPedido.toISOString().split('T')[0];

            // Filtro por fecha
            if (fecha && fechaStr !== fecha) return false;

            // Filtro por mesa
            if (mesa && pedido.mesa.toString() !== mesa) return false;

            // Filtro por hora
            if (horaDesde || horaHasta) {
                const horaPedido = fechaPedido.getHours() * 60 + fechaPedido.getMinutes();

                if (horaDesde) {
                    const [horaD, minD] = horaDesde.split(':');
                    const minutosDesde = parseInt(horaD) * 60 + parseInt(minD);
                    if (horaPedido < minutosDesde) return false;
                }

                if (horaHasta) {
                    const [horaH, minH] = horaHasta.split(':');
                    const minutosHasta = parseInt(horaH) * 60 + parseInt(minH);
                    if (horaPedido > minutosHasta) return false;
                }
            }

            return true;
        });

        actualizarEstadisticasHora();
        renderizarListaPedidos();

    } catch (error) {
        console.error('Error al filtrar pedidos:', error);
        pedidosFiltrados = [];
    }
}

// Función para limpiar filtros
function limpiarFiltrosPedidos() {
    document.getElementById('filtroFecha').value = '';
    document.getElementById('filtroMesa').value = '';
    document.getElementById('filtroHoraDesde').value = '';
    document.getElementById('filtroHoraHasta').value = '';
    aplicarFiltrosPedidos();
}

// Función para actualizar estadísticas por hora
function actualizarEstadisticasHora() {
    const container = document.getElementById('estadisticasHora');
    container.innerHTML = '';

    // Agrupar por hora
    const ventasPorHora = {};
    let totalPedidos = 0;
    let totalVentas = 0;

    pedidosFiltrados.forEach(pedido => {
        const fecha = new Date(pedido.fecha);
        const hora = fecha.getHours();

        if (!ventasPorHora[hora]) {
            ventasPorHora[hora] = {
                pedidos: 0,
                total: 0
            };
        }

        ventasPorHora[hora].pedidos++;
        ventasPorHora[hora].total += pedido.total;
        totalPedidos++;
        totalVentas += pedido.total;
    });

    // Crear cards de resumen
    const cardResumen = document.createElement('div');
    cardResumen.style.cssText = `
        background: rgba(255, 107, 107, 0.1);
        border: 1px solid rgba(255, 107, 107, 0.3);
        padding: 15px;
        border-radius: 10px;
        text-align: center;
        grid-column: 1 / -1;
        margin-bottom: 15px;
    `;
    cardResumen.innerHTML = `
        <h4 style="color: #ffa502; margin-bottom: 10px;">📊 Resumen Total</h4>
        <div style="display: flex; justify-content: space-around; text-align: center;">
            <div>
                <div style="font-size: 1.5em; font-weight: bold; color: #fff;">${totalPedidos}</div>
                <div style="color: #888; font-size: 0.9em;">Pedidos</div>
            </div>
            <div>
                <div style="font-size: 1.5em; font-weight: bold; color: #ffa502;">€${totalVentas.toFixed(2)}</div>
                <div style="color: #888; font-size: 0.9em;">Total</div>
            </div>
        </div>
    `;
    container.appendChild(cardResumen);

    // Crear cards por hora
    for (let hora = 0; hora < 24; hora++) {
        const datos = ventasPorHora[hora];
        if (!datos) continue;

        const card = document.createElement('div');
        card.style.cssText = `
            background: rgba(40, 40, 40, 0.9);
            border: 1px solid rgba(255, 255, 255, 0.1);
            padding: 15px;
            border-radius: 10px;
            text-align: center;
            transition: all 0.3s ease;
            cursor: pointer;
        `;

        card.innerHTML = `
            <h4 style="color: #ffa502; margin-bottom: 10px;">⏰ ${hora.toString().padStart(2, '0')}:00</h4>
            <div style="color: #fff; font-size: 1.2em; font-weight: bold; margin-bottom: 5px;">${datos.pedidos} pedidos</div>
            <div style="color: #888; font-size: 0.9em;">€${datos.total.toFixed(2)}</div>
        `;

        card.onclick = () => filtrarPorHora(hora);
        card.onmouseover = () => card.style.transform = 'translateY(-3px)';
        card.onmouseout = () => card.style.transform = 'translateY(0)';

        container.appendChild(card);
    }
}

// Función para filtrar por hora específica
function filtrarPorHora(hora) {
    document.getElementById('filtroHoraDesde').value = `${hora.toString().padStart(2, '0')}:00`;
    document.getElementById('filtroHoraHasta').value = `${hora.toString().padStart(2, '0')}:59`;
    aplicarFiltrosPedidos();
}

// Función para renderizar lista de pedidos
function renderizarListaPedidos() {
    const container = document.getElementById('listaPedidos');
    container.innerHTML = '';

    if (pedidosFiltrados.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 40px; color: #888;">No hay pedidos que coincidan con los filtros</p>';
        return;
    }

    // Ordenar por fecha más reciente primero
    const pedidosOrdenados = [...pedidosFiltrados].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    pedidosOrdenados.forEach(pedido => {
        const fecha = new Date(pedido.fecha);
        const mesaConfig = mesasConfig.find(m => m.id === pedido.mesa);
        const nombreMesa = mesaConfig ? mesaConfig.nombre : `Mesa ${pedido.mesa}`;

        const item = document.createElement('div');
        item.style.cssText = `
            background: rgba(40, 40, 40, 0.9);
            border: 1px solid rgba(255, 255, 255, 0.1);
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 15px;
            transition: all 0.3s ease;
        `;

        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <div style="display: flex; align-items: center; gap: 15px;">
                    <span style="font-size: 1.2em;">🧾</span>
                    <div>
                        <h4 style="color: #fff; margin: 0; font-size: 1.1em;">${nombreMesa}</h4>
                        <p style="color: #888; margin: 0; font-size: 0.9em;">
                            📅 ${fecha.toLocaleDateString('es-ES')} - 
                            ⏰ ${fecha.toLocaleTimeString('es-ES')}
                        </p>
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 1.3em; font-weight: bold; color: #ffa502;">€${pedido.total.toFixed(2)}</div>
                    <button onclick="verDetallePedido(${pedido.mesa}, '${pedido.fecha}')" style="background: #4a5568; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 12px; margin-top: 5px;">👁️ Ver Detalle</button>
                </div>
            </div>
            <div style="border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 15px;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">
                    ${pedido.items.map(item => `
                        <div style="display: flex; justify-content: space-between; padding: 5px 0;">
                            <span>${item.emoji} ${item.nombre}</span>
                            <span style="color: #ffa502;">€${item.precio.toFixed(2)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        item.onmouseover = () => item.style.background = 'rgba(50, 50, 50, 0.9)';
        item.onmouseout = () => item.style.background = 'rgba(40, 40, 40, 0.9)';

        container.appendChild(item);
    });
}

// Función para ver detalle de pedido
async function verDetallePedido(mesa, fecha) {
    // Primero intentar buscar en el array local
    let pedido = facturacion.find(p => p.mesa === mesa && p.fecha === fecha);

    // Si no está en memoria, buscarlo en IndexedDB
    if (!pedido) {
        try {
            const todosPedidos = await DB.obtenerFacturacion();
            pedido = todosPedidos.find(p => p.mesa === mesa && p.fecha === fecha);
        } catch (error) {
            console.error('Error al buscar pedido:', error);
            alert('Error al cargar el detalle del pedido');
            return;
        }
    }

    if (!pedido) {
        alert('No se encontró el pedido solicitado');
        return;
    }

    const fechaObj = new Date(pedido.fecha);
    const mesaConfig = mesasConfig.find(m => m.id === pedido.mesa);
    const nombreMesa = mesaConfig ? mesaConfig.nombre : `Mesa ${pedido.mesa}`;

    // Agrupar items por producto
    const itemsAgrupados = {};
    pedido.items.forEach(item => {
        if (!itemsAgrupados[item.id]) {
            itemsAgrupados[item.id] = {
                nombre: item.nombre,
                precio: item.precio,
                emoji: item.emoji,
                cantidad: 0
            };
        }
        itemsAgrupados[item.id].cantidad++;
    });

    const detalle = Object.values(itemsAgrupados).map(item =>
        `${item.emoji} ${item.cantidad}x ${item.nombre} - €${(item.precio * item.cantidad).toFixed(2)}`
    ).join('\n');

    const mensaje = `🧾 DETALLE DEL PEDIDO\n\n` +
        `🪑 Mesa: ${nombreMesa}\n` +
        `📅 Fecha: ${fechaObj.toLocaleDateString('es-ES')}\n` +
        `⏰ Hora: ${fechaObj.toLocaleTimeString('es-ES')}\n\n` +
        `📋 PRODUCTOS:\n${detalle}\n\n` +
        `💰 TOTAL: €${pedido.total.toFixed(2)}`;

    alert(mensaje);
}



// Función para actualizar la pestaña de pedidos
function actualizarTabPedidos() {
    inicializarFiltrosPedidos();

    // Mostrar panel de búsqueda avanzada según licencia
    const panelContainer = document.getElementById('panelBusquedaAvanzada');
    if (panelContainer) {
        const panel = mostrarPanelBusquedaAvanzada();
        if (panel) {
            panelContainer.innerHTML = '';
            panelContainer.appendChild(panel);
        }
    }
}

// Función para actualizar estadísticas por hora
function actualizarEstadisticasHora() {
    const container = document.getElementById('estadisticasHora');
    if (!container) return;

    container.innerHTML = '';

    // Agrupar por hora
    const ventasPorHora = {};
    let totalPedidos = 0;
    let totalVentas = 0;

    pedidosFiltrados.forEach(pedido => {
        const fecha = new Date(pedido.fecha);
        const hora = fecha.getHours();

        if (!ventasPorHora[hora]) {
            ventasPorHora[hora] = {
                pedidos: 0,
                total: 0
            };
        }

        ventasPorHora[hora].pedidos++;
        ventasPorHora[hora].total += pedido.total;
        totalPedidos++;
        totalVentas += pedido.total;
    });

    // Crear cards de resumen
    const cardResumen = document.createElement('div');
    cardResumen.style.cssText = `
        background: rgba(255, 107, 107, 0.1);
        border: 1px solid rgba(255, 107, 107, 0.3);
        padding: 15px;
        border-radius: 10px;
        text-align: center;
        grid-column: 1 / -1;
        margin-bottom: 15px;
    `;
    cardResumen.innerHTML = `
        <h4 style="color: #ffa502; margin-bottom: 10px;">📊 Resumen Total</h4>
        <div style="display: flex; justify-content: space-around; text-align: center;">
            <div>
                <div style="font-size: 1.5em; font-weight: bold; color: #fff;">${totalPedidos}</div>
                <div style="color: #888; font-size: 0.9em;">Pedidos</div>
            </div>
            <div>
                <div style="font-size: 1.5em; font-weight: bold; color: #ffa502;">€${totalVentas.toFixed(2)}</div>
                <div style="color: #888; font-size: 0.9em;">Total</div>
            </div>
        </div>
    `;
    container.appendChild(cardResumen);

    // Crear cards por hora (solo mostrar horas con datos)
    Object.keys(ventasPorHora).sort((a, b) => parseInt(a) - parseInt(b)).forEach(hora => {
        const datos = ventasPorHora[hora];

        const card = document.createElement('div');
        card.style.cssText = `
            background: rgba(40, 40, 40, 0.9);
            border: 1px solid rgba(255, 255, 255, 0.1);
            padding: 15px;
            border-radius: 10px;
            text-align: center;
            transition: all 0.3s ease;
            cursor: pointer;
        `;

        card.innerHTML = `
            <h4 style="color: #ffa502; margin-bottom: 10px;">⏰ ${hora.toString().padStart(2, '0')}:00</h4>
            <div style="color: #fff; font-size: 1.2em; font-weight: bold; margin-bottom: 5px;">${datos.pedidos} pedidos</div>
            <div style="color: #888; font-size: 0.9em;">€${datos.total.toFixed(2)}</div>
        `;

        card.onclick = () => filtrarPorHora(parseInt(hora));
        card.onmouseover = () => {
            card.style.transform = 'translateY(-3px)';
            card.style.borderColor = 'rgba(255, 107, 107, 0.5)';
        };
        card.onmouseout = () => {
            card.style.transform = 'translateY(0)';
            card.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        };

        container.appendChild(card);
    });
}

// Función para filtrar por hora específica
function filtrarPorHora(hora) {
    if (!document.getElementById('filtroHoraDesde')) return;

    document.getElementById('filtroHoraDesde').value = `${hora.toString().padStart(2, '0')}:00`;
    document.getElementById('filtroHoraHasta').value = `${hora.toString().padStart(2, '0')}:59`;
    aplicarFiltrosPedidos();
}

// Función para renderizar lista de pedidos
function renderizarListaPedidos() {
    const container = document.getElementById('listaPedidos');
    if (!container) return;

    container.innerHTML = '';

    if (pedidosFiltrados.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 40px; color: #888;">No hay pedidos que coincidan con los filtros</p>';
        return;
    }

    // Ordenar por fecha más reciente primero
    const pedidosOrdenados = [...pedidosFiltrados].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    pedidosOrdenados.forEach(pedido => {
        const fecha = new Date(pedido.fecha);
        const mesaConfig = mesasConfig.find(m => m.id === pedido.mesa);
        const nombreMesa = mesaConfig ? mesaConfig.nombre : `Mesa ${pedido.mesa}`;

        const item = document.createElement('div');
        item.style.cssText = `
            background: rgba(40, 40, 40, 0.9);
            border: 1px solid rgba(255, 255, 255, 0.1);
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 15px;
            transition: all 0.3s ease;
        `;

        // Agrupar productos para mostrar
        const productosAgrupados = {};
        pedido.items.forEach(item => {
            if (!productosAgrupados[item.id]) {
                productosAgrupados[item.id] = {
                    nombre: item.nombre,
                    precio: item.precio,
                    emoji: item.emoji,
                    cantidad: 0
                };
            }
            productosAgrupados[item.id].cantidad++;
        });

        const productosHtml = Object.values(productosAgrupados).map(prod => `
            <div style="display: flex; justify-content: space-between; padding: 5px 0;">
                <span>${prod.emoji} ${prod.cantidad}x ${prod.nombre}</span>
                <span style="color: #ffa502;">€${(prod.precio * prod.cantidad).toFixed(2)}</span>
            </div>
        `).join('');

        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <div style="display: flex; align-items: center; gap: 15px;">
                    <span style="font-size: 1.2em;">🧾</span>
                    <div>
                        <h4 style="color: #fff; margin: 0; font-size: 1.1em;">${nombreMesa}</h4>
                        <p style="color: #888; margin: 0; font-size: 0.9em;">
                            📅 ${fecha.toLocaleDateString('es-ES')} - 
                            ⏰ ${fecha.toLocaleTimeString('es-ES')}
                        </p>
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 1.3em; font-weight: bold; color: #ffa502;">€${pedido.total.toFixed(2)}</div>
                    <button onclick="verDetallePedido(${pedido.mesa}, '${pedido.fecha}')" style="background: #4a5568; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 12px; margin-top: 5px; transition: all 0.3s ease;">👁️ Ver Detalle</button>
                </div>
            </div>
            <div style="border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 15px;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">
                    ${productosHtml}
                </div>
            </div>
        `;

        item.onmouseover = () => {
            item.style.background = 'rgba(50, 50, 50, 0.9)';
            item.style.borderColor = 'rgba(255, 107, 107, 0.3)';
        };
        item.onmouseout = () => {
            item.style.background = 'rgba(40, 40, 40, 0.9)';
            item.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        };

        container.appendChild(item);
    });
}

// Función para ver detalle completo de pedido
function verDetallePedido(mesa, fecha) {
    const pedido = facturacion.find(p => p.mesa === mesa && p.fecha === fecha);
    if (!pedido) return;

    const fechaObj = new Date(pedido.fecha);
    const mesaConfig = mesasConfig.find(m => m.id === pedido.mesa);
    const nombreMesa = mesaConfig ? mesaConfig.nombre : `Mesa ${pedido.mesa}`;

    // Agrupar items por producto
    const itemsAgrupados = {};
    pedido.items.forEach(item => {
        if (!itemsAgrupados[item.id]) {
            itemsAgrupados[item.id] = {
                nombre: item.nombre,
                precio: item.precio,
                emoji: item.emoji,
                cantidad: 0
            };
        }
        itemsAgrupados[item.id].cantidad++;
    });

    const detalle = Object.values(itemsAgrupados).map(item =>
        `${item.emoji} ${item.cantidad}x ${item.nombre} - €${(item.precio * item.cantidad).toFixed(2)}`
    ).join('\n');

    const mensaje = `🧾 DETALLE DEL PEDIDO\n\n` +
        `🪑 Mesa: ${nombreMesa}\n` +
        `📅 Fecha: ${fechaObj.toLocaleDateString('es-ES')}\n` +
        `⏰ Hora: ${fechaObj.toLocaleTimeString('es-ES')}\n\n` +
        `📋 PRODUCTOS:\n${detalle}\n\n` +
        `💰 TOTAL: €${pedido.total.toFixed(2)}`;

    alert(mensaje);
}

// Función para exportar pedidos a CSV
function exportarPedidosCSV() {
    if (pedidosFiltrados.length === 0) {
        alert('No hay pedidos para exportar con los filtros actuales');
        return;
    }

    // Crear encabezados CSV
    const encabezados = ['Fecha', 'Hora', 'Mesa', 'Producto', 'Emoji', 'Cantidad', 'Precio Unitario', 'Precio Total', 'Total Pedido'];
    let csvContent = encabezados.join(',') + '\n';

    // Agregar datos
    pedidosFiltrados.forEach(pedido => {
        const fecha = new Date(pedido.fecha);
        const fechaStr = fecha.toLocaleDateString('es-ES');
        const horaStr = fecha.toLocaleTimeString('es-ES');
        const mesaConfig = mesasConfig.find(m => m.id === pedido.mesa);
        const nombreMesa = mesaConfig ? mesaConfig.nombre : `Mesa ${pedido.mesa}`;

        // Agrupar productos
        const productosAgrupados = {};
        pedido.items.forEach(item => {
            if (!productosAgrupados[item.id]) {
                productosAgrupados[item.id] = {
                    nombre: item.nombre,
                    precio: item.precio,
                    emoji: item.emoji,
                    cantidad: 0
                };
            }
            productosAgrupados[item.id].cantidad++;
        });

        // Agregar cada producto agrupado
        Object.values(productosAgrupados).forEach(prod => {
            const fila = [
                fechaStr,
                horaStr,
                `"${nombreMesa}"`,
                `"${prod.nombre}"`,
                prod.emoji,
                prod.cantidad,
                prod.precio.toFixed(2),
                (prod.precio * prod.cantidad).toFixed(2),
                pedido.total.toFixed(2)
            ];
            csvContent += fila.join(',') + '\n';
        });
    });

    // Crear y descargar archivo
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);

    const fechaActual = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `pedidos_${fechaActual}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    mostrarNotificacion('📥 Pedidos exportados a CSV correctamente');
}

// ========================================
// BÚSQUEDAS AVANZADAS PARA PREMIUM
// ========================================

// Función de búsqueda avanzada para usuarios Premium
async function busquedaAvanzadaPremium(criterios) {
    const licencia = obtenerEstadoLicencia();

    if (licencia.tipo !== 'premium' && licencia.tipo !== 'pro') {
        mostrarModalPremium();
        return [];
    }

    try {
        const resultados = await DB.busquedaAvanzada(criterios);
        return resultados;
    } catch (error) {
        console.error('Error en búsqueda avanzada:', error);
        alert(error.message);
        return [];
    }
}

// Función para mostrar panel de búsqueda avanzada
function mostrarPanelBusquedaAvanzada() {
    const licencia = obtenerEstadoLicencia();

    if (licencia.tipo === 'standard' || licencia.tipo === 'standard-pagado') {
        const contenedor = document.createElement('div');
        contenedor.innerHTML = `
            <div style="background: linear-gradient(135deg, rgba(255, 107, 107, 0.1), rgba(255, 165, 2, 0.1)); 
                        border: 2px solid rgba(255, 165, 2, 0.5); 
                        padding: 30px; 
                        border-radius: 20px; 
                        text-align: center; 
                        margin: 20px 0;">
                <h3 style="color: #ffa502; margin-bottom: 20px;">🔍 Búsquedas Avanzadas</h3>
                <p style="color: #e0e0e0; margin-bottom: 20px;">
                    Encuentra exactamente lo que buscas con filtros avanzados por producto, 
                    rango de precios, horarios y más.
                </p>
                <button class="btn-warning" onclick="mostrarModalPremium()">
                    ⭐ Desbloquear con Pro/Premium
                </button>
            </div>
        `;
        return contenedor;
    }

    // Si es Pro o Premium, mostrar el panel completo
    const panel = document.createElement('div');
    panel.innerHTML = `
        <div style="background: rgba(30, 30, 30, 0.9); padding: 20px; border-radius: 15px; margin: 20px 0;">
            <h3 style="color: #ffa502; margin-bottom: 20px;">🔍 Búsqueda Avanzada</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                <div>
                    <label>Producto específico:</label>
                    <select id="busquedaProducto" style="width: 100%; padding: 10px; background: rgba(40, 40, 40, 0.9); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; color: white;">
                        <option value="">Todos</option>
                        ${productos.map(p => `<option value="${p.id}">${p.emoji} ${p.nombre}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label>Rango de total:</label>
                    <div style="display: flex; gap: 10px;">
                        <input type="number" id="totalMin" placeholder="Min" style="width: 50%; padding: 10px; background: rgba(40, 40, 40, 0.9); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; color: white;">
                        <input type="number" id="totalMax" placeholder="Max" style="width: 50%; padding: 10px; background: rgba(40, 40, 40, 0.9); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; color: white;">
                    </div>
                </div>
                <div>
                    <label>Método de pago:</label>
                    <select id="busquedaMetodoPago" style="width: 100%; padding: 10px; background: rgba(40, 40, 40, 0.9); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; color: white;">
                        <option value="">Todos</option>
                        <option value="efectivo">Efectivo</option>
                        <option value="tarjeta">Tarjeta</option>
                        <option value="bizum">Bizum</option>
                        <option value="transferencia">Transferencia</option>
                    </select>
                </div>
                <button class="btn-success" onclick="ejecutarBusquedaAvanzada()">🔍 Buscar</button>
            </div>
        </div>
    `;
    return panel;
}

// Función para ejecutar búsqueda avanzada
async function ejecutarBusquedaAvanzada() {
    const productoId = parseInt(document.getElementById('busquedaProducto').value) || null;
    const totalMin = parseFloat(document.getElementById('totalMin').value) || null;
    const totalMax = parseFloat(document.getElementById('totalMax').value) || null;
    const metodoPago = document.getElementById('busquedaMetodoPago').value || null;

    const criterios = {};

    if (productoId) criterios.productoId = productoId;
    if (totalMin !== null || totalMax !== null) {
        criterios.rangoTotal = {
            min: totalMin || 0,
            max: totalMax || 999999
        };
    }
    if (metodoPago) criterios.metodoPago = metodoPago;

    const resultados = await busquedaAvanzadaPremium(criterios);

    // Mostrar resultados
    pedidosFiltrados = resultados;
    renderizarListaPedidos();
    actualizarEstadisticasHora();

    mostrarNotificacion(`🔍 Se encontraron ${resultados.length} resultados`);
}



// Función auxiliar para formatear fechas
function formatearFecha(fecha) {
    const opciones = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    };
    return new Date(fecha).toLocaleDateString('es-ES', opciones);
}

// Función para obtener el nombre de la mesa por ID
function obtenerNombreMesa(mesaId) {
    const mesaConfig = mesasConfig.find(m => m.id === mesaId);
    return mesaConfig ? mesaConfig.nombre : `Mesa ${mesaId}`;
}

// Función para actualizar contadores en tiempo real
function actualizarContadoresEnTiempoReal() {
    if (document.getElementById('estadisticasHora')) {
        const hoy = new Date().toISOString().split('T')[0];
        const fechaFiltro = document.getElementById('filtroFecha').value;

        if (fechaFiltro === hoy) {
            // Solo actualizar si estamos viendo el día actual
            setTimeout(() => {
                aplicarFiltrosPedidos();
            }, 1000);
        }
    }
}

// Función para validar filtros
function validarFiltros() {
    const fechaDesde = document.getElementById('filtroFecha').value;
    const horaDesde = document.getElementById('filtroHoraDesde').value;
    const horaHasta = document.getElementById('filtroHoraHasta').value;

    if (horaDesde && horaHasta) {
        const [horaD, minD] = horaDesde.split(':').map(Number);
        const [horaH, minH] = horaHasta.split(':').map(Number);

        const minutosDesde = horaD * 60 + minD;
        const minutosHasta = horaH * 60 + minH;

        if (minutosDesde >= minutosHasta) {
            alert('La hora "desde" debe ser anterior a la hora "hasta"');
            return false;
        }
    }

    return true;
}

// Mejorar la función aplicarFiltrosPedidos con validación
const aplicarFiltrosPedidosOriginal = aplicarFiltrosPedidos;
aplicarFiltrosPedidos = function () {
    if (!validarFiltros()) return;
    aplicarFiltrosPedidosOriginal();
};

// Función para mostrar estadísticas adicionales
function mostrarEstadisticasDetalladas() {
    if (pedidosFiltrados.length === 0) return;

    const productosVendidos = {};
    let totalItems = 0;

    pedidosFiltrados.forEach(pedido => {
        pedido.items.forEach(item => {
            if (!productosVendidos[item.nombre]) {
                productosVendidos[item.nombre] = {
                    cantidad: 0,
                    total: 0,
                    emoji: item.emoji
                };
            }
            productosVendidos[item.nombre].cantidad++;
            productosVendidos[item.nombre].total += item.precio;
            totalItems++;
        });
    });

    // Producto más vendido
    const productoMasVendido = Object.entries(productosVendidos)
        .sort((a, b) => b[1].cantidad - a[1].cantidad)[0];

    if (productoMasVendido) {
        console.log(`📊 Producto más vendido: ${productoMasVendido[1].emoji} ${productoMasVendido[0]} (${productoMasVendido[1].cantidad} unidades)`);
    }

    console.log(`📊 Total de items vendidos: ${totalItems}`);
    console.log(`📊 Promedio por pedido: ${(totalItems / pedidosFiltrados.length).toFixed(2)} items`);
}

// Ejecutar estadísticas detalladas cada vez que se actualicen los filtros
const renderizarListaPedidosOriginal = renderizarListaPedidos;
renderizarListaPedidos = function () {
    renderizarListaPedidosOriginal();
    mostrarEstadisticasDetalladas();
};

// Asegurar que la función cobrarMesa actualice los pedidos
const cobrarMesaOriginal = cobrarMesa;
cobrarMesa = function () {
    cobrarMesaOriginal();

    // Actualizar pedidos si estamos en la pestaña de pedidos
    if (document.getElementById('pedidos') && document.getElementById('pedidos').classList.contains('active')) {
        setTimeout(() => {
            actualizarTabPedidos();
        }, 500);
    }
};

// Event listeners para filtros en tiempo real
document.addEventListener('DOMContentLoaded', function () {
    // Agregar event listeners cuando se cargue la página
    setTimeout(() => {
        const filtroFecha = document.getElementById('filtroFecha');
        const filtroMesa = document.getElementById('filtroMesa');
        const filtroHoraDesde = document.getElementById('filtroHoraDesde');
        const filtroHoraHasta = document.getElementById('filtroHoraHasta');

        if (filtroFecha) {
            filtroFecha.addEventListener('change', aplicarFiltrosPedidos);
        }
        if (filtroMesa) {
            filtroMesa.addEventListener('change', aplicarFiltrosPedidos);
        }
        if (filtroHoraDesde) {
            filtroHoraDesde.addEventListener('change', aplicarFiltrosPedidos);
        }
        if (filtroHoraHasta) {
            filtroHoraHasta.addEventListener('change', aplicarFiltrosPedidos);
        }
    }, 1000);
});

// Función para limpiar filtros con animación
const limpiarFiltrosPedidosOriginal = limpiarFiltrosPedidos;
limpiarFiltrosPedidos = function () {
    // Mostrar notificación
    mostrarNotificacion('🔄 Filtros limpiados');

    // Ejecutar función original
    limpiarFiltrosPedidosOriginal();

    // Establecer fecha actual nuevamente
    const hoy = new Date();
    if (document.getElementById('filtroFecha')) {
        document.getElementById('filtroFecha').value = hoy.toISOString().split('T')[0];
    }

    // Aplicar filtros
    aplicarFiltrosPedidos();
};


function editarStockProducto(id) {
    // Usar el modal de ajuste de stock en lugar de prompt
    abrirModalAjusteStockProducto(id);
}

// Función para mostrar alertas de stock al iniciar
function verificarStockGeneral() {
    const sinStock = obtenerProductosSinStock();
    const bajoStock = obtenerProductosBajoStock();

    if (sinStock.length > 0) {
        console.warn('🔴 Productos sin stock:', sinStock.map(p => p.nombre));
    }

    if (bajoStock.length > 0) {
        console.warn('🟡 Productos con stock bajo:', bajoStock.map(p => `${p.nombre} (${p.stock})`));
    }
}

// Llamar verificación al cargar
const originalWindowOnload = window.onload;
window.onload = function () {
    if (originalWindowOnload) originalWindowOnload();
    setTimeout(verificarStockGeneral, 1000);
};

// ========================================
// FUNCIONES DE GESTIÓN DE INVENTARIO
// ========================================

// Variable para almacenar historial de movimientos
historialMovimientos = JSON.parse(localStorage.getItem('historialMovimientos')) || [];
let productoAjustandoId = null;

// Función para actualizar la pestaña de inventario
// Función para actualizar la pestaña de inventario
function actualizarTabInventario() {
    actualizarAlertasInventario();
    renderizarInventario();

    // Configurar teclado para el campo de búsqueda si está activado
    if (esDispositivoTactil()) {
        setTimeout(() => {
            const inputBusqueda = document.getElementById('buscarProducto');
            if (inputBusqueda) {
                inputBusqueda.readOnly = true;

                // Remover listeners anteriores
                const newInput = inputBusqueda.cloneNode(true);
                inputBusqueda.parentNode.replaceChild(newInput, inputBusqueda);

                // Agregar listener para teclado
                newInput.addEventListener('click', function (e) {
                    e.preventDefault();
                    this.blur();
                    abrirTecladoCompleto(this);
                });

                // También en focus por si acaso
                newInput.addEventListener('focus', function (e) {
                    e.preventDefault();
                    this.blur();
                    abrirTecladoCompleto(this);
                });
            }
        }, 200);
    }
}

// Función para mostrar alertas de inventario
function actualizarAlertasInventario() {
    const container = document.getElementById('alertasInventario');
    if (!container) return;

    const sinStock = obtenerProductosSinStock();
    const bajoStock = obtenerProductosBajoStock();

    container.innerHTML = '';

    if (sinStock.length > 0 || bajoStock.length > 0) {
        const alertCard = document.createElement('div');
        alertCard.style.cssText = `
            background: rgba(255, 107, 107, 0.1);
            border: 1px solid rgba(255, 107, 107, 0.3);
            padding: 20px;
            border-radius: 15px;
            margin-bottom: 25px;
        `;

        let alertContent = '<h3 style="color: #ff6b6b; margin-bottom: 15px;">⚠️ Alertas de Inventario</h3>';

        if (sinStock.length > 0) {
            alertContent += `
                <div style="margin-bottom: 10px;">
                    <strong style="color: #ff6b6b;">🔴 Sin Stock (${sinStock.length}):</strong>
                    <span style="color: #e0e0e0;">${sinStock.map(p => p.nombre).join(', ')}</span>
                </div>
            `;
        }

        if (bajoStock.length > 0) {
            alertContent += `
                <div>
                    <strong style="color: #ffa502;">🟡 Stock Bajo (${bajoStock.length}):</strong>
                    <span style="color: #e0e0e0;">${bajoStock.map(p => `${p.nombre} (${p.stock})`).join(', ')}</span>
                </div>
            `;
        }

        alertCard.innerHTML = alertContent;
        container.appendChild(alertCard);
    }
}

// Función para renderizar inventario
function renderizarInventario() {
    const container = document.getElementById('listaInventario');
    if (!container) return;

    container.innerHTML = '';

    // Obtener productos filtrados
    const productosFiltrados = obtenerProductosFiltrados();

    if (productosFiltrados.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 40px; color: #888;">No hay productos que coincidan con los filtros</p>';
        return;
    }

    productosFiltrados.forEach(producto => {
        const item = document.createElement('div');
        item.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            transition: all 0.3s ease;
        `;

        const stockColor = producto.stock <= 0 ? '#ff6b6b' :
            producto.stock <= producto.stockMinimo ? '#ffa502' : '#22c55e';

        const stockIcon = producto.stock <= 0 ? '🔴' :
            producto.stock <= producto.stockMinimo ? '🟡' : '🟢';

        const stockStatus = producto.stock <= 0 ? 'SIN STOCK' :
            producto.stock <= producto.stockMinimo ? 'STOCK BAJO' : 'STOCK OK';

        item.innerHTML = `
            <div style="flex: 1;">
                <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 8px;">
                    <span style="font-size: 1.5em;">${producto.emoji}</span>
                    <div>
                        <h4 style="color: #fff; margin: 0; font-size: 1.1em;">${producto.nombre}</h4>
                        <div style="font-size: 0.9em; color: #888; margin-top: 2px;">
                            Precio: €${producto.precio.toFixed(2)} • 
                            ${producto.area ? `📍 ${obtenerNombreArea(producto.area)} • ` : ''}
                            📂 ${obtenerNombreCategoria(producto.categoria)}
                        </div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 20px;">
                    <div>
                        <span style="color: ${stockColor}; font-weight: bold;">${stockIcon} ${producto.stock} unidades</span>
                        <span style="color: #666; margin-left: 10px;">(Mín: ${producto.stockMinimo})</span>
                    </div>
                    <div style="background: ${stockColor}20; color: ${stockColor}; padding: 4px 12px; border-radius: 20px; font-size: 0.8em; font-weight: bold;">
                        ${stockStatus}
                    </div>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
                <button onclick="ajustarStockRapido(${producto.id}, 'reducir')" 
                    style="background: #ef4444; color: white; border: none; padding: 8px 12px; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: bold;">➖</button>
                <button onclick="ajustarStockRapido(${producto.id}, 'agregar')" 
                    style="background: #22c55e; color: white; border: none; padding: 8px 12px; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: bold;">➕</button>
                <button onclick="abrirModalAjusteStockProducto(${producto.id})" 
                    style="background: #4a5568; color: white; border: none; padding: 8px 15px; border-radius: 8px; cursor: pointer; font-size: 14px;">⚖️ Ajustar</button>
            </div>
        `;

        item.onmouseover = () => {
            item.style.background = 'rgba(50, 50, 50, 0.5)';
        };
        item.onmouseout = () => {
            item.style.background = 'transparent';
        };

        container.appendChild(item);
    });
}

// Función para obtener productos filtrados
function obtenerProductosFiltrados() {
    const busqueda = document.getElementById('buscarProducto')?.value.toLowerCase() || '';
    const filtroStock = document.getElementById('filtroStock')?.value || 'todos';
    const filtroCategoria = document.getElementById('filtroCategoria')?.value || 'todos';
    const filtroArea = document.getElementById('filtroArea')?.value || 'todos';

    return productos.filter(producto => {
        // Filtro de búsqueda
        const coincideBusqueda = producto.nombre.toLowerCase().includes(busqueda);

        // Filtro de stock
        let coincideStock = true;
        if (filtroStock === 'agotado') {
            coincideStock = producto.stock <= 0;
        } else if (filtroStock === 'bajo') {
            coincideStock = producto.stock > 0 && producto.stock <= producto.stockMinimo;
        } else if (filtroStock === 'normal') {
            coincideStock = producto.stock > producto.stockMinimo;
        }

        // Filtro de categoría
        const coincideCategoria = filtroCategoria === 'todos' || producto.categoria === filtroCategoria;

        // Filtro de área
        let coincideArea = true;
        if (filtroArea === 'todos') {
            coincideArea = true;
        } else if (filtroArea === 'sin_area') {
            coincideArea = !producto.area || producto.area === '';
        } else {
            coincideArea = producto.area === filtroArea;
        }

        return coincideBusqueda && coincideStock && coincideCategoria && coincideArea;
    });
}

// Función para filtrar inventario
function filtrarInventario() {
    renderizarInventario();
}

// Función para limpiar filtros
function limpiarFiltrosInventario() {
    document.getElementById('buscarProducto').value = '';
    document.getElementById('filtroStock').value = 'todos';
    document.getElementById('filtroCategoria').value = 'todos';
    const filtroArea = document.getElementById('filtroArea');
    if (filtroArea) filtroArea.value = 'todos';
    renderizarInventario();
    mostrarNotificacion('🔄 Filtros de inventario limpiados');
}

// Función para ajuste rápido de stock
function ajustarStockRapido(productoId, tipo) {
    const producto = productos.find(p => p.id === productoId);
    if (!producto) return;

    const stockAnterior = producto.stock;

    if (tipo === 'agregar') {
        producto.stock += 1;
    } else if (tipo === 'reducir' && producto.stock > 0) {
        producto.stock -= 1;
    } else {
        mostrarNotificacion('❌ No se puede reducir el stock por debajo de 0');
        return;
    }

    // Registrar movimiento
    registrarMovimientoStock(producto, stockAnterior, producto.stock, `Ajuste rápido: ${tipo === 'agregar' ? 'Agregar' : 'Reducir'} 1 unidad`);

    // Guardar y actualizar
    localStorage.setItem('productosPersonalizados', JSON.stringify(productos));
    renderizarInventario();
    actualizarAlertasInventario();

    const emoji = tipo === 'agregar' ? '📈' : '📉';
    mostrarNotificacion(`${emoji} ${producto.nombre}: ${stockAnterior} → ${producto.stock}`);
}

// Función para abrir modal de ajuste de stock
function abrirModalAjusteStockProducto(productoId) {
    const producto = productos.find(p => p.id === productoId);
    if (!producto) return;

    productoAjustandoId = productoId;

    document.getElementById('nombreProductoAjuste').textContent = `${producto.emoji} ${producto.nombre}`;
    document.getElementById('stockActualAjuste').textContent = `Stock actual: ${producto.stock} unidades`;
    document.getElementById('tipoAjuste').value = 'establecer';
    document.getElementById('cantidadAjuste').value = '';
    document.getElementById('motivoAjuste').value = '';

    toggleCamposAjuste();
    document.getElementById('modalAjusteStock').style.display = 'block';

    // Configurar teclados virtuales si están activados
    if (esDispositivoTactil()) {
        setTimeout(() => {
            // Campo de cantidad - Teclado numérico
            const inputCantidad = document.getElementById('cantidadAjuste');
            if (inputCantidad) {
                inputCantidad.readOnly = true;
                const newInputCantidad = inputCantidad.cloneNode(true);
                inputCantidad.parentNode.replaceChild(newInputCantidad, inputCantidad);

                newInputCantidad.addEventListener('click', function (e) {
                    e.preventDefault();
                    this.blur();
                    abrirTecladoNumerico(this);
                });
            }

            // Campo de motivo - Teclado completo
            const inputMotivo = document.getElementById('motivoAjuste');
            if (inputMotivo) {
                inputMotivo.readOnly = true;
                const newInputMotivo = inputMotivo.cloneNode(true);
                inputMotivo.parentNode.replaceChild(newInputMotivo, inputMotivo);

                newInputMotivo.addEventListener('click', function (e) {
                    e.preventDefault();
                    this.blur();
                    abrirTecladoCompleto(this);
                });
            }
        }, 200);
    } else {
        // Si no es táctil, hacer focus normal
        setTimeout(() => {
            document.getElementById('cantidadAjuste').focus();
        }, 100);
    }
}

// Función para mostrar modal de ajuste general
function abrirModalAjusteStock() {
    // Si no hay un producto específico, mostrar lista para seleccionar
    if (productos.length === 0) {
        alert('No hay productos registrados');
        return;
    }

    // Abrir con el primer producto como ejemplo
    abrirModalAjusteStockProducto(productos[0].id);
}

// Función para cambiar campos según tipo de ajuste
function toggleCamposAjuste() {
    const tipo = document.getElementById('tipoAjuste').value;
    const labelCantidad = document.getElementById('labelCantidad');

    if (tipo === 'establecer') {
        labelCantidad.textContent = '📦 Nueva cantidad total:';
    } else if (tipo === 'agregar') {
        labelCantidad.textContent = '➕ Cantidad a agregar:';
    } else if (tipo === 'reducir') {
        labelCantidad.textContent = '➖ Cantidad a reducir:';
    }

    actualizarPrevisualizacionAjuste();
}

// Función para actualizar previsualización
function actualizarPrevisualizacionAjuste() {
    if (!productoAjustandoId) return;

    const producto = productos.find(p => p.id === productoAjustandoId);
    if (!producto) return;

    const tipo = document.getElementById('tipoAjuste').value;
    const cantidad = parseInt(document.getElementById('cantidadAjuste').value) || 0;

    document.getElementById('stockPrevioAjuste').textContent = producto.stock;

    let nuevoStock = producto.stock;

    if (tipo === 'establecer') {
        nuevoStock = cantidad;
    } else if (tipo === 'agregar') {
        nuevoStock = producto.stock + cantidad;
    } else if (tipo === 'reducir') {
        nuevoStock = Math.max(0, producto.stock - cantidad);
    }

    const elemento = document.getElementById('stockResultanteAjuste');
    elemento.textContent = nuevoStock;

    // Cambiar color según el resultado
    if (nuevoStock <= 0) {
        elemento.style.color = '#ff6b6b';
    } else if (nuevoStock <= producto.stockMinimo) {
        elemento.style.color = '#ffa502';
    } else {
        elemento.style.color = '#22c55e';
    }
}

// Event listener para actualizar previsualización en tiempo real
document.addEventListener('DOMContentLoaded', function () {
    setTimeout(() => {
        const cantidadInput = document.getElementById('cantidadAjuste');
        if (cantidadInput) {
            cantidadInput.addEventListener('input', actualizarPrevisualizacionAjuste);
        }
    }, 1000);
});

// Función para confirmar ajuste de stock
function confirmarAjusteStock() {
    if (!productoAjustandoId) return;

    const producto = productos.find(p => p.id === productoAjustandoId);
    if (!producto) return;

    const tipo = document.getElementById('tipoAjuste').value;
    const cantidad = parseInt(document.getElementById('cantidadAjuste').value);
    const motivo = document.getElementById('motivoAjuste').value.trim() || 'Ajuste manual';

    if (isNaN(cantidad) || cantidad < 0) {
        alert('Por favor ingresa una cantidad válida');
        return;
    }

    const stockAnterior = producto.stock;
    let nuevoStock = stockAnterior;

    if (tipo === 'establecer') {
        nuevoStock = cantidad;
    } else if (tipo === 'agregar') {
        nuevoStock = stockAnterior + cantidad;
    } else if (tipo === 'reducir') {
        nuevoStock = Math.max(0, stockAnterior - cantidad);
        if (stockAnterior - cantidad < 0) {
            if (!confirm(`La cantidad a reducir (${cantidad}) es mayor al stock actual (${stockAnterior}).\n¿Establecer stock en 0?`)) {
                return;
            }
        }
    }

    // Actualizar stock
    producto.stock = nuevoStock;

    // Registrar movimiento
    const descripcionMovimiento = `${tipo.charAt(0).toUpperCase() + tipo.slice(1)}: ${motivo}`;
    registrarMovimientoStock(producto, stockAnterior, nuevoStock, descripcionMovimiento);

    // Guardar y actualizar interfaces
    localStorage.setItem('productosPersonalizados', JSON.stringify(productos));
    renderizarInventario();
    actualizarAlertasInventario();
    renderizarListaProductos(); // Actualizar pestaña de configuración si está abierta

    // Cerrar modal
    cerrarModalAjusteStock();

    // Mostrar notificación
    const emoji = nuevoStock > stockAnterior ? '📈' : nuevoStock < stockAnterior ? '📉' : '📊';
    mostrarNotificacion(`${emoji} ${producto.nombre}: Stock ajustado de ${stockAnterior} a ${nuevoStock}`);
}

// Función para cerrar modal de ajuste
function cerrarModalAjusteStock() {
    document.getElementById('modalAjusteStock').style.display = 'none';
    productoAjustandoId = null;

    // Limpiar campos
    document.getElementById('cantidadAjuste').value = '';
    document.getElementById('motivoAjuste').value = '';
    document.getElementById('tipoAjuste').value = 'establecer';
}

// Función para registrar movimiento de stock
async function registrarMovimientoStock(producto, stockAnterior, stockNuevo, descripcion) {
    const movimiento = {
        fecha: new Date().toISOString(),
        productoId: producto.id,
        productoNombre: producto.nombre,
        productoEmoji: producto.emoji,
        stockAnterior: stockAnterior,
        stockNuevo: stockNuevo,
        diferencia: stockNuevo - stockAnterior,
        descripcion: descripcion,
        usuario: 'Sistema',
        tipo: stockNuevo > stockAnterior ? 'entrada' : 'salida'
    };

    try {
        // Guardar en IndexedDB
        await DB.guardarMovimiento(movimiento);

        // También mantener en memoria para compatibilidad
        historialMovimientos.unshift(movimiento);
        if (historialMovimientos.length > 500) {
            historialMovimientos = historialMovimientos.slice(0, 500);
        }
    } catch (error) {
        console.error('Error al guardar movimiento:', error);
    }
}
// Función para abrir modal de reabastecimiento
function abrirModalReabastecimiento() {
    const productosAReabastecer = productos.filter(p => p.stock <= p.stockMinimo);

    if (productosAReabastecer.length === 0) {
        alert('✅ No hay productos que necesiten reabastecimiento.\nTodos los productos tienen stock suficiente.');
        return;
    }

    // Actualizar lista de productos a reabastecer
    const lista = document.getElementById('listaReabastecimiento');
    lista.innerHTML = '';

    productosAReabastecer.forEach(producto => {
        const item = document.createElement('div');
        item.style.cssText = `
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        `;

        const stockColor = producto.stock <= 0 ? '#ff6b6b' : '#ffa502';

        item.innerHTML = `
            <span>${producto.emoji} ${producto.nombre}</span>
            <span style="color: ${stockColor};">Stock: ${producto.stock} (Mín: ${producto.stockMinimo})</span>
        `;

        lista.appendChild(item);
    });

    document.getElementById('modalReabastecimiento').style.display = 'block';

    setTimeout(() => {
        document.getElementById('cantidadObjetivo').focus();
        document.getElementById('cantidadObjetivo').select();
    }, 100);
}

// Función para confirmar reabastecimiento masivo
function confirmarReabastecimiento() {
    const cantidadObjetivo = parseInt(document.getElementById('cantidadObjetivo').value);
    const motivo = document.getElementById('motivoReabastecimiento').value.trim() || 'Reabastecimiento automático';

    if (isNaN(cantidadObjetivo) || cantidadObjetivo <= 0) {
        alert('Por favor ingresa una cantidad objetivo válida');
        return;
    }

    const productosAReabastecer = productos.filter(p => p.stock <= p.stockMinimo);

    if (productosAReabastecer.length === 0) {
        alert('No hay productos que necesiten reabastecimiento');
        return;
    }

    if (!confirm(`¿Reabastecer ${productosAReabastecer.length} productos a ${cantidadObjetivo} unidades cada uno?`)) {
        return;
    }

    let productosActualizados = 0;

    productosAReabastecer.forEach(producto => {
        const stockAnterior = producto.stock;
        producto.stock = cantidadObjetivo;

        registrarMovimientoStock(producto, stockAnterior, cantidadObjetivo, `Reabastecimiento masivo: ${motivo}`);
        productosActualizados++;
    });

    // Guardar y actualizar
    localStorage.setItem('productosPersonalizados', JSON.stringify(productos));
    renderizarInventario();
    actualizarAlertasInventario();
    renderizarListaProductos();

    // Cerrar modal
    cerrarModalReabastecimiento();

    // Mostrar notificación
    mostrarNotificacion(`📈 Reabastecimiento completado: ${productosActualizados} productos actualizados a ${cantidadObjetivo} unidades`);
}

// Función para cerrar modal de reabastecimiento
function cerrarModalReabastecimiento() {
    document.getElementById('modalReabastecimiento').style.display = 'none';

    // Resetear campos
    document.getElementById('cantidadObjetivo').value = '50';
    document.getElementById('motivoReabastecimiento').value = 'Reabastecimiento automático';
}

// Función para mostrar historial de movimientos
function mostrarHistorialMovimientos() {
    if (historialMovimientos.length === 0) {
        alert('📋 No hay movimientos de stock registrados');
        return;
    }

    // Crear ventana emergente con historial
    const ventana = window.open('', 'historial', 'width=800,height=600,scrollbars=yes');

    const movimientosRecientes = historialMovimientos.slice(0, 50); // Últimos 50 movimientos

    let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Historial de Movimientos de Stock</title>
            <style>
                body { 
                    font-family: 'Inter', sans-serif; 
                    background: #0a0a0a; 
                    color: #e0e0e0; 
                    margin: 20px; 
                }
                h1 { 
                    color: #ffa502; 
                    text-align: center; 
                    margin-bottom: 30px; 
                }
                table { 
                    width: 100%; 
                    border-collapse: collapse; 
                    background: rgba(20, 20, 20, 0.9); 
                    border-radius: 10px; 
                    overflow: hidden;
                }
                th, td { 
                    padding: 12px; 
                    text-align: left; 
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1); 
                }
                th { 
                    background: rgba(255, 107, 107, 0.2); 
                    font-weight: bold; 
                }
                .positivo { color: #22c55e; }
                .negativo { color: #ff6b6b; }
                .neutro { color: #888; }
                .fecha { font-size: 0.9em; color: #888; }
            </style>
        </head>
        <body>
            <h1>📋 Historial de Movimientos de Stock</h1>
            <p style="text-align: center; color: #888; margin-bottom: 20px;">
                Mostrando los últimos ${movimientosRecientes.length} movimientos
            </p>
            <table>
                <thead>
                    <tr>
                        <th>Fecha/Hora</th>
                        <th>Producto</th>
                        <th>Stock Anterior</th>
                        <th>Stock Nuevo</th>
                        <th>Diferencia</th>
                        <th>Descripción</th>
                    </tr>
                </thead>
                <tbody>
    `;

    movimientosRecientes.forEach(mov => {
        const fecha = new Date(mov.fecha);
        const fechaFormateada = fecha.toLocaleDateString('es-ES') + ' ' + fecha.toLocaleTimeString('es-ES');
        const diferenciaClass = mov.diferencia > 0 ? 'positivo' : mov.diferencia < 0 ? 'negativo' : 'neutro';
        const diferenciaTexto = mov.diferencia > 0 ? `+${mov.diferencia}` : mov.diferencia.toString();

        html += `
            <tr>
                <td class="fecha">${fechaFormateada}</td>
                <td>${mov.productoEmoji} ${mov.productoNombre}</td>
                <td>${mov.stockAnterior}</td>
                <td>${mov.stockNuevo}</td>
                <td class="${diferenciaClass}"><strong>${diferenciaTexto}</strong></td>
                <td>${mov.descripcion}</td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
            <div style="text-align: center; margin-top: 20px;">
                <button onclick="window.close()" style="
                    background: #4a5568; 
                    color: white; 
                    border: none; 
                    padding: 10px 20px; 
                    border-radius: 8px; 
                    cursor: pointer; 
                    font-size: 14px;
                ">Cerrar</button>
            </div>
        </body>
        </html>
    `;

    ventana.document.write(html);
    ventana.document.close();
}

// Función para exportar inventario a CSV
function exportarInventarioCSV() {
    if (productos.length === 0) {
        alert('No hay productos para exportar');
        return;
    }

    // Crear encabezados CSV
    const encabezados = ['ID', 'Nombre', 'Emoji', 'Precio', 'Stock Actual', 'Stock Mínimo', 'Categoría', 'Estado', 'Valor Total'];
    let csvContent = encabezados.join(',') + '\n';

    // Agregar datos de productos
    productos.forEach(producto => {
        const estado = producto.stock <= 0 ? 'SIN STOCK' :
            producto.stock <= producto.stockMinimo ? 'STOCK BAJO' : 'STOCK OK';
        const valorTotal = (producto.precio * producto.stock).toFixed(2);

        const fila = [
            producto.id,
            `"${producto.nombre}"`,
            producto.emoji,
            producto.precio.toFixed(2),
            producto.stock,
            producto.stockMinimo,
            producto.categoria,
            estado,
            valorTotal
        ];
        csvContent += fila.join(',') + '\n';
    });

    // Agregar resumen al final
    csvContent += '\n';
    csvContent += 'RESUMEN,,,,,,,\n';
    csvContent += `Total Productos,${productos.length},,,,,,\n`;
    csvContent += `Sin Stock,${obtenerProductosSinStock().length},,,,,,\n`;
    csvContent += `Stock Bajo,${obtenerProductosBajoStock().length},,,,,,\n`;

    const valorTotalInventario = productos.reduce((total, p) => total + (p.precio * p.stock), 0);
    csvContent += `Valor Total Inventario,€${valorTotalInventario.toFixed(2)},,,,,,\n`;

    // Crear y descargar archivo
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);

    const fechaActual = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `inventario_${fechaActual}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    mostrarNotificacion('📥 Inventario exportado a CSV correctamente');
}

// Event listeners para modales de inventario
window.addEventListener('click', function (event) {
    const modalAjuste = document.getElementById('modalAjusteStock');
    const modalReabastecimiento = document.getElementById('modalReabastecimiento');

    if (event.target == modalAjuste) {
        cerrarModalAjusteStock();
    }
    if (event.target == modalReabastecimiento) {
        cerrarModalReabastecimiento();
    }
});

// Atajos de teclado para modales de inventario
document.addEventListener('keydown', function (event) {
    // Modal de ajuste de stock
    const modalAjuste = document.getElementById('modalAjusteStock');
    if (modalAjuste && modalAjuste.style.display === 'block') {
        if (event.key === 'Escape') {
            cerrarModalAjusteStock();
        }
        if (event.key === 'Enter') {
            confirmarAjusteStock();
        }
    }

    // Modal de reabastecimiento
    const modalReabastecimiento = document.getElementById('modalReabastecimiento');
    if (modalReabastecimiento && modalReabastecimiento.style.display === 'block') {
        if (event.key === 'Escape') {
            cerrarModalReabastecimiento();
        }
        if (event.key === 'Enter') {
            confirmarReabastecimiento();
        }
    }
});
// ========================================
// SISTEMA DE TECLADO VIRTUAL
// ========================================

// Variables para el teclado
let inputActivo = null;
let tipoTecladoActivo = null;

// Función para detectar si es un dispositivo táctil
// Función para detectar si es un dispositivo táctil
function esDispositivoTactil() {
    // Primero verificar si el usuario ha activado el teclado virtual
    const tecladoActivado = localStorage.getItem('tecladoVirtualActivado') === 'true';

    // Si está activado manualmente, siempre mostrar
    if (tecladoActivado) {
        return true;
    }

    // Si no está activado, no mostrar nunca
    return false;
}

// Función para toggle del teclado virtual
function toggleTecladoVirtual() {
    const checkbox = document.getElementById('toggleTecladoVirtual');
    const estado = checkbox.checked;

    // Guardar preferencia
    localStorage.setItem('tecladoVirtualActivado', estado);

    // Actualizar UI
    actualizarEstadoTecladoUI(estado);

    // Reconfigurar inputs
    configurarTecladosVirtuales();

    // Mostrar notificación
    if (estado) {
        mostrarNotificacion('⌨️ Teclado virtual activado');
    } else {
        mostrarNotificacion('❌ Teclado virtual desactivado');
        // Quitar readonly de los inputs si está desactivado
        quitarReadOnlyInputs();
    }
}

// Función para actualizar la UI del estado del teclado
function actualizarEstadoTecladoUI(activado) {
    const textoEstado = document.getElementById('textoEstadoTeclado');
    const contenedorEstado = document.getElementById('estadoTecladoVirtual');

    if (activado) {
        textoEstado.textContent = '🟢 Teclado Virtual Activado';
        contenedorEstado.style.background = 'rgba(34, 197, 94, 0.1)';
        contenedorEstado.style.border = '1px solid rgba(34, 197, 94, 0.3)';
    } else {
        textoEstado.textContent = '🔴 Teclado Virtual Desactivado';
        contenedorEstado.style.background = 'rgba(40, 40, 40, 0.5)';
        contenedorEstado.style.border = 'none';
    }
}

// Función para quitar readonly de inputs cuando se desactiva el teclado
function quitarReadOnlyInputs() {
    const todosLosInputs = document.querySelectorAll('input[readonly]');
    todosLosInputs.forEach(input => {
        // Solo quitar readonly si no es un campo que deba ser readonly por diseño
        if (!input.classList.contains('siempre-readonly')) {
            input.readOnly = false;
        }
    });

    // Limpiar el tracking de inputs configurados
    limpiarConfiguracionTeclados();
}

// Función para cargar estado del teclado al iniciar
function cargarEstadoTeclado() {
    const tecladoActivado = localStorage.getItem('tecladoVirtualActivado') === 'true';
    const checkbox = document.getElementById('toggleTecladoVirtual');

    if (checkbox) {
        checkbox.checked = tecladoActivado;
        actualizarEstadoTecladoUI(tecladoActivado);
    }
}

// Función para abrir teclado numérico
function abrirTecladoNumerico(input) {
    if (!esDispositivoTactil()) return; // Solo mostrar en dispositivos táctiles

    inputActivo = input;
    tipoTecladoActivo = 'numerico';

    // Establecer valor inicial
    document.getElementById('tecladoInput').value = input.value || '';

    // Mostrar teclado
    document.getElementById('tecladoNumerico').style.display = 'block';

    // Prevenir teclado nativo
    input.blur();
}

// Función para abrir teclado completo
function abrirTecladoCompleto(input) {
    if (!esDispositivoTactil()) return; // Solo mostrar en dispositivos táctiles

    inputActivo = input;
    tipoTecladoActivo = 'completo';

    // Establecer valor inicial
    document.getElementById('tecladoCompletoInput').value = input.value || '';

    // Mostrar teclado
    document.getElementById('tecladoCompleto').style.display = 'block';

    // Prevenir teclado nativo
    input.blur();
}

// Funciones del teclado numérico
function agregarNumero(num) {
    const input = document.getElementById('tecladoInput');
    input.value += num;
}

function agregarDecimal() {
    const input = document.getElementById('tecladoInput');
    if (!input.value.includes('.')) {
        input.value += '.';
    }
}

function borrarUltimo() {
    const input = document.getElementById('tecladoInput');
    input.value = input.value.slice(0, -1);
}

function limpiarTeclado() {
    document.getElementById('tecladoInput').value = '';
}

function confirmarTeclado() {
    if (inputActivo) {
        inputActivo.value = document.getElementById('tecladoInput').value;
        inputActivo.dispatchEvent(new Event('input', { bubbles: true }));
        inputActivo.dispatchEvent(new Event('change', { bubbles: true }));

        // Si es el campo de cantidad recibida en cobro, calcular cambio
        if (inputActivo.id === 'cantidadRecibida') {
            calcularCambio();
        }
    }
    cerrarTeclado();
}

function cerrarTeclado() {
    document.getElementById('tecladoNumerico').style.display = 'none';
    inputActivo = null;
}

// Funciones del teclado completo
function agregarLetra(letra) {
    const input = document.getElementById('tecladoCompletoInput');
    input.value += letra;
}

function borrarUltimoCompleto() {
    const input = document.getElementById('tecladoCompletoInput');
    input.value = input.value.slice(0, -1);
}

function limpiarTecladoCompleto() {
    document.getElementById('tecladoCompletoInput').value = '';
}

function confirmarTecladoCompleto() {
    if (inputActivo) {
        inputActivo.value = document.getElementById('tecladoCompletoInput').value;
        inputActivo.dispatchEvent(new Event('input', { bubbles: true }));
        inputActivo.dispatchEvent(new Event('change', { bubbles: true }));
    }
    cerrarTecladoCompleto();
}

function cerrarTecladoCompleto() {
    document.getElementById('tecladoCompleto').style.display = 'none';
    inputActivo = null;
}

// Configurar inputs para usar teclado virtual
// Variable global para trackear inputs configurados
const inputsConfigurados = new Set();

function configurarTecladosVirtuales() {
    if (!esDispositivoTactil()) return;

    // Configurar inputs numéricos
    const inputsNumericos = [
        'cantidadRecibida',
        'nuevoPrecio',
        'editarPrecio',
        'nuevoStock',
        'nuevoStockMinimo',
        'cantidadAjuste',
        'gestionMesaCapacidad'
    ];

    inputsNumericos.forEach(id => {
        const input = document.getElementById(id);
        if (input && !inputsConfigurados.has(id)) {
            inputsConfigurados.add(id);

            // Remover listeners anteriores si existen
            const newInput = input.cloneNode(true);
            input.parentNode.replaceChild(newInput, input);

            // Handler único para evitar duplicados
            const handleClick = function (e) {
                e.preventDefault();
                e.stopPropagation();
                this.blur();
                abrirTecladoNumerico(this);
            };

            newInput.addEventListener('click', handleClick, { once: false });
            newInput.addEventListener('focus', function (e) {
                e.preventDefault();
            });

            newInput.readOnly = true;
        }
    });

    // Configurar inputs de texto
    const inputsTexto = [
        'nuevoNombre',
        'editarNombre',
        'gestionMesaNombre',
        'gestionMesaDescripcion',
        'buscarProducto',
        'nuevaCategoriaNombre',
        'nuevaAreaNombre',
        'motivoAjuste'
    ];

    inputsTexto.forEach(id => {
        const input = document.getElementById(id);
        if (input && !inputsConfigurados.has(id)) {
            inputsConfigurados.add(id);

            // Remover listeners anteriores si existen
            const newInput = input.cloneNode(true);
            input.parentNode.replaceChild(newInput, input);

            // Handler único para evitar duplicados
            const handleClick = function (e) {
                e.preventDefault();
                e.stopPropagation();
                this.blur();
                abrirTecladoCompleto(this);
            };

            newInput.addEventListener('click', handleClick, { once: false });
            newInput.addEventListener('focus', function (e) {
                e.preventDefault();
            });

            newInput.readOnly = true;
        }
    });
}

// Función para limpiar configuración cuando se desactiva el teclado
function limpiarConfiguracionTeclados() {
    inputsConfigurados.clear();
}
// Cerrar teclados al hacer clic fuera
window.addEventListener('click', function (event) {
    const tecladoNum = document.getElementById('tecladoNumerico');
    const tecladoComp = document.getElementById('tecladoCompleto');

    if (event.target == tecladoNum || event.target == tecladoComp) {
        cerrarTeclado();
        cerrarTecladoCompleto();
    }
});

// Inicializar teclados cuando se carga la página
const initTecladosOriginal = window.onload;
window.onload = function () {
    if (initTecladosOriginal) initTecladosOriginal();

    // Esperar un poco para asegurar que todos los elementos estén cargados
    setTimeout(() => {
        configurarTecladosVirtuales();

        // Re-configurar cuando se abren modales
        const observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                if (mutation.attributeName === 'style') {
                    setTimeout(configurarTecladosVirtuales, 100);
                }
            });
        });

        // Observar cambios en modales
        const modales = document.querySelectorAll('.modal');
        modales.forEach(modal => {
            observer.observe(modal, { attributes: true });
        });
    }, 1000);

};
// Funciones para modal premium
function mostrarModalPremium() {
    document.getElementById('modalPremium').style.display = 'block';

    // Verificar si ya tiene trial o premium
    const licencia = obtenerEstadoLicencia();
    if (licencia.tipo === 'trial') {
        document.getElementById('opcionesPremium').querySelector('button').textContent =
            `🎁 Trial Activo (${licencia.diasRestantes} días restantes)`;
        document.getElementById('opcionesPremium').querySelector('button').disabled = true;
    }
}

function cerrarModalPremium() {
    document.getElementById('modalPremium').style.display = 'none';
}
function seleccionarPlan(plan) {
    const formulario = document.getElementById('formularioActivacion');
    formulario.style.display = 'block';

    let titulo, precio, prefijo, color;

    switch (plan) {
        case 'standard':
            titulo = '📋 Activar Plan Standard';
            precio = '49€';
            prefijo = 'STD-';
            color = '#4a5568';
            break;
        case 'pro':
            titulo = '🚀 Activar Plan Pro';
            precio = '69€';
            prefijo = 'PRO-';
            color = '#ffa502';
            break;
        case 'premium':
            titulo = '👑 Activar Plan Premium';
            precio = '130€';
            prefijo = 'PREM-';
            color = '#ffd700';
            break;
    }

    formulario.innerHTML = `
        <div style="background: rgba(40, 40, 40, 0.9); padding: 30px; border-radius: 15px; border: 2px solid ${color};">
            <h3 style="color: ${color}; margin-bottom: 20px; text-align: center;">
                ${titulo}
            </h3>
            
            <div style="text-align: center; margin-bottom: 25px;">
                <div style="font-size: 2em; font-weight: bold; color: ${color};">
                    ${precio}/mes
                </div>
            </div>
            
            <div style="display: grid; gap: 15px;">
                <div>
                    <label style="display: block; margin-bottom: 5px; color: #888;">Código de Licencia:</label>
                    <input type="text" id="codigoLicencia${plan}" placeholder="${prefijo}XXXX-XXXX-XXXX"
                        style="width: 100%; padding: 15px; background: rgba(30, 30, 30, 0.9); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; color: white; font-family: monospace; font-size: 16px; text-align: center;">
                </div>
                
                <button class="${plan === 'standard' ? 'btn-primary' : plan === 'pro' ? 'btn-warning' : 'btn-success'}" onclick="activarLicenciaPlan('${plan}')" style="width: 100%; padding: 15px; font-size: 16px; font-weight: bold;">
                    ✅ Activar ${plan.charAt(0).toUpperCase() + plan.slice(1)}
                </button>
                
                <button class="btn-primary" onclick="document.getElementById('formularioActivacion').style.display='none'" style="width: 100%;">
                    Cancelar
                </button>
            </div>
            
            <div style="margin-top: 20px; padding: 15px; background: rgba(255, 255, 255, 0.05); border-radius: 10px;">
                <p style="color: #888; margin: 0; font-size: 0.9em; text-align: center;">
                    💡 ¿No tienes código? Contacta con ventas@tuprograma.com
                </p>
            </div>
        </div>
    `;

    // Scroll suave hacia el formulario
    formulario.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Función para activar licencia de un plan específico
function activarLicenciaPlan(plan) {
    const codigo = document.getElementById(`codigoLicencia${plan}`).value.trim();

    if (!codigo) {
        alert('Por favor ingresa un código de licencia');
        return;
    }

    // Validar formato del código según el plan
    let prefijo;
    switch (plan) {
        case 'standard':
            prefijo = 'STD-';
            break;
        case 'pro':
            prefijo = 'PRO-';
            break;
        case 'premium':
            prefijo = 'PREM-';
            break;
    }

    if (!codigo.startsWith(prefijo) || codigo.length < 16) {
        alert('Código de licencia inválido. Verifica el formato.');
        return;
    }


    if (activarLicencia(codigo, plan)) {
        mostrarNotificacion(`⭐ Plan ${plan.toUpperCase()} activado correctamente`);

        setTimeout(() => {
            location.reload();
        }, 2000);
    } else {
        alert('Código de licencia inválido.');
    }
}
function activarTrial() {
    if (iniciarTrial()) {
        document.getElementById('opcionesPremium').style.display = 'none';
        document.getElementById('mensajeExito').style.display = 'block';
        document.getElementById('mensajeExitoTexto').textContent =
            '¡Tu prueba gratuita de 30 días ha comenzado! Disfruta de todas las características premium.';

        mostrarNotificacion('🎉 Trial Premium activado por 30 días');
    } else {
        alert('Ya has utilizado tu período de prueba anteriormente.');
    }
}

function validarLicencia() {
    const key = document.getElementById('licenciaInput').value.trim();

    if (activarLicencia(key)) {
        document.getElementById('opcionesPremium').style.display = 'none';
        document.getElementById('mensajeExito').style.display = 'block';

        // Mensaje personalizado según tipo
        let mensaje = '¡Licencia activada correctamente!';
        if (key.startsWith('STD-')) mensaje = '¡Licencia Standard activada! Ahora tienes soporte técnico.';
        else if (key.startsWith('PRO-')) mensaje = '¡Licencia Pro activada! Disfruta de análisis avanzados.';
        else if (key.startsWith('PREM-')) mensaje = '¡Licencia Premium activada! Acceso completo desbloqueado.';

        document.getElementById('mensajeExitoTexto').textContent = mensaje;
        mostrarNotificacion('⭐ Licencia activada');
    } else {
        alert('Licencia inválida. Por favor verifica el código.');
    }
}

// Agregar al event listener de window click
window.addEventListener('click', function (event) {
    const modalPremium = document.getElementById('modalPremium');
    if (event.target == modalPremium) {
        cerrarModalPremium();
    }
});

// ========================================
// FUNCIONES DE DESARROLLO (ELIMINAR EN PRODUCCIÓN)
// ========================================

// Función para cambiar licencia en desarrollo
function cambiarLicenciaDev(tipo) {
    // Limpiar datos anteriores
    localStorage.removeItem('licenciaTipo');
    localStorage.removeItem('licenciaKey');
    localStorage.removeItem('licenciaFecha');

    switch (tipo) {
        case 'standard':
            // No necesita hacer nada, standard es por defecto
            break;

        case 'standard-pagado':
            // Standard pagado (con key)
            localStorage.setItem('licenciaTipo', 'standard');
            localStorage.setItem('licenciaKey', 'STD-DEV-TEST-2024');
            localStorage.setItem('licenciaFecha', new Date().toISOString());
            break;

        case 'pro':
            localStorage.setItem('licenciaTipo', 'pro');
            localStorage.setItem('licenciaKey', 'PRO-DEV-TEST-2024');
            localStorage.setItem('licenciaFecha', new Date().toISOString());
            break;

        case 'premium':
            localStorage.setItem('licenciaTipo', 'premium');
            localStorage.setItem('licenciaKey', 'PREM-DEV-TEST-2024');
            localStorage.setItem('licenciaFecha', new Date().toISOString());
            break;

        case 'trial':
            localStorage.setItem('licenciaTipo', 'trial');
            localStorage.setItem('licenciaFecha', new Date().toISOString());
            break;

        case 'standard':
            // Standard gratuito (sin key)
            break;

        case 'standard-pro':
            // Standard pagado (con key)
            localStorage.setItem('licenciaTipo', 'standard');
            localStorage.setItem('licenciaKey', 'STD-DEV-TEST-2024');
            localStorage.setItem('licenciaFecha', new Date().toISOString());
            break;
    }

    mostrarNotificacion(`🔧 Cambiado a licencia ${tipo.toUpperCase()}`);
    actualizarEstadoLicenciaDev();

    // Recargar en 2 segundos
    setTimeout(() => {
        location.reload();
    }, 2000);
}

// Función para mostrar estado actual
function actualizarEstadoLicenciaDev() {
    const estado = obtenerEstadoLicencia();
    const container = document.getElementById('estadoLicenciaDev');

    if (container) {
        let html = `
            <div style="display: grid; gap: 5px;">
                <div><strong>Tipo:</strong> ${estado.tipo.toUpperCase()}</div>
                <div><strong>Activa:</strong> ${estado.activa ? '✅ Sí' : '❌ No'}</div>
        `;

        if (estado.tipo === 'trial' && estado.diasRestantes) {
            html += `<div><strong>Días restantes:</strong> ${estado.diasRestantes}</div>`;
        }

        if (estado.key) {
            html += `<div><strong>Key:</strong> ${estado.key}</div>`;
        }

        html += '</div>';
        container.innerHTML = html;
    }
}

// Función para generar licencias de prueba
// Función para generar licencias de prueba
function generarLicenciaDev(tipo) {
    const hardwareId = getHardwareFingerprint();
    const fecha = new Date().getTime().toString(36).substring(0, 4).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();

    let prefijo = '';
    if (tipo === 'standard') prefijo = 'STD';
    else if (tipo === 'pro') prefijo = 'PRO';
    else if (tipo === 'premium') prefijo = 'PREM';

    const licencia = `${prefijo}-${hardwareId}-${fecha}-${random}`;

    const container = document.getElementById('licenciaGenerada');
    container.style.display = 'block';
    container.innerHTML = `
        <div style="background: rgba(34, 197, 94, 0.1); padding: 15px; border-radius: 10px;">
            <h4 style="color: #22c55e;">✅ Licencia Generada para ESTE TPV</h4>
            <div style="margin: 15px 0; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 8px; font-family: monospace; font-size: 1.1em; text-align: center;">
                ${licencia}
            </div>
            <div style="display: flex; gap: 10px; justify-content: center;">
                <button onclick="copiarLicenciaDev('${licencia}')" style="background: #4a5568; color: white; border: none; padding: 8px 20px; border-radius: 5px; cursor: pointer;">
                    📋 Copiar
                </button>
                <button onclick="activarLicenciaAhora('${licencia}', '${tipo}')" style="background: #22c55e; color: white; border: none; padding: 8px 20px; border-radius: 5px; cursor: pointer;">
                    ✅ Activar Ahora
                </button>
            </div>
            <p style="color: #666; margin-top: 10px; font-size: 0.85em; text-align: center;">
                Hardware ID: ${hardwareId} | Solo funciona en este dispositivo
            </p>
        </div>
    `;
}

// Función auxiliar para activar inmediatamente
function activarLicenciaAhora(licencia, tipo) {
    if (activarLicencia(licencia, tipo)) {
        mostrarNotificacion('✅ Licencia activada correctamente');
        setTimeout(() => location.reload(), 2000);
    }
}

// Función para copiar licencia
function copiarLicenciaDev(licencia) {
    navigator.clipboard.writeText(licencia).then(() => {
        mostrarNotificacion('📋 Licencia copiada al portapapeles');
    });
}

// Función para limpiar todos los datos de licencia
function limpiarLicenciaDev() {
    if (confirm('¿Seguro que quieres resetear todos los datos de licencia?')) {
        localStorage.removeItem('licenciaTipo');
        localStorage.removeItem('licenciaKey');
        localStorage.removeItem('licenciaFecha');

        mostrarNotificacion('🗑️ Datos de licencia eliminados');
        actualizarEstadoLicenciaDev();

        setTimeout(() => {
            location.reload();
        }, 2000);
    }
}

// Actualizar estado al cargar la página
const actualizarEstadoDevOriginal = window.onload;
