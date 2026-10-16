// Public Export also contains unused and retired blueprints. These exceptions
// record acquisition references or the export's own unused-item flags. Keep the
// exported IDs/costs for supported recipes; do not infer recipes from names.
const groups = [
  { reason: 'Purchased built; the exported tool blueprint is unused.', source: 'https://wiki.warframe.com/w/Mining', names: ['Nosam Cutter', 'Focused Nosam Cutter', 'Advanced Nosam Cutter', 'Sunpoint Plasma Drill'] },
  { reason: 'Purchased built; the exported fishing-spear blueprint is unused.', source: 'https://wiki.warframe.com/w/Fishing', names: ['Lanzo Fishing Spear', 'Tulok Fishing Spear', 'Peram Fishing Spear', 'Shockprod Fishing Spear', 'Stunna Fishing Spear'] },
  { reason: 'Purchased built from Daughter.', source: 'https://wiki.warframe.com/w/Daughter', names: ['Processed Fass Residue', 'Processed Vome Residue'] },
  { reason: 'Quest blueprint removed; the quest is granted directly.', source: 'https://wiki.warframe.com/w/Hidden_Messages', names: ['The Limbo Theorem', 'Hidden Messages', 'Patient Zero'] },
  { reason: 'Quest is started directly; its consumable recipes are separate.', source: 'https://wiki.warframe.com/w/The_Silver_Grove', names: ['The Silver Grove'] },
  { reason: 'Quest is started directly; its consumable recipes are separate.', source: 'https://wiki.warframe.com/w/The_Jordas_Precept', names: ['The Jordas Precept'] },
  { reason: 'Unused item excluded from the Codex in Public Export.', names: ['Test Forma', 'Echoes Of Umbra'] },
  { reason: 'Landing craft is awarded built; component blueprints are unused.', source: 'https://wiki.warframe.com/w/Nightwave_(Landing_Craft)', names: ['Nightwave', 'Nightwave Avionics', 'Nightwave Engines', 'Nightwave Fuselage'] },
  { reason: 'Awarded built; the exported blueprint is unused.', source: 'https://wiki.warframe.com/w/Eidolon_Ephemera', names: ['Eidolon Ephemera'] },
  { reason: 'Purchased built from the Market.', source: 'https://wiki.warframe.com/w/Armor_(Cosmetic)', names: ['Daedalus Chest Plate', 'Daedalus Spurs', 'Daedalus Shoulder Plates', 'Edo Chest Plate', 'Edo Shin Plates', 'Edo Shoulder Plates', 'Eos Chest Plate', 'Eos Spurs', 'Eos Shoulder Plates'] },
  { reason: 'Purchased built from the Market.', source: 'https://wiki.warframe.com/w/Weapon_Cosmetics', names: ['Detron Shock-Camo Skin', 'Penta Shock-Camo Skin', 'Prova Shock-Camo Skin', 'Scindo Forest-Camo Skin', 'Soma Forest-Camo Skin', 'Akvasto Forest-Camo Skin', 'Daman Sugatra', 'Pazza Sugatra', 'Tantu Sugatra'] },
  { reason: 'Purchased built from the Market.', source: 'https://wiki.warframe.com/w/Warframe_Cosmetics', names: ['Excalibur Immortal Skin', 'Frost Immortal Skin', 'Ember Immortal Skin', 'Yomo Syandana', 'Asa Syandana', 'Uru Syandana', 'Diriga Desert-Camo Skin'] },
  { reason: 'Retired or unused Railjack resource blueprint.', source: 'https://wiki.warframe.com/w/Railjack/Resources', names: ['Aucrux Capacitors', 'Bracoid', 'Copernics', 'Fresnels', 'Kesslers', 'Komms', 'Pustrels', 'Trachons'] },
];
const byName = new Map(groups.flatMap(({ names, ...entry }) => names.map(name => [name, entry])));

export function craftingExclusion(item, name) {
  if (item?.category === 'Arcanes') return { reason: 'Arcane blueprints were retired; arcanes are acquired built.', source: 'https://wiki.warframe.com/w/Update_24#Update_24.6' };
  return byName.get(name);
}
