// Página sin conexión: botón "Reintentar" y recarga automática cuando vuelve internet.
document.getElementById('retry')?.addEventListener('click', () => location.reload());
addEventListener('online', () => location.reload());
