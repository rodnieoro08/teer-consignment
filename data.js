const CATALOG = [
  { sku: "CDS0602-NT",  family: "MitraClip G3", kind: "CDS", size: "NT",  label: "G3 NT Clip Delivery System" },
  { sku: "CDS0602-XT",  family: "MitraClip G3", kind: "CDS", size: "XT",  label: "G3 XT Clip Delivery System" },
  { sku: "SGC0602",     family: "MitraClip G3", kind: "SGC", size: "SGC", label: "G3 Steerable Guide Catheter" },
  { sku: "CDS0802-NT",  family: "MitraClip G5", kind: "CDS", size: "NT",  label: "G5 NT Clip Delivery System" },
  { sku: "CDS0802-NTW", family: "MitraClip G5", kind: "CDS", size: "NTW", label: "G5 NTW Clip Delivery System" },
  { sku: "CDS0802-XT",  family: "MitraClip G5", kind: "CDS", size: "XT",  label: "G5 XT Clip Delivery System" },
  { sku: "CDS0802-XTW", family: "MitraClip G5", kind: "CDS", size: "XTW", label: "G5 XTW Clip Delivery System" },
  { sku: "SGC0802",     family: "MitraClip G5", kind: "SGC", size: "SGC", label: "G5 Steerable Guide Catheter" },
  { sku: "MC0802-NT",   family: "MitraClip G5", kind: "BUNDLE", size: "NT",  label: "G5 NT bundle (CDS + SGC)" },
  { sku: "MC0802-NTW",  family: "MitraClip G5", kind: "BUNDLE", size: "NTW", label: "G5 NTW bundle (CDS + SGC)" },
  { sku: "MC0802-XT",   family: "MitraClip G5", kind: "BUNDLE", size: "XT",  label: "G5 XT bundle (CDS + SGC)" },
  { sku: "MC0802-XTW",  family: "MitraClip G5", kind: "BUNDLE", size: "XTW", label: "G5 XTW bundle (CDS + SGC)" },
  { sku: "CDS0707-NT",  family: "MitraClip G4", kind: "CDS", size: "NT",  label: "G4 NT Clip Delivery System" },
  { sku: "CDS0707-NTW", family: "MitraClip G4", kind: "CDS", size: "NTW", label: "G4 NTW Clip Delivery System" },
  { sku: "CDS0707-XT",  family: "MitraClip G4", kind: "CDS", size: "XT",  label: "G4 XT Clip Delivery System" },
  { sku: "CDS0707-XTW", family: "MitraClip G4", kind: "CDS", size: "XTW", label: "G4 XTW Clip Delivery System" },
  { sku: "SGC0707",     family: "MitraClip G4", kind: "SGC", size: "SGC", label: "G4 Steerable Guide Catheter" },
  { sku: "MC0707-NT",   family: "MitraClip G4", kind: "BUNDLE", size: "NT",  label: "G4 NT bundle (CDS + SGC)" },
  { sku: "MC0707-NTW",  family: "MitraClip G4", kind: "BUNDLE", size: "NTW", label: "G4 NTW bundle (CDS + SGC)" },
  { sku: "MC0707-XT",   family: "MitraClip G4", kind: "BUNDLE", size: "XT",  label: "G4 XT bundle (CDS + SGC)" },
  { sku: "MC0707-XTW",  family: "MitraClip G4", kind: "BUNDLE", size: "XTW", label: "G4 XTW bundle (CDS + SGC)" },
  { sku: "TCDS0307-NT",  family: "TriClip G4", kind: "CDS", size: "NT",  label: "TriClip G4 NT delivery system" },
  { sku: "TCDS0307-NTW", family: "TriClip G4", kind: "CDS", size: "NTW", label: "TriClip G4 NTW delivery system" },
  { sku: "TCDS0307-XT",  family: "TriClip G4", kind: "CDS", size: "XT",  label: "TriClip G4 XT delivery system" },
  { sku: "TCDS0307-XTW", family: "TriClip G4", kind: "CDS", size: "XTW", label: "TriClip G4 XTW delivery system" },
  { sku: "TSGC0207",     family: "TriClip G4", kind: "SGC", size: "SGC", label: "TriClip G4 steerable guide catheter" },
  { sku: "TC0307-NT",    family: "TriClip G4", kind: "BUNDLE", size: "NT",  label: "TriClip G4 NT bundle (delivery system + guide)" },
  { sku: "TC0307-NTW",   family: "TriClip G4", kind: "BUNDLE", size: "NTW", label: "TriClip G4 NTW bundle (delivery system + guide)" },
  { sku: "TC0307-XT",    family: "TriClip G4", kind: "BUNDLE", size: "XT",  label: "TriClip G4 XT bundle (delivery system + guide)" },
  { sku: "TC0307-XTW",   family: "TriClip G4", kind: "BUNDLE", size: "XTW", label: "TriClip G4 XTW bundle (delivery system + guide)" },
  { sku: "TCDS0802-NT",  family: "TriClip G5", kind: "CDS", size: "NT",  label: "TriClip G5 NT delivery system" },
  { sku: "TCDS0802-NTW", family: "TriClip G5", kind: "CDS", size: "NTW", label: "TriClip G5 NTW delivery system" },
  { sku: "TCDS0802-XT",  family: "TriClip G5", kind: "CDS", size: "XT",  label: "TriClip G5 XT delivery system" },
  { sku: "TCDS0802-XTW", family: "TriClip G5", kind: "CDS", size: "XTW", label: "TriClip G5 XTW delivery system" },
  { sku: "TSGC0802",     family: "TriClip G5", kind: "SGC", size: "SGC", label: "TriClip G5 steerable guide catheter" },
  { sku: "TC0802-NT",    family: "TriClip G5", kind: "BUNDLE", size: "NT",  label: "TriClip G5 NT bundle (delivery system + guide)" },
  { sku: "TC0802-NTW",   family: "TriClip G5", kind: "BUNDLE", size: "NTW", label: "TriClip G5 NTW bundle (delivery system + guide)" },
  { sku: "TC0802-XT",    family: "TriClip G5", kind: "BUNDLE", size: "XT",  label: "TriClip G5 XT bundle (delivery system + guide)" },
  { sku: "TC0802-XTW",   family: "TriClip G5", kind: "BUNDLE", size: "XTW", label: "TriClip G5 XTW bundle (delivery system + guide)" },
  { sku: "SZR07ST", family: "Accessory", kind: "ACC", size: "ACC", label: "Stabilizer" },
  { sku: "LFT07ST", family: "Accessory", kind: "ACC", size: "ACC", label: "Lift" },
  { sku: "PLT07ST", family: "Accessory", kind: "ACC", size: "ACC", label: "Support plate" },
  { sku: "SZR07", family: "Accessory", kind: "ACC", size: "ACC", label: "Stabilizer SZR07" },
  { sku: "LFT07", family: "Accessory", kind: "ACC", size: "ACC", label: "Lift LFT07" },
  { sku: "PLT07", family: "Accessory", kind: "ACC", size: "ACC", label: "Support plate PLT07" },
  { sku: "SZR08", family: "Accessory", kind: "ACC", size: "ACC", label: "Stabilizer SZR08" }
];

const HOSPITALS = [
  { id: "barts", name: "St Bartholomew's (Barts)", city: "London", region: "London" },
  { id: "brompton", name: "Royal Brompton", city: "London", region: "London" },
  { id: "harefield", name: "Harefield", city: "London", region: "London" },
  { id: "hammersmith", name: "Hammersmith", city: "London", region: "London" },
  { id: "kings", name: "King's College Hospital", city: "London", region: "London" },
  { id: "stthomas", name: "St Thomas'", city: "London", region: "London" },
  { id: "brighton", name: "Royal Sussex, Brighton", city: "Brighton", region: "South East" },
  { id: "oxford", name: "John Radcliffe, Oxford", city: "Oxford", region: "South East" },
  { id: "southampton", name: "Southampton General", city: "Southampton", region: "South East" },
  { id: "bristol", name: "Bristol Royal Infirmary", city: "Bristol", region: "South West" },
  { id: "papworth", name: "Royal Papworth", city: "Cambridge", region: "East" },
  { id: "basildon", name: "Basildon", city: "Basildon", region: "East" },
  { id: "qehb", name: "QE Birmingham", city: "Birmingham", region: "Midlands" },
  { id: "glenfield", name: "Glenfield, Leicester", city: "Leicester", region: "Midlands" },
  { id: "stoke", name: "Royal Stoke", city: "Stoke", region: "Midlands" },
  { id: "wolves", name: "New Cross, Wolverhampton", city: "Wolverhampton", region: "Midlands" },
  { id: "nottingham", name: "Nottingham", city: "Nottingham", region: "Midlands" },
  { id: "wythenshawe", name: "Wythenshawe, Manchester", city: "Manchester", region: "North West" },
  { id: "lhch", name: "Liverpool Heart & Chest", city: "Liverpool", region: "North West" },
  { id: "leeds", name: "Leeds General Infirmary", city: "Leeds", region: "Yorkshire & NE" },
  { id: "jamescook", name: "James Cook, Middlesbrough", city: "Middlesbrough", region: "Yorkshire & NE" },
  { id: "freeman", name: "Freeman, Newcastle", city: "Newcastle", region: "Yorkshire & NE" },
  { id: "glasgow", name: "Golden Jubilee, Glasgow", city: "Glasgow", region: "Scotland" },
  { id: "edinburgh", name: "Royal Infirmary Edinburgh", city: "Edinburgh", region: "Scotland" },
  { id: "cardiff", name: "University Hospital Cardiff", city: "Cardiff", region: "Wales" },
  { id: "belfast", name: "Royal Victoria, Belfast", city: "Belfast", region: "Northern Ireland" }
];

const DEMO_SERIALS = [
  "G5XTW10001", "G5XTW10002", "G5NTW10011", "G5NT010021", "G5SGC10031", "G5SGC10032",
  "G5XTW20001", "G5XT020011", "G5SGC20021", "G5NTW30001", "G5XTW30002", "G5SGC30011",
  "G4XTW40001", "G4NTW40011", "G4SGC40021", "G5XTW50001", "G5NT060011", "G5SGC60021",
  "G5XTW70001", "G5NTW80001", "TCXTW90001", "TCSGC90011", "TC5NTW91001"
];

// Demo units carry demo: true. Phones that loaded the demo before that flag existed
// are recognised by these exact example serials.
function isDemoUnit(unit) {
  return !!unit && (unit.demo === true || DEMO_SERIALS.indexOf(unit.serial) !== -1);
}

function demoUnits() {
  // Dates are relative to today so the demo always shows one expired unit, a few
  // close to expiry, and the rest comfortably in date.
  const inDays = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  };
  const add = (hospitalId, sku, serial, days, status = "in-stock") => ({
    id: crypto.randomUUID(),
    hospitalId, sku, serial, lot: serial.slice(0, 6),
    expiry: inDays(days), status, notes: "", demo: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  return [
    add("barts", "CDS0802-XTW", "G5XTW10001", 75),
    add("barts", "CDS0802-XTW", "G5XTW10002", 410),
    add("barts", "CDS0802-NTW", "G5NTW10011", 21),
    add("barts", "CDS0802-NT",  "G5NT010021", 58),
    add("barts", "SGC0802",     "G5SGC10031", 200),
    add("barts", "SGC0802",     "G5SGC10032", 320),
    add("papworth", "CDS0802-XTW", "G5XTW20001", 150),
    add("papworth", "CDS0802-XT",  "G5XT020011", 12),
    add("papworth", "SGC0802",     "G5SGC20021", 240),
    add("wythenshawe", "CDS0802-NTW", "G5NTW30001", 280),
    add("wythenshawe", "CDS0802-XTW", "G5XTW30002", 280),
    add("wythenshawe", "SGC0802", "G5SGC30011", 365),
    add("leeds", "CDS0707-XTW", "G4XTW40001", 44),
    add("leeds", "CDS0707-NTW", "G4NTW40011", -9),
    add("leeds", "SGC0707", "G4SGC40021", 130),
    add("stthomas", "CDS0802-XTW", "G5XTW50001", 300),
    add("oxford", "CDS0802-NT", "G5NT060011", 190),
    add("oxford", "SGC0802", "G5SGC60021", 190),
    add("qehb", "CDS0802-XTW", "G5XTW70001", 95),
    add("lhch", "CDS0802-NTW", "G5NTW80001", 170),
    add("papworth", "TCDS0307-XTW", "TCXTW90001", 330),
    add("papworth", "TSGC0207", "TCSGC90011", 330),
    add("barts", "TCDS0802-NTW", "TC5NTW91001", 390)
  ];
}
