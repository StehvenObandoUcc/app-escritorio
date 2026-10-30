import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Las pruebas corren como en un sistema en español (jsdom dice en-US), salvo las que lo cambien.
Object.defineProperty(navigator, 'language', { value: 'es-CO', configurable: true });

// findBy*/waitFor esperan 3 s en vez de 1 s. Varias pantallas dependen de la cadena de sesión
// (usuario → equipos → equipo activo) más un render completo; con la máquina cargada
// (npm run verify) eso pasa de 1 s y las pruebas fallaban solo bajo carga (F6-5).
configure({ asyncUtilTimeout: 3000 });

afterEach(() => cleanup());
