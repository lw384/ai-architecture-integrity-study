import { nestjsErrorPlugin } from './nestjs-errors.js';
import { nestjsStructPlugin } from './nestjs-struct.js';

export const nestjsPlugin = {
    rules: {
        ...(nestjsStructPlugin.rules ?? {}),
        ...(nestjsErrorPlugin.rules ?? {}),
    },
};
