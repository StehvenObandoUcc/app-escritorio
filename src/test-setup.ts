import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Las pruebas corren como en un sistema en español (jsdom dice en-US), salvo las que lo cambien.
Object.defineProperty(navigator, 'language', { value: 'es-CO', configurable: true });

afterEach(() => cleanup());
