// Unmodified game scenes from browse.wf. Labels identify the pictured environment.
const icon = (file, label) => ({ url: `https://browse.wf/Lotus/Interface/Icons/${file}.png`, label, fit: 'cover' });
const graphic = (file, label) => ({ url: `https://browse.wf/Lotus/Interface/Graphics/${file}.png`, label, fit: 'cover' });
const captura = (file, label) => icon(`StoreIcons/Captura/${file}`, label);
export const missionScenes = Object.fromEntries([
  ['Assassination', 'Assassination'], ['Capture', 'Capture'], ['Defense', 'Defense'],
  ['Excavation', 'Excavation'], ['Exterminate', 'Exterminate'], ['Interception', 'Interception'],
  ['Mobile Defense', 'MobileDefense'], ['Rescue', 'Rescue'], ['Sabotage', 'Sabotage'],
  ['Spy', 'Spy'], ['Survival', 'Survival'], ['Hijack', 'Hijack'], ['Arena', 'Index'],
  ['Conclave', 'Annihilation'], ['Skirmish', 'Railjack'],
].map(([name, file]) => [name, icon(`CodexGameModes/${file}`, name)]));

export const locationScenes = {
  Earth: icon('GrineerForestB', 'Earth · Grineer Forest'),
  Mars: icon('GrineerSettlementB', 'Mars · Grineer Settlement'),
  Jupiter: icon('CorpusGasCityB', 'Jupiter · Corpus Gas City'),
  Mercury: icon('GrineerAsteroid', 'Mercury · Grineer Asteroid'),
  Saturn: icon('GrineerGalleonB', 'Saturn · Grineer Galleon'),
  Uranus: icon('GrineerSealabB', 'Uranus · Grineer Sealab'),
  Ceres: icon('GrineerShipyardB', 'Ceres · Grineer Shipyard'),
  Eris: icon('InfestedCorpusShipB', 'Eris · Infested Ship'),
  Europa: icon('CorpusIcePlanet', 'Europa · Corpus Ice Planet'),
  Venus: icon('CorpusIcePlanet', 'Venus · Corpus Outpost'),
  Neptune: icon('CorpusShipB', 'Neptune · Corpus Ship'),
  Pluto: icon('CorpusIcePlanet', 'Pluto · Corpus Outpost'),
  Sedna: icon('GrineerGalleonB', 'Sedna · Grineer Galleon'),
  Phobos: icon('CorpusShipB', 'Phobos · Corpus Ship'),
  Deimos: captura('OrokinDerelicPlaza', 'Deimos · Orokin Derelict'),
  Void: icon('OrokinTowerB', 'Void · Orokin Tower'),
  Lua: icon('OrokinMoonB', 'Lua · Orokin Moon'),
  'Kuva Fortress': icon('FortressTilesetB', 'Kuva Fortress'),
  Cetus: icon('EidolonPlainsB', 'Plains of Eidolon'),
  'Orb Vallis': captura('VallisLandscape', 'Orb Vallis'),
  'Cambion Drift': captura('DeimosCambionDriftLandscape', 'Cambion Drift'),
  Zariman: captura('Zariman/ZarParkHub', 'Zariman · Chrysalith'),
  Sanctuary: captura('SimarisOnslaught', 'Sanctuary Onslaught'),
  'Veil Proxima': captura('SentientIntReverence', 'Veil Proxima · Sentient Anomaly'),
  Höllvania: captura('1999/VaniaConStreetStrencu', 'Höllvania'),
  "Albrecht's Laboratories": captura('Entrati/TriExperiment', "Albrecht's Laboratories"),
  Duviri: graphic('Duviri/StarchartNodes/DuviriFullExperienceBack', 'Duviri'),
};

Object.assign(missionScenes, {
  'Sanctuary Onslaught': locationScenes.Sanctuary,
  'The Circuit': captura('Duviri/DuviriArenaVoidNether', 'The Circuit · Undercroft'),
  Alchemy: locationScenes["Albrecht's Laboratories"],
});

export const currencyArt = {
  Endo: { ...icon('StoreIcons/Currency/EndoIconRenderLarge', 'Endo'), fit: 'contain' },
  Credits: { ...icon('StoreIcons/Currency/GenericCreditIcon', 'Credits'), fit: 'contain' },
};
