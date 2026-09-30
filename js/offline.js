// Página sin conexión: botón "Reintentar" y recarga automática cuando vuelve internet.
import { initI18n } from './core/i18n.js';

initI18n();
document.getElementById('retry')?.addEventListener('click', () => location.reload());
addEventListener('online', () => location.reload());
