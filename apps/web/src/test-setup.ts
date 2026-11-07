import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
// Without Vitest globals, Testing Library does not auto-clean: renders from earlier tests would pile up in the DOM.
afterEach(() => cleanup());
