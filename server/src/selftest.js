// Самотест: прогоняет много партий ботов во всех режимах и проверяет инварианты.
process.env.NO_PERSIST = '1';
const { Game, MODES, roleSetup } = await import('./game.js');
const store = await import('./store.js');

let failures = 0;
const assert = (cond, msg) => {
  if (!cond) {
    failures++;
    console.error('FAIL:', msg);
  }
};

// раздача ролей
for (const mode of Object.keys(MODES)) {
  for (let n = MODES[mode].min; n <= MODES[mode].max; n++) {
    const r = roleSetup(n, mode);
    assert(r.length === n, `${mode}/${n}: длина ролей`);
    assert(r.filter((x) => x === 'mafia').length >= 1, `${mode}/${n}: есть мафия`);
    assert(r.filter((x) => x === 'mafia').length < n / 2, `${mode}/${n}: мафия меньше половины`);
    assert(r.filter((x) => x === 'commissar').length === 1, `${mode}/${n}: один комиссар`);
  }
}

function playOne(mode, n) {
  return new Promise((resolve) => {
    const room = new Game({
      name: 't',
      mode,
      max: n,
      fastBots: true,
      onChange: () => {},
      onFinish: (r) => resolve(r),
    });
    while (room.players.length < n) room.addBot();
    const res = room.start();
    assert(res.ok, `start ${mode}/${n}`);
    setTimeout(() => {
      if (room.phase !== 'end') {
        failures++;
        console.error('FAIL: игра не завершилась', mode, n, room.phase, room.day);
        room.destroy();
        resolve(room);
      }
    }, 8000);
  });
}

const stats = { mafia: 0, civilians: 0 };
const jobs = [];
for (let i = 0; i < 40; i++) {
  for (const mode of Object.keys(MODES)) {
    const n = MODES[mode].min + Math.floor(Math.random() * (MODES[mode].max - MODES[mode].min + 1));
    jobs.push(playOne(mode, n));
  }
}
const results = await Promise.all(jobs);
for (const r of results) {
  assert(r.phase === 'end', 'phase end');
  assert(r.winner === 'mafia' || r.winner === 'civilians', 'есть победитель');
  stats[r.winner]++;
  const alive = r.players.filter((p) => p.alive);
  const mafia = alive.filter((p) => p.role === 'mafia').length;
  if (r.winner === 'mafia') assert(mafia >= alive.length - mafia, 'победа мафии корректна');
  else assert(mafia === 0, 'победа мирных корректна');
  r.destroy();
}

// проверка приватности view(): обычный игрок не видит чужие роли
{
  const u1 = store.getOrCreateUser('t1', 'Alice');
  const room = new Game({ name: 'v', mode: 'classic', max: 6, host: u1, fastBots: true, onChange: () => {}, onFinish: () => {} });
  while (room.players.length < 6) room.addBot();
  room.start();
  const v = room.view(u1.id);
  const me = room.byId(u1.id);
  const leaked = v.players.filter((p) => p.id !== u1.id && p.role && !(me.role === 'mafia' && p.role === 'mafia'));
  assert(leaked.length === 0, 'чужие роли не утекают в view()');
  assert(v.me.role === me.role, 'своя роль видна');
  room.destroy();
}

// магазин
{
  const u = store.getOrCreateUser('t2', 'Bob');
  assert(store.buy(u, 'boss').ok, 'покупка скина');
  assert(!store.buy(u, 'boss').ok, 'повторная покупка запрещена');
  assert(store.selectSkin(u, 'boss').ok, 'выбор скина');
  assert(!store.selectSkin(u, 'ninja').ok, 'нельзя выбрать некупленный скин');
  assert(store.buy(u, 't_commissar').ok, 'покупка билета');
  assert(u.tickets.commissar === 1, 'билет добавлен');
}

console.log(`Партий: ${results.length}, победы мафии: ${stats.mafia}, мирных: ${stats.civilians}`);
if (failures) {
  console.error(`Провалено проверок: ${failures}`);
  process.exit(1);
}
console.log('OK — все проверки пройдены');
process.exit(0);
