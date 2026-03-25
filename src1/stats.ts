/* 
  current mechanic: 
  - this.agl = (this.agl_r + this.agla) * this.aglm * this.agle;
  - Sun blessing effect: player.hpmax += 100; player.str += 5; ....

  e.g. 4 numbers: value = base * pct * mult + flat
  
  item: +10 str, +2% str, +10 int, +20 dark resistance, -400 max_hp, vampirism 2%
  new Item(...new Stats({[SN.str]: new Stat({base: 10, pct: 2}), [SN.int]: new Stat({base: 10}), [SN.dres]: new Stat({base: 20}), [SN.maxHp]: new Stat({flat: -400}), [SN.vamp]: new Stat({pct: 2})})...)

  just throw them in packs

  player.stats.add(item1.stats)
  player.stats.sub(item2.stats)
  player.stats.add(skill1.stats)
  player.stats.add(effect1.stats)
  player.stats.sub(effect2.stats)
  player.stats.add(title4.stats)

  when need some stat (calculated value):
  player.stats.get(SN.str), e.g. base * pct * mult + flat
*/

enum SN {
  str = "Strength",
  agi = "Agility",
  int = "Intellegence",
  luck = "Luck",

  hp_max = "Health Max",
  mp_max = "Mana Max",
  c_res = "Cold Resistance",
  f_res = "Fire Resistance",

  poison_res = "Poison Resistance",
  burn_res = "Burn Resistance",
  frost_res = "Frost Resistance",
  paralize_res = "Paralize Resistance",
  blind_res = "Blind Resistance",
  sleep_res = "Sleep Resistance",
  curse_res = "Curse Resistance",
  death_res = "Death Resistance",
  bleed_res = "Bleed Resistance",
  phys_res = "Physical Resistance",
  venom_res = "Venom Resistance",
  fpoison_res = "Fpoison Resistance",
}

function assertKnownStat(s: string): asserts s is SN {
  if (!Object.values(SN).includes(s as SN)) {
    throw new Error(`"${s}" is not a valid SN value. Valid values: ${Object.values(SN).join(", ")}`);
  }
}

class Stat {
  public base: number;
  public pct: number;
  public mult: number;
  public flat: number;

  constructor(config: { base?: number; pct?: number; mult?: number; flat?: number }) {
    this.base = config.base ?? 0;
    this.pct = config.pct ?? 0;
    this.mult = config.mult ?? 1;
    this.flat = config.flat ?? 0;
  }

  static createFrom(other: Stat) {
    return new Stat({ base: other.base, pct: other.pct, mult: other.mult, flat: other.flat })
  }

  add(other: Stat) {
    this.base += other.base; this.pct += other.pct; this.mult *= other.mult; this.flat += other.flat
  }

  sub(other: Stat) {
    this.base -= other.base; this.pct -= other.pct; this.mult /= other.mult; this.flat -= other.flat;
  }

  get(): number {
    let v = this.base * (1 + this.pct / 100) * this.mult + this.flat
    return v
  };
}

class MinStat extends Stat {
  public min: number;

  constructor(config: { base?: number; pct?: number; mult?: number; flat?: number; min?: number }) {
    super(config)
    this.min = config.min ?? 0
  }

  static override createFrom(other: Stat, min: number = 0) {
    return new MinStat({ base: other.base, pct: other.pct, mult: other.mult, flat: other.flat, min: min })
  }

  override get(): number {
    let v = super.get()
    return Math.max(v, this.min)
  }
}

class Stats {
  private stats: Map<string, Stat> = new Map();

  constructor(statsDict?: Object) {
    for (let [k, v] of Object.entries(statsDict ?? {})) {
      assertKnownStat(k)
      this.stats.set(k, v)
    }
  }

  addStat(key: string, s: Stat) {
    assertKnownStat(key)
    if (this.stats.has(key))
      throw new Error(`stat ${key} already exists in Stats`);
    this.stats.set(key, s)
  }

  *[Symbol.iterator](): IterableIterator<[string, Stat]> {
    for (const [key, stat] of this.stats.entries()) {
      yield [key, stat];
    }
  }

  has(key: string): boolean {
    assertKnownStat(key)
    return this.stats.has(key)
  }

  get(key: string): number {
    assertKnownStat(key)
    if (!this.stats.has(key))
      throw new Error(`stat ${key} not exists in Stats`);
    return this.stats.get(key)!.get()
  }

  add(other: Stats) {
    for (const [key, stat] of other) {
      if (!this.stats.has(key))
        throw new Error(`attempt add stat: ${key}, not exists`);
      this.stats.get(key)!.add(stat);
    }
  }

  sub(other: Stats) {
    for (const [key, stat] of other) {
      if (!this.stats.has(key))
        throw new Error(`attempt sub stat: ${key}, not exists`);
      this.stats.get(key)!.sub(stat);
    }
  }
}

let raw_stats = new Stats();
[SN.str, SN.luck, SN.int, SN.agi]
  .forEach(name => raw_stats.addStat(name, new Stat({ base: 1 })));
[SN.c_res, SN.f_res]
  .forEach(name => raw_stats.addStat(name, new Stat({ base: 0 })));
// or load from file

let stats = new Stats();
for (const [key, stat] of raw_stats) {
  raw_stats.addStat(key, MinStat.createFrom(stat))
}

let player = { raw_stats: raw_stats, stats: stats };
/*
next I thought of some stats, that depends on other
like stamina = 2*strength + 0.1 * hpmax
but checked code and founded only too coupuled formulas, that depends on lot of things
like this
let lose = you.mods.sdrate;
if (flags.iswet === true) lose *= (3 / (1 + (skl.abw.lvl * .03)))
if (flags.iscold === true) lose += effect.cold.duration / 1000 / (1 + skl.coldr.lvl * .05);
I think this extension with delegat is excess
*/
class CustomStat extends Stat {
  private stats: Stats;
  private formula: (stats: Stats) => number

  constructor(
    config: { base?: number; pct?: number; mult?: number; flat?: number; },
    stats: Stats,
    dependsOn: string[],
    formula: (stats: Stats) => number
  ) {
    for (const name of dependsOn) {
      assertKnownStat(name)
      if (stats.has(name)) continue
      throw new Error(`stat ${name} not exists in stats`)
    }
    super(config)
    this.stats = stats
    this.formula = formula
  }

  override get(): number {
    this.base = this.formula(this.stats)
    let v = super.get()
    return v
  }
}

