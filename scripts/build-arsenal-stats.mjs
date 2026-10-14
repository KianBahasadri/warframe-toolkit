import luaparse from 'luaparse';

// Parse data literals only. Never evaluate code fetched from the wiki.
export function readWeaponTables(lua) {
  const body = luaparse.parse(lua, { encodingMode: 'pseudo-latin1', comments: false }).body;
  if (body.length !== 1 || body[0].type !== 'ReturnStatement' || body[0].arguments.length !== 1) throw new Error('Expected a returned weapon table.');
  const read = node => {
    if (['StringLiteral', 'NumericLiteral', 'BooleanLiteral'].includes(node.type)) return node.value;
    if (node.type === 'NilLiteral') return null;
    if (node.type === 'UnaryExpression' && node.operator === '-' && node.argument.type === 'NumericLiteral') return -node.argument.value;
    if (node.type === 'MemberExpression' && node.base.name === 'math' && node.identifier.name === 'huge') return null;
    if (node.type !== 'TableConstructorExpression') throw new Error(`Unsupported wiki value: ${node.type}`);
    if (node.fields.every(field => field.type === 'TableValue')) return node.fields.map(field => read(field.value));
    return Object.fromEntries(node.fields.map(field => {
      if (!['TableKeyString', 'TableKey'].includes(field.type)) throw new Error('Mixed weapon table.');
      return [field.type === 'TableKeyString' ? field.key.name : read(field.key), read(field.value)];
    }));
  };
  return read(body[0].arguments[0]);
}

const fields = ['AmmoMax', 'AmmoPickup', 'AmmoCost', 'MinSpread', 'MaxSpread', 'Range', 'PunchThrough', 'ShotSpeed', 'ShotType', 'Trigger', 'ChargeTime', 'Multishot', 'IncarnonCharges'];
function referenceFields(value) {
  return Object.fromEntries(fields.filter(key => typeof value[key] === 'string' || typeof value[key] === 'number' && Number.isFinite(value[key])).map(key => [key[0].toLowerCase() + key.slice(1), value[key]]));
}
export function buildArsenalStats(catalog, tables) {
  const byId = new Map(tables.flatMap(table => Object.values(table)).filter(weapon => typeof weapon.InternalName === 'string').map(weapon => [weapon.InternalName, weapon]));
  const weapons = {};
  for (const item of catalog) {
    const weapon = byId.get(item.id);
    if (!weapon || !['Primary', 'Secondary', 'Melee'].includes(item.slot)) continue;
    const attacks = {};
    for (const attack of item.attacks ?? []) {
      const matches = (weapon.Attacks ?? []).filter(entry => entry.AttackName === attack.name);
      if (matches.length !== 1) continue;
      const source = matches[0];
      const values = referenceFields(source);
      if (source.Falloff && ['StartRange', 'EndRange', 'Reduction'].every(key => Number.isFinite(source.Falloff[key]))) values.falloff = { start: source.Falloff.StartRange, end: source.Falloff.EndRange, reduction: source.Falloff.Reduction };
      attacks[attack.name] = values;
    }
    weapons[item.id] = { name: item.name, beam: weapon.CompatibilityTags?.includes('BEAM') ?? false, ...referenceFields(weapon), attacks };
  }
  return weapons;
}
