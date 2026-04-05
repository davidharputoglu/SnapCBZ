import fs from 'fs';
import * as acorn from 'acorn';

try {
  const code = fs.readFileSync('electron.js', 'utf8');
  acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
  console.log('electron.js syntax OK');
} catch (e) {
  console.error('electron.js syntax error:', e.message, 'at line', e.loc?.line, 'column', e.loc?.column);
}
