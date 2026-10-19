const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const agentPath = path.join(root, '.github/agents/estoque-uiux.agent.md');
const skills = ['design-system-architect', 'visual-regression-testing', 'accessibility-specialist', 'ux-research-usability-testing'];

test('perfil do agente UI/UX declara escopo e 13 competencias (9 + 4)', () => {
  const text = fs.readFileSync(agentPath, 'utf8');
  assert.match(text, /^---\nname: Estoque\+ Front-end UI\/UX\n/m);
  assert.match(text, /## Escopo e competências existentes/);
  assert.match(text, /## Novas habilidades formais/);
  for (const skill of skills) assert.ok(text.includes('../skills/' + skill + '/SKILL.md'), 'Agente nao referencia ' + skill);
});

for (const skill of skills) {
  test('skill ' + skill + ' e valida e oferece instrucoes aplicaveis', () => {
    const filename = path.join(root, '.github/skills', skill, 'SKILL.md');
    const text = fs.readFileSync(filename, 'utf8');
    assert.match(text, new RegExp('^---\\nname: ' + skill + '\\ndescription: .+\\n---\\n'));
    assert.ok(text.length >= 800, 'Skill sem detalhamento suficiente: ' + skill);
    assert.match(text, /## /);
    assert.match(text, /https:\/\//);
  });
}

test('perfil do agente preserva integridade de acesso e verificacao pre-merge', () => {
  const text = fs.readFileSync(agentPath, 'utf8');
  assert.match(text, /autoriza[cç][aã]o real no back-end/i);
  assert.match(text, /npm test/);
  assert.match(text, /npm run build/);
  assert.match(text, /não confundir CI/i);
});
