/* ============================================================
   * ALUMA - JavaScript.html
   * Lógica del panel administrativo completo.
   * ============================================================ */
/* ============================================================
   * ALUMA - app.js (versión GitHub Pages / API por fetch)
   * ------------------------------------------------------------
   * IMPORTANTE: reemplaza el valor de APPS_SCRIPT_URL abajo por
   * el link de tu Web App de Apps Script (el que termina en
   * /exec). Es el único dato que cambia entre este archivo y el
   * proyecto de Apps Script.
   * ============================================================ */
  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwrJcu0KpnTsH8uABQn-kH1O-uZNtSRgjejOzW8oVfJkIUy37gCEWU7IPmR1lcKOX9x/exec';

  let SESION_TOKEN = localStorage.getItem('aluma_token') || null;
  let VISTA_ACTUAL = 'dashboard';
  let CACHE = { productos: [], categorias: [], proveedores: [], clientes: [] };
  let CHARTS = {};
  let TAB_REPORTE_ACTUAL = 'ventas';

  const money = (n) => '$' + (Number(n) || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
  const fecha = (f) => f ? new Date(f).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  const fechaCorta = (f) => f ? new Date(f).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  /* ---------------------------------------------------------
   * Wrapper genérico para llamar funciones de Apps Script que
   * devuelven { ok, data } / { ok, error } (ver ejecutarSeguro_).
   * --------------------------------------------------------- */
  function llamarApi(nombreFuncion, args, onOk, onError) {
    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      // 'text/plain' evita que el navegador dispare una petición OPTIONS
      // de preflight (Apps Script no responde a OPTIONS). Apps Script lee
      // el cuerpo igual con e.postData.contents sin importar este header.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ fn: nombreFuncion, args: args || [], token: SESION_TOKEN })
    })
      .then(function (r) { return r.json(); })
      .then(function (resp) {
        if (resp && resp.ok) {
          onOk && onOk(resp.data);
        } else {
          console.error('[ALUMA] ' + nombreFuncion + ' devolvió error:', resp);
          const msg = (resp && resp.error) || 'Ocurrió un error inesperado.';
          mostrarToast(msg, 'error');
          onError && onError(msg);
        }
      })
      .catch(function (err) {
        console.error('[ALUMA] ' + nombreFuncion + ' falló (red/conexión):', err);
        mostrarToast('Error de conexión: ' + err.message, 'error');
        onError && onError(err);
      });
  }

  function mostrarToast(mensaje, tipo) {
    const cont = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = 'toast' + (tipo ? ' ' + tipo : '');
    el.textContent = mensaje;
    cont.appendChild(el);
    setTimeout(function () { el.remove(); }, 4000);
  }

  /* ============================================================
   * AUTENTICACIÓN
   * ============================================================ */

  function hacerLogin() {
    const usuario = document.getElementById('loginUsuario').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errEl = document.getElementById('loginError');
    const btn = document.getElementById('btnLogin');
    errEl.style.display = 'none';

    if (!usuario || !password) return;
    btn.disabled = true; btn.textContent = 'Ingresando...';

    llamarApi('login', [usuario, password], function (data) {
      SESION_TOKEN = data.token;
      localStorage.setItem('aluma_token', SESION_TOKEN);
      document.getElementById('usuarioActual').textContent = data.usuario;
      mostrarApp();
    }, function (msg) {
      errEl.textContent = msg;
      errEl.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Ingresar';
    });
  }

  function hacerLogout() {
    llamarApi('cerrarSesion', [SESION_TOKEN], function () {
      SESION_TOKEN = null;
      localStorage.removeItem('aluma_token');
      document.getElementById('app').classList.remove('visible');
      document.getElementById('loginScreen').style.display = 'flex';
      document.getElementById('loginPassword').value = '';
    });
  }

  function verificarSesionGuardada() {
    if (!SESION_TOKEN) return;
    llamarApi('verificarSesion', [SESION_TOKEN], function (data) {
      document.getElementById('usuarioActual').textContent = data.usuario;
      mostrarApp();
    }, function () {
      localStorage.removeItem('aluma_token');
      SESION_TOKEN = null;
    });
  }

  function mostrarApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('app').classList.add('visible');
    cargarDatosBase();
    irAVista('dashboard');
  }

  /* ============================================================
   * NAVEGACIÓN
   * ============================================================ */

  const TITULOS = {
    dashboard: 'Dashboard', productos: 'Productos', inventario: 'Inventario',
    entradas: 'Entradas de inventario', ventas: 'Ventas', movimientos: 'Movimientos',
    categorias: 'Categorías', clientes: 'Clientes', proveedores: 'Proveedores', reportes: 'Reportes'
  };

  function irAVista(vista) {
    VISTA_ACTUAL = vista;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + vista).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === vista));
    document.getElementById('pageTitle').textContent = TITULOS[vista];
    cerrarSidebar();

    if (vista === 'dashboard') cargarDashboard();
    else if (vista === 'productos') cargarProductos();
    else if (vista === 'inventario') cargarInventario();
    else if (vista === 'entradas') cargarEntradas();
    else if (vista === 'ventas') cargarVentas();
    else if (vista === 'movimientos') cargarMovimientos();
    else if (vista === 'categorias') cargarCategorias();
    else if (vista === 'clientes') cargarClientes();
    else if (vista === 'proveedores') cargarProveedores();
    else if (vista === 'reportes') cargarReporteActivo();
  }

  function abrirSidebar() { document.getElementById('sidebar').classList.add('open'); document.getElementById('overlay').classList.add('visible'); }
  function cerrarSidebar() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('overlay').classList.remove('visible'); }

  /* ============================================================
   * DATOS BASE (categorías / proveedores / productos en caché
   * para llenar selects sin recargar cada vez)
   * ============================================================ */

  function cargarDatosBase() {
    llamarApi('obtenerCategorias', [], function (data) {
      CACHE.categorias = data;
      llenarSelectsCategoria();
    });
    llamarApi('obtenerProveedores', [], function (data) {
      CACHE.proveedores = data;
      llenarSelectProveedor();
    });
    llamarApi('obtenerProductos', [{}], function (data) {
      CACHE.productos = data;
      llenarSelectsProducto();
    });
  }

  function llenarSelectsCategoria() {
    const opciones = CACHE.categorias.filter(c => c.ESTADO === 'Activa')
      .map(c => `<option value="${c.NOMBRE}">${c.NOMBRE}</option>`).join('');

    document.getElementById('prodCategoria').innerHTML = opciones;

    const filtro = document.getElementById('prodFiltroCategoria');
    filtro.innerHTML = '<option value="">Todas las categorías</option>' + opciones;
  }

  function llenarSelectProveedor() {
    const opciones = CACHE.proveedores.map(p => `<option value="${p.NOMBRE}">${p.NOMBRE}</option>`).join('');
    document.getElementById('entradaProveedor').innerHTML = '<option value="">— Ninguno —</option>' + opciones;
  }

  function llenarSelectsProducto() {
    const activos = CACHE.productos.filter(p => p.ESTADO === 'Activo');
    const opciones = activos.map(p => `<option value="${p.ID}">${p.NOMBRE} (${p.SKU})</option>`).join('');
    ['entradaProducto', 'ajusteProducto', 'ventaProducto'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = opciones;
    });
  }

  /* ============================================================
   * DASHBOARD
   * ============================================================ */

  function cargarDashboard() {
    llamarApi('obtenerDashboard', [], function (d) {
      document.getElementById('dashStatsVentas').innerHTML = `
        ${statCard('Ventas del día', money(d.ventas.dia))}
        ${statCard('Ventas de la semana', money(d.ventas.semana))}
        ${statCard('Ventas del mes', money(d.ventas.mes))}
        ${statCard('Ventas totales', money(d.ventas.total), true)}
        ${statCard('Utilidad del día', money(d.utilidades.dia))}
        ${statCard('Utilidad del mes', money(d.utilidades.mes))}
        ${statCard('Utilidad acumulada', money(d.utilidades.acumulada), true)}
      `;

      document.getElementById('dashStatsInventario').innerHTML = `
        ${statCard('Productos registrados', d.inventario.productosRegistrados)}
        ${statCard('Unidades disponibles', d.inventario.unidadesDisponibles)}
        ${statCard('Productos agotados', d.inventario.agotados)}
        ${statCard('Stock bajo', d.inventario.stockBajo)}
        ${statCard('Valor inventario (costo)', money(d.inventario.valorInventarioCosto))}
        ${statCard('Valor inventario (venta)', money(d.inventario.valorInventarioVenta), true)}
      `;

      document.getElementById('dashOtros').innerHTML = `
        <h3>Otros indicadores</h3>
        <div class="stats-grid">
          ${statCard('Producto más vendido', d.otros.productoMasVendido || '—')}
          ${statCard('Categoría más vendida', d.otros.categoriaMasVendida || '—')}
          ${statCard('Menor stock', d.otros.productoMenorStock ? d.otros.productoMenorStock.nombre + ' (' + d.otros.productoMenorStock.stock + ')' : '—')}
          ${statCard('Última venta', d.otros.ultimaVenta ? d.otros.ultimaVenta.producto + ' — ' + money(d.otros.ultimaVenta.total) : '—')}
          ${statCard('Último producto agregado', d.otros.ultimoProductoAgregado ? d.otros.ultimoProductoAgregado.nombre : '—')}
        </div>
      `;

      dibujarChart('chartVentasMes', 'line', d.graficos.ventasPorMes.map(x => x.etiqueta), [{ label: 'Ventas', data: d.graficos.ventasPorMes.map(x => x.valor), borderColor: '#4e1412', backgroundColor: 'rgba(78,20,18,0.1)', tension: 0.3, fill: true }]);
      dibujarChart('chartUtilidadMes', 'line', d.graficos.utilidadPorMes.map(x => x.etiqueta), [{ label: 'Utilidad', data: d.graficos.utilidadPorMes.map(x => x.valor), borderColor: '#2e7d32', backgroundColor: 'rgba(46,125,50,0.1)', tension: 0.3, fill: true }]);
      dibujarChart('chartTopProductos', 'bar', d.graficos.topProductos.map(x => x.nombre), [{ label: 'Unidades vendidas', data: d.graficos.topProductos.map(x => x.unidades), backgroundColor: '#6e2422' }]);
      dibujarChart('chartVentasCategoria', 'bar', d.graficos.ventasPorCategoria.map(x => x.categoria), [{ label: 'Ventas', data: d.graficos.ventasPorCategoria.map(x => x.total), backgroundColor: '#9a4644' }]);
      dibujarChart('chartEstadoInventario', 'doughnut', d.graficos.estadoInventario.map(x => x.etiqueta), [{ data: d.graficos.estadoInventario.map(x => x.valor), backgroundColor: ['#2e7d32', '#b8860b', '#c0392b'] }]);
    });
  }

  function statCard(label, value, accent) {
    return `<div class="stat-card"><div class="label">${label}</div><div class="value${accent ? ' accent' : ''}">${value}</div></div>`;
  }

  function dibujarChart(id, tipo, labels, datasets) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (CHARTS[id]) CHARTS[id].destroy();
    CHARTS[id] = new Chart(ctx, {
      type: tipo,
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: tipo === 'doughnut' } }
      }
    });
  }

  /* ============================================================
   * PRODUCTOS
   * ============================================================ */

  function cargarProductos() {
    const filtros = {
      busqueda: document.getElementById('prodBuscar').value,
      categoria: document.getElementById('prodFiltroCategoria').value,
      estado: document.getElementById('prodFiltroEstado').value,
      ordenarPor: document.getElementById('prodOrden').value
    };
    llamarApi('obtenerProductos', [filtros], function (data) {
      CACHE.productos = data;
      const tbody = document.getElementById('tablaProductos');
      if (!data.length) { tbody.innerHTML = filaVacia(8); return; }
      tbody.innerHTML = data.map(p => `
        <tr>
          <td>${p.SKU}</td>
          <td>${p.NOMBRE}</td>
          <td>${p.CATEGORIA}</td>
          <td>${money(p.COSTO)}</td>
          <td>${money(p.PRECIO)}</td>
          <td>${p.STOCK}</td>
          <td>${badgeEstadoStock(p.ESTADO_STOCK)} ${p.ESTADO === 'Inactivo' ? '<span class="badge badge-muted">Inactivo</span>' : ''}</td>
          <td class="table-actions">
            <button class="btn btn-secondary btn-sm" onclick='abrirModalProducto(${JSON.stringify(p)})'>Editar</button>
            <button class="btn btn-ghost btn-sm" onclick="cambiarEstadoProductoUI('${p.ID}','${p.ESTADO === 'Activo' ? 'Inactivo' : 'Activo'}')">${p.ESTADO === 'Activo' ? 'Desactivar' : 'Activar'}</button>
            <button class="btn btn-danger btn-sm" onclick="eliminarProductoUI('${p.ID}')">Eliminar</button>
          </td>
        </tr>`).join('');
    });
  }

  function badgeEstadoStock(estado) {
    if (estado === 'Agotado') return '<span class="badge badge-danger">Agotado</span>';
    if (estado === 'Stock bajo') return '<span class="badge badge-warning">Stock bajo</span>';
    return '<span class="badge badge-success">En stock</span>';
  }

  function filaVacia(cols) {
    return `<tr><td colspan="${cols}"><div class="empty-state">No hay registros para mostrar.</div></td></tr>`;
  }

  function abrirModalProducto(producto) {
    document.getElementById('modalProductoTitulo').textContent = producto ? 'Editar producto' : 'Nuevo producto';
    document.getElementById('prodId').value = producto ? producto.ID : '';
    document.getElementById('prodNombre').value = producto ? producto.NOMBRE : '';
    document.getElementById('prodCategoria').value = producto ? producto.CATEGORIA : '';
    document.getElementById('prodSubcategoria').value = producto ? producto.SUBCATEGORIA : '';
    document.getElementById('prodMaterial').value = producto ? producto.MATERIAL : '';
    document.getElementById('prodEstado').value = producto ? producto.ESTADO : 'Activo';
    document.getElementById('prodCosto').value = producto ? producto.COSTO : '';
    document.getElementById('prodPrecio').value = producto ? producto.PRECIO : '';
    document.getElementById('prodStockInicial').value = producto ? producto.STOCK_INICIAL : 0;
    document.getElementById('prodStockInicial').disabled = !!producto;
    document.getElementById('prodStockMinimo').value = producto ? producto.STOCK_MINIMO : 3;
    document.getElementById('prodDescripcion').value = producto ? producto.DESCRIPCION : '';
    document.getElementById('prodImagen').value = producto ? producto.IMAGEN_URL : '';
    abrirModal('modalProducto');
  }

  function guardarProducto() {
    const id = document.getElementById('prodId').value;
    const datos = {
      Nombre: document.getElementById('prodNombre').value.trim(),
      Categoria: document.getElementById('prodCategoria').value,
      Subcategoria: document.getElementById('prodSubcategoria').value.trim(),
      Material: document.getElementById('prodMaterial').value.trim(),
      Estado: document.getElementById('prodEstado').value,
      Costo: document.getElementById('prodCosto').value,
      Precio: document.getElementById('prodPrecio').value,
      StockMinimo: document.getElementById('prodStockMinimo').value,
      Descripcion: document.getElementById('prodDescripcion').value.trim(),
      ImagenURL: document.getElementById('prodImagen').value.trim()
    };
    if (!id) datos.StockInicial = document.getElementById('prodStockInicial').value;

    const btn = document.getElementById('btnGuardarProducto');
    btn.disabled = true;

    const fn = id ? 'actualizarProducto' : 'crearProducto';
    const args = id ? [id, datos] : [datos];

    llamarApi(fn, args, function () {
      btn.disabled = false;
      mostrarToast(id ? 'Producto actualizado correctamente.' : 'Producto creado correctamente.', 'success');
      cerrarModal('modalProducto');
      cargarProductos();
      cargarDatosBase();
    }, function () { btn.disabled = false; });
  }

  function cambiarEstadoProductoUI(id, estado) {
    llamarApi('cambiarEstadoProducto', [id, estado], function () {
      mostrarToast('Estado actualizado.', 'success');
      cargarProductos();
    });
  }

  function eliminarProductoUI(id) {
    if (!confirm('¿Eliminar este producto de forma permanente? Esta acción no se puede deshacer.')) return;
    llamarApi('eliminarProducto', [id], function () {
      mostrarToast('Producto eliminado.', 'success');
      cargarProductos();
      cargarDatosBase();
    });
  }

  /* ============================================================
   * INVENTARIO
   * ============================================================ */

  function cargarInventario() {
    llamarApi('obtenerEstadoInventario', [], function (d) {
      document.getElementById('invStats').innerHTML = `
        ${statCard('Productos activos', d.totalProductos)}
        ${statCard('Unidades totales', d.unidadesTotales)}
        ${statCard('En stock', d.enStock)}
        ${statCard('Stock bajo', d.stockBajo)}
        ${statCard('Agotados', d.agotados)}
        ${statCard('Valor al costo', money(d.valorCosto))}
        ${statCard('Valor de venta', money(d.valorVenta), true)}
        ${statCard('Utilidad potencial', money(d.utilidadPotencial), true)}
      `;
    });
    llamarApi('obtenerProductos', [{ estado: 'Activo' }], function (data) {
      const tbody = document.getElementById('tablaInventario');
      if (!data.length) { tbody.innerHTML = filaVacia(8); return; }
      tbody.innerHTML = data.map(p => `
        <tr>
          <td>${p.NOMBRE}</td><td>${p.SKU}</td><td>${p.CATEGORIA}</td>
          <td>${money(p.COSTO)}</td><td>${money(p.PRECIO)}</td>
          <td>${p.STOCK}</td><td>${p.STOCK_MINIMO}</td>
          <td>${badgeEstadoStock(p.ESTADO_STOCK)}</td>
        </tr>`).join('');
    });
  }

  /* ============================================================
   * ENTRADAS
   * ============================================================ */

  function cargarEntradas() {
    llamarApi('obtenerMovimientos', [{ tipo: 'Entrada' }], function (data) {
      const tbody = document.getElementById('tablaEntradas');
      if (!data.length) { tbody.innerHTML = filaVacia(5); return; }
      tbody.innerHTML = data.map(m => `
        <tr><td>${fecha(m.FECHA)}</td><td>${m.PRODUCTO}</td><td>+${m.CANTIDAD}</td><td>${money(m.COSTO)}</td><td>${m.MOTIVO || ''}</td></tr>
      `).join('');
    });
  }

  function abrirModalEntrada() {
    document.getElementById('entradaProducto').selectedIndex = 0;
    document.getElementById('entradaCantidad').value = '';
    document.getElementById('entradaCosto').value = '';
    document.getElementById('entradaProveedor').selectedIndex = 0;
    document.getElementById('entradaMotivo').value = '';
    abrirModal('modalEntrada');
  }

  function guardarEntrada() {
    const datos = {
      ProductoID: document.getElementById('entradaProducto').value,
      Cantidad: document.getElementById('entradaCantidad').value,
      CostoUnitario: document.getElementById('entradaCosto').value,
      Proveedor: document.getElementById('entradaProveedor').value,
      Motivo: document.getElementById('entradaMotivo').value.trim()
    };
    const btn = document.getElementById('btnGuardarEntrada');
    btn.disabled = true;
    llamarApi('registrarEntrada', [datos], function () {
      btn.disabled = false;
      mostrarToast('Entrada registrada. Stock actualizado.', 'success');
      cerrarModal('modalEntrada');
      cargarEntradas();
      cargarDatosBase();
    }, function () { btn.disabled = false; });
  }

  /* ============================================================
   * AJUSTES (desde Inventario)
   * ============================================================ */

  function abrirModalAjuste() {
    document.getElementById('ajusteProducto').selectedIndex = 0;
    document.getElementById('ajusteCantidad').value = '';
    document.getElementById('ajusteMotivo').value = '';
    abrirModal('modalAjuste');
  }

  function guardarAjuste() {
    const datos = {
      ProductoID: document.getElementById('ajusteProducto').value,
      Cantidad: document.getElementById('ajusteCantidad').value,
      Motivo: document.getElementById('ajusteMotivo').value.trim()
    };
    const btn = document.getElementById('btnGuardarAjuste');
    btn.disabled = true;
    llamarApi('registrarAjuste', [datos], function () {
      btn.disabled = false;
      mostrarToast('Ajuste aplicado correctamente.', 'success');
      cerrarModal('modalAjuste');
      cargarInventario();
      cargarDatosBase();
    }, function () { btn.disabled = false; });
  }

  /* ============================================================
   * VENTAS
   * ============================================================ */

  function cargarVentas() {
    const filtros = {
      desde: document.getElementById('ventasDesde').value,
      hasta: document.getElementById('ventasHasta').value
    };
    llamarApi('obtenerVentas', [filtros], function (data) {
      const tbody = document.getElementById('tablaVentas');
      if (!data.length) { tbody.innerHTML = filaVacia(8); return; }
      tbody.innerHTML = data.map(v => `
        <tr>
          <td>${fecha(v.FECHA)}</td><td>${v.PRODUCTO}</td><td>${v.CANTIDAD}</td>
          <td>${money(v.PRECIO_UNITARIO)}</td><td>${money(v.TOTAL)}</td>
          <td style="color:var(--success); font-weight:600;">${money(v.UTILIDAD)}</td>
          <td>${v.METODO_PAGO || '—'}</td><td>${v.OBSERVACIONES || '—'}</td>
        </tr>`).join('');
    });
  }

  function abrirModalVenta() {
    document.getElementById('ventaProducto').selectedIndex = 0;
    document.getElementById('ventaCantidad').value = 1;
    document.getElementById('ventaMetodoPago').selectedIndex = 0;
    document.getElementById('ventaCliente').value = '';
    document.getElementById('ventaObservaciones').value = '';
    autocompletarPrecioVenta();
    abrirModal('modalVenta');
  }

  function autocompletarPrecioVenta() {
    const id = document.getElementById('ventaProducto').value;
    const producto = CACHE.productos.find(p => p.ID === id);
    if (producto) {
      document.getElementById('ventaPrecio').value = producto.PRECIO;
      document.getElementById('ventaStockDisponible').textContent = 'Stock disponible: ' + producto.STOCK + ' unidades';
    }
  }

  function guardarVenta() {
    const datos = {
      ProductoID: document.getElementById('ventaProducto').value,
      Cantidad: document.getElementById('ventaCantidad').value,
      PrecioUnitario: document.getElementById('ventaPrecio').value,
      MetodoPago: document.getElementById('ventaMetodoPago').value,
      Cliente: document.getElementById('ventaCliente').value.trim(),
      Observaciones: document.getElementById('ventaObservaciones').value.trim()
    };
    const btn = document.getElementById('btnGuardarVenta');
    btn.disabled = true;
    llamarApi('registrarVenta', [datos], function () {
      btn.disabled = false;
      mostrarToast('Venta registrada. Stock y utilidad actualizados.', 'success');
      cerrarModal('modalVenta');
      cargarVentas();
      cargarDatosBase();
    }, function () { btn.disabled = false; });
  }

  /* ============================================================
   * MOVIMIENTOS
   * ============================================================ */

  function cargarMovimientos() {
    const filtros = { tipo: document.getElementById('movFiltroTipo').value };
    llamarApi('obtenerMovimientos', [filtros], function (data) {
      const tbody = document.getElementById('tablaMovimientos');
      if (!data.length) { tbody.innerHTML = filaVacia(7); return; }
      tbody.innerHTML = data.map(m => `
        <tr>
          <td>${fecha(m.FECHA)}</td><td>${m.PRODUCTO}</td><td>${badgeTipoMovimiento(m.TIPO)}</td>
          <td>${m.CANTIDAD}</td><td>${m.STOCK_ANTERIOR}</td><td>${m.STOCK_NUEVO}</td><td>${m.MOTIVO || ''}</td>
        </tr>`).join('');
    });
  }

  function badgeTipoMovimiento(tipo) {
    const map = {
      Entrada: 'success', Venta: 'muted', AjustePositivo: 'success',
      AjusteNegativo: 'danger', Devolucion: 'warning', Correccion: 'warning'
    };
    return `<span class="badge badge-${map[tipo] || 'muted'}">${tipo}</span>`;
  }

  /* ============================================================
   * CATEGORÍAS
   * ============================================================ */

  function cargarCategorias() {
    llamarApi('obtenerCategorias', [], function (data) {
      CACHE.categorias = data;
      llenarSelectsCategoria();
      const tbody = document.getElementById('tablaCategorias');
      if (!data.length) { tbody.innerHTML = filaVacia(5); return; }
      tbody.innerHTML = data.map(c => `
        <tr>
          <td>${c.NOMBRE}</td><td>${c.DESCRIPCION || '—'}</td><td>${c.TOTAL_PRODUCTOS}</td>
          <td>${c.ESTADO === 'Activa' ? '<span class="badge badge-success">Activa</span>' : '<span class="badge badge-muted">Inactiva</span>'}</td>
          <td class="table-actions">
            <button class="btn btn-secondary btn-sm" onclick='abrirModalCategoria(${JSON.stringify(c)})'>Editar</button>
            <button class="btn btn-ghost btn-sm" onclick="cambiarEstadoCategoriaUI('${c.ID}','${c.ESTADO === 'Activa' ? 'Inactiva' : 'Activa'}')">${c.ESTADO === 'Activa' ? 'Desactivar' : 'Activar'}</button>
          </td>
        </tr>`).join('');
    });
  }

  function abrirModalCategoria(cat) {
    document.getElementById('modalCategoriaTitulo').textContent = cat ? 'Editar categoría' : 'Nueva categoría';
    document.getElementById('catId').value = cat ? cat.ID : '';
    document.getElementById('catNombre').value = cat ? cat.NOMBRE : '';
    document.getElementById('catDescripcion').value = cat ? cat.DESCRIPCION : '';
    abrirModal('modalCategoria');
  }

  function guardarCategoria() {
    const id = document.getElementById('catId').value;
    const datos = {
      Nombre: document.getElementById('catNombre').value.trim(),
      Descripcion: document.getElementById('catDescripcion').value.trim()
    };
    const btn = document.getElementById('btnGuardarCategoria');
    btn.disabled = true;
    const fn = id ? 'actualizarCategoria' : 'crearCategoria';
    const args = id ? [id, datos] : [datos];
    llamarApi(fn, args, function () {
      btn.disabled = false;
      mostrarToast('Categoría guardada.', 'success');
      cerrarModal('modalCategoria');
      cargarCategorias();
    }, function () { btn.disabled = false; });
  }

  function cambiarEstadoCategoriaUI(id, estado) {
    llamarApi('cambiarEstadoCategoria', [id, estado], function () {
      mostrarToast('Estado actualizado.', 'success');
      cargarCategorias();
    });
  }

  /* ============================================================
   * CLIENTES
   * ============================================================ */

  function cargarClientes() {
    llamarApi('obtenerClientes', [], function (data) {
      const tbody = document.getElementById('tablaClientes');
      if (!data.length) { tbody.innerHTML = filaVacia(6); return; }
      tbody.innerHTML = data.map(c => `
        <tr>
          <td>${c.NOMBRE}</td><td>${c.TELEFONO || '—'}</td><td>${c.CIUDAD || '—'}</td>
          <td>${c.NUMERO_COMPRAS || 0}</td><td>${money(c.TOTAL_COMPRADO)}</td><td>${fechaCorta(c.ULTIMA_COMPRA)}</td>
        </tr>`).join('');
    });
  }

  function abrirModalCliente() {
    document.getElementById('cliNombre').value = '';
    document.getElementById('cliTelefono').value = '';
    document.getElementById('cliCiudad').value = '';
    abrirModal('modalCliente');
  }

  function guardarCliente() {
    const datos = {
      Nombre: document.getElementById('cliNombre').value.trim(),
      Telefono: document.getElementById('cliTelefono').value.trim(),
      Ciudad: document.getElementById('cliCiudad').value.trim()
    };
    const btn = document.getElementById('btnGuardarCliente');
    btn.disabled = true;
    llamarApi('crearCliente', [datos], function () {
      btn.disabled = false;
      mostrarToast('Cliente creado.', 'success');
      cerrarModal('modalCliente');
      cargarClientes();
    }, function () { btn.disabled = false; });
  }

  /* ============================================================
   * PROVEEDORES
   * ============================================================ */

  function cargarProveedores() {
    llamarApi('obtenerProveedores', [], function (data) {
      CACHE.proveedores = data;
      llenarSelectProveedor();
      const tbody = document.getElementById('tablaProveedores');
      if (!data.length) { tbody.innerHTML = filaVacia(5); return; }
      tbody.innerHTML = data.map(p => `
        <tr><td>${p.NOMBRE}</td><td>${p.CONTACTO || '—'}</td><td>${p.TELEFONO || '—'}</td><td>${p.WHATSAPP || '—'}</td><td>${p.CORREO || '—'}</td></tr>
      `).join('');
    });
  }

  function abrirModalProveedor() {
    ['provNombre', 'provContacto', 'provTelefono', 'provWhatsapp', 'provCorreo', 'provNotas'].forEach(id => document.getElementById(id).value = '');
    abrirModal('modalProveedor');
  }

  function guardarProveedor() {
    const datos = {
      Nombre: document.getElementById('provNombre').value.trim(),
      Contacto: document.getElementById('provContacto').value.trim(),
      Telefono: document.getElementById('provTelefono').value.trim(),
      WhatsApp: document.getElementById('provWhatsapp').value.trim(),
      Correo: document.getElementById('provCorreo').value.trim(),
      Notas: document.getElementById('provNotas').value.trim()
    };
    const btn = document.getElementById('btnGuardarProveedor');
    btn.disabled = true;
    llamarApi('crearProveedor', [datos], function () {
      btn.disabled = false;
      mostrarToast('Proveedor creado.', 'success');
      cerrarModal('modalProveedor');
      cargarProveedores();
    }, function () { btn.disabled = false; });
  }

  /* ============================================================
   * REPORTES
   * ============================================================ */

  function cambiarTabReporte(tab) {
    TAB_REPORTE_ACTUAL = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.getElementById('reportesFiltrosFecha').style.display = (tab === 'ventas' || tab === 'financiero') ? 'flex' : 'none';
    cargarReporteActivo();
  }

  function cargarReporteActivo() {
    const cont = document.getElementById('reporteContenido');
    const filtros = { desde: document.getElementById('repDesde').value, hasta: document.getElementById('repHasta').value };

    if (TAB_REPORTE_ACTUAL === 'ventas') {
      llamarApi('reporteVentas', [filtros], function (d) {
        cont.innerHTML = `
          <div class="stats-grid">
            ${statCard('Unidades vendidas', d.totales.cantidad)}
            ${statCard('Total ventas', money(d.totales.total))}
            ${statCard('Utilidad total', money(d.totales.utilidad), true)}
          </div>
          <div class="table-wrap"><table>
            <thead><tr><th>Fecha</th><th>Producto</th><th>Cant.</th><th>Total</th><th>Utilidad</th></tr></thead>
            <tbody>${d.ventas.length ? d.ventas.map(v => `<tr><td>${fecha(v.FECHA)}</td><td>${v.PRODUCTO}</td><td>${v.CANTIDAD}</td><td>${money(v.TOTAL)}</td><td>${money(v.UTILIDAD)}</td></tr>`).join('') : filaVacia(5)}</tbody>
          </table></div>`;
      });
    } else if (TAB_REPORTE_ACTUAL === 'inventario') {
      llamarApi('reporteInventario', [], function (d) {
        cont.innerHTML = `
          <div class="stats-grid">
            ${statCard('Valor al costo', money(d.totales.valorCosto))}
            ${statCard('Valor potencial de venta', money(d.totales.valorVenta))}
            ${statCard('Utilidad potencial', money(d.totales.utilidadPotencial), true)}
          </div>
          <div class="table-wrap"><table>
            <thead><tr><th>Producto</th><th>Stock</th><th>Estado</th><th>Valor costo</th><th>Valor venta</th></tr></thead>
            <tbody>${d.detalle.length ? d.detalle.map(p => `<tr><td>${p.nombre}</td><td>${p.stock}</td><td>${badgeEstadoStock(p.estadoStock)}</td><td>${money(p.valorCosto)}</td><td>${money(p.valorVenta)}</td></tr>`).join('') : filaVacia(5)}</tbody>
          </table></div>`;
      });
    } else if (TAB_REPORTE_ACTUAL === 'productos') {
      llamarApi('reporteProductos', [], function (d) {
        cont.innerHTML = `
          <div class="cards-row">
            ${tablaRankingProductos('Más vendidos', d.masVendidos, 'UNIDADES_VENDIDAS', 'Unidades')}
            ${tablaRankingProductos('Menor stock', d.menorStock, 'STOCK', 'Stock')}
          </div>
          <div class="cards-row">
            ${tablaRankingProductos('Más rentables (margen %)', d.masRentables, 'MARGEN', 'Margen %', true)}
            ${tablaRankingProductos('Agotados', d.agotados, 'STOCK', 'Stock')}
          </div>`;
      });
    } else if (TAB_REPORTE_ACTUAL === 'financiero') {
      llamarApi('reporteFinanciero', [filtros], function (d) {
        cont.innerHTML = `
          <div class="stats-grid">
            ${statCard('Inversión en inventario', money(d.inversionInventario))}
            ${statCard('Valor potencial', money(d.valorPotencialInventario))}
            ${statCard('Ventas del período', money(d.periodo.ventas))}
            ${statCard('Costos del período', money(d.periodo.costos))}
            ${statCard('Utilidad del período', money(d.periodo.utilidad), true)}
            ${statCard('Margen', d.periodo.margen.toFixed(1) + '%')}
          </div>`;
      });
    }
  }

  function tablaRankingProductos(titulo, lista, campo, etiquetaCampo, esPorcentaje) {
    const filas = lista.length ? lista.map(p => `
      <tr><td>${p.NOMBRE}</td><td>${esPorcentaje ? Number(p[campo]).toFixed(1) + '%' : p[campo]}</td></tr>
    `).join('') : filaVacia(2);
    return `<div class="panel"><h3>${titulo}</h3><div class="table-wrap"><table>
      <thead><tr><th>Producto</th><th>${etiquetaCampo}</th></tr></thead><tbody>${filas}</tbody>
    </table></div></div>`;
  }

  /* ============================================================
   * MODALES (genérico)
   * ============================================================ */

  function abrirModal(id) { document.getElementById(id).classList.add('visible'); }
  function cerrarModal(id) { document.getElementById(id).classList.remove('visible'); }

  /* ============================================================
   * INICIO
   * ============================================================ */

  document.addEventListener('DOMContentLoaded', verificarSesionGuardada);

  document.getElementById('loginPassword').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') hacerLogin();
  });
