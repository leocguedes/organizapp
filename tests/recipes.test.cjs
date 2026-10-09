const test = require('node:test');
const assert = require('node:assert/strict');
const {
  convertRecipeQuantity,
  getRecipeIngredientStatuses,
  matchesRecipeIngredient,
} = require('../.test-dist/recipes.js');

function recipe(ingredient) {
  return { id: 'test', name: 'Teste', description: '', minutes: 5, servings: 1, ingredients: [ingredient], instructions: [] };
}

function ingredient(name, quantity, unit, aliases = []) {
  return { name, aliases, quantity, unit };
}

test('matches ingredient names regardless of accents and case', () => {
  assert.equal(matchesRecipeIngredient(ingredient('Queijo', 30, 'g', ['muçarela']), 'MUÇARELA'), true);
  assert.equal(matchesRecipeIngredient(ingredient('Leite', 1, 'L'), 'leite integral'), true);
  assert.equal(matchesRecipeIngredient(ingredient('Arroz', 1, 'kg'), 'feijão'), false);
});

test('converts compatible mass and volume units', () => {
  assert.equal(convertRecipeQuantity(0.5, 'kg', 'g'), 500);
  assert.equal(convertRecipeQuantity(250, 'ml', 'L'), 0.25);
  assert.equal(convertRecipeQuantity(2, 'latas', 'unidades'), null);
});

test('sums inventory across multiple matching records', () => {
  const statuses = getRecipeIngredientStatuses(
    recipe(ingredient('Queijo', 100, 'g', ['muçarela'])),
    [
      { id: 'a', name: 'Muçarela fatiada', quantity: 0.05, unit: 'kg' },
      { id: 'b', name: 'Queijo', quantity: 50, unit: 'g' },
    ],
  );
  assert.equal(statuses[0].availableQuantity, 100);
  assert.equal(statuses[0].enough, true);
  assert.equal(statuses[0].missingQuantity, 0);
});

test('expired ingredients do not count as available stock', () => {
  const statuses = getRecipeIngredientStatuses(
    recipe(ingredient('Leite', 250, 'ml', ['leite integral'])),
    [
      { id: 'expired', name: 'Leite integral', quantity: 1, unit: 'L', expires_on: '2000-01-01' },
      { id: 'current', name: 'Leite', quantity: 100, unit: 'ml' },
    ],
  );
  assert.equal(statuses[0].expiredMatches.length, 1);
  assert.equal(statuses[0].enough, false);
  assert.equal(statuses[0].missingQuantity, 150);
});

test('marks quantities with incompatible units as unknown instead of guessing', () => {
  const statuses = getRecipeIngredientStatuses(
    recipe(ingredient('Arroz', 500, 'g')),
    [{ id: 'a', name: 'Arroz', quantity: 2, unit: 'pacotes' }],
  );
  assert.equal(statuses[0].enough, null);
  assert.equal(statuses[0].comparable, false);
});

test('reports absent ingredients as missing', () => {
  const statuses = getRecipeIngredientStatuses(
    recipe(ingredient('Ovos', 2, 'unidades', ['ovo'])),
    [],
  );
  assert.equal(statuses[0].enough, false);
  assert.equal(statuses[0].missingQuantity, 2);
});
