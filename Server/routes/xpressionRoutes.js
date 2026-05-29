const express = require("express");
const router = express.Router();

const Match = require("../models/Match");
const Team = require("../models/Team");
const { xpressionLogger } = require("../modules/logger");

const heroesRaw = require("../../Client/src/assets/heroes_UO.json");
const mapsRaw = require("../../Client/src/assets/maps.json");

let currentStatsPayload = null;
let currentDraftPayload = null;
let currentDraftMapMeta = null;
let lastDraftSignature = "";
let lastDraftData = [];
let draftLoopSteps = [];
let draftSourceData = [];
let loopTimer = null;
let loopIndex = 0;
let phaseStartedAt = null;

const PHASE_SECONDS = 25;

const heroMap = Object.fromEntries(
  (Array.isArray(heroesRaw) ? heroesRaw : []).map((hero) => [
    String(hero.id),
    hero,
  ]),
);

const mapMap = Object.fromEntries(
  (Array.isArray(mapsRaw) ? mapsRaw : []).map((map) => [String(map.id), map]),
);

function getCurrentTime() {
  return new Date().toTimeString().split(" ")[0];
}

function normalizeHeroName(name = "") {
  return String(name)
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (s) => s.toUpperCase());
}

function getHeroBaseId(heroId) {
  const id = Number(heroId);

  if (id === 10571 || id === 10572 || id === 10573) {
    return 1057;
  }

  return id;
}

function getHeroNameDraft(heroId, type = "") {
  const id = Number(heroId);

  if (!id || id === 0) {
    if (type === "PICK") return "NO LOCK";
    if (type === "BAN") return "NO BAN";
    return "Hero 0";
  }

  const baseId = getHeroBaseId(id);
  const hero = heroMap[String(baseId)];

  return hero ? normalizeHeroName(hero.name) : `Hero ${id}`;
}

function getHeroName(heroId) {
  const id = Number(heroId);

  if (!id || id === 0) {
    return "Hero 0";
  }

  const baseId = getHeroBaseId(id);
  const hero = heroMap[String(baseId)];

  return hero ? normalizeHeroName(hero.name) : `Hero ${id}`;
}

function getHeroRole(heroId) {
  const id = Number(heroId);

  if (!id) return "None";

  const baseId = getHeroBaseId(id);
  const hero = heroMap[String(baseId)];

  if (!hero) return "Unknown";

  if (id === 10571 && Array.isArray(hero.role))
    return hero.role[0] || "Vanguard";
  // return hero.role[0] || "Duelist";
  if (id === 10572 && Array.isArray(hero.role))
    return hero.role[0] || "Duelist";
  // return hero.role[1] || "Vanguard";
  if (id === 10573 && Array.isArray(hero.role))
    return hero.role[2] || "Strategist";

  if (Array.isArray(hero.role)) return hero.role[0] || "Unknown";

  return hero.role || "Unknown";
}

function getMapMeta(mapId) {
  const map = mapMap[String(mapId)] || {};

  return {
    id: Number(mapId || 0),
    name: (
      map.sub_name ||
      map.full_name ||
      map.name ||
      `Map ${mapId || 0}`
    ).toUpperCase(),
    mode: (map.game_mode || "").toUpperCase(),
  };
}

function getDraftTimer() {
  if (!phaseStartedAt) {
    return {
      phase_seconds: PHASE_SECONDS,
      remaining: PHASE_SECONDS,
      elapsed: 0,
      is_running: false,
    };
  }

  const elapsed = Math.floor((Date.now() - phaseStartedAt) / 1000);
  const remaining = Math.max(PHASE_SECONDS - elapsed, 0);

  return {
    phase_seconds: PHASE_SECONDS,
    remaining,
    elapsed,
    is_running: remaining > 0,
  };
}

function normalizeDraftItemForSlot(item = {}) {
  const round = Number(item.round_index ?? item.roundIndex ?? item.round ?? 0);

  const type =
    Number(item.operate_type ?? item.operateType) === 1 ||
    String(item.type || "").toUpperCase() === "PICK"
      ? "PICK"
      : "BAN";

  let camp = Number(item.camp || 0);

  // Fallback if camp is missing but battle_side exists
  // battle_side 0 = Blue/camp 1
  // battle_side 1 = Red/camp 2
  if (!camp && item.battle_side !== undefined) {
    camp = Number(item.battle_side) === 1 ? 2 : 1;
  }

  if (!camp && item.battleSide !== undefined) {
    camp = Number(item.battleSide) === 1 ? 2 : 1;
  }

  const heroId = Number(
    item.hero_id ??
      item.heroId ??
      item.cur_pick_hero ??
      item.suggest_hero ??
      item.hero?.id ??
      0,
  );

  return {
    round,
    type,
    camp,
    heroId,
  };
}

function inferFirstPickerPhase1(data = []) {
  const round1Pick = data.find((item) => {
    const round = Number(
      item.round_index ?? item.roundIndex ?? item.round ?? -1,
    );
    const operateType = Number(item.operate_type ?? item.operateType ?? 0);

    return round === 1 && operateType === 1;
  });

  const camp = Number(round1Pick?.camp || 0);

  if (camp === 1 || camp === 2) return camp;

  return 1; // fallback only
}

function normalizeDraftCampByRound(item) {
  const round = Number(item.round_index ?? item.round);
  const type =
    Number(item.operate_type) === 1 || item.type === "PICK" ? "PICK" : "BAN";

  const campByRound = {
    "1_PICK": 1,
    "2_BAN": 2,
    "3_PICK": 2,
    "4_BAN": 1,
    "6_PICK": 2,
    "7_BAN": 1,
    "8_PICK": 1,
    "9_BAN": 2,
  };

  const key = `${round}_${type}`;

  if (campByRound[key]) {
    return {
      ...item,
      camp: campByRound[key],
    };
  }

  return item;
}

// function buildDraftPlan() {
//   return {
//     firstPickerPhase1: 1,
//     firstPickerPhase2: 2,

//     rounds: [
//       // Round 0: both teams ban at same time
//       { round_index: 0, phase: "BAN", camp: "BOTH", expected_count: 2 },

//       // Phase 1
//       { round_index: 1, phase: "PICK", camp: 1, expected_count: 1 },
//       { round_index: 2, phase: "BAN", camp: 2, expected_count: 1 },
//       { round_index: 3, phase: "PICK", camp: 2, expected_count: 1 },
//       { round_index: 4, phase: "BAN", camp: 1, expected_count: 1 },

//       // Round 5: both teams ban at same time
//       { round_index: 5, phase: "BAN", camp: "BOTH", expected_count: 2 },

//       // Phase 2
//       { round_index: 6, phase: "PICK", camp: 2, expected_count: 1 },
//       { round_index: 7, phase: "BAN", camp: 1, expected_count: 1 },
//       { round_index: 8, phase: "PICK", camp: 1, expected_count: 1 },
//       { round_index: 9, phase: "BAN", camp: 2, expected_count: 1 },
//     ],
//   };
// }
function buildDraftPlan(firstPickerPhase1 = 1) {
  const first = firstPickerPhase1 === 2 ? 2 : 1;
  const second = first === 1 ? 2 : 1;

  return {
    firstPickerPhase1: first,
    firstPickerPhase2: second,

    rounds: [
      { round_index: 0, phase: "BAN", camp: "BOTH", expected_count: 2 },

      { round_index: 1, phase: "PICK", camp: first, expected_count: 1 },
      { round_index: 2, phase: "BAN", camp: second, expected_count: 1 },
      { round_index: 3, phase: "PICK", camp: second, expected_count: 1 },
      { round_index: 4, phase: "BAN", camp: first, expected_count: 1 },

      { round_index: 5, phase: "BAN", camp: "BOTH", expected_count: 2 },

      { round_index: 6, phase: "PICK", camp: second, expected_count: 1 },
      { round_index: 7, phase: "BAN", camp: first, expected_count: 1 },
      { round_index: 8, phase: "PICK", camp: first, expected_count: 1 },
      { round_index: 9, phase: "BAN", camp: second, expected_count: 1 },
    ],
  };
}

// function buildEmptyDraftSkeleton(firstPickerPhase1 = 1) {
//   const plan = buildDraftPlan(firstPickerPhase1);

//   const slotCounter = {
//     1: 0,
//     2: 0,
//   };

//   return plan.rounds.flatMap((round) => {
//     const camps = round.camp === "BOTH" ? [2, 1] : [Number(round.camp)];

//     return camps.map((camp) => {
//       slotCounter[camp] += 1;

//       return {
//         round: Number(round.round_index),
//         type: round.phase,
//         camp,
//         slot:
//           camp === 1 ? `Blue ${slotCounter[camp]}` : `Red ${slotCounter[camp]}`,
//         hero: {
//           id: 0,
//           name: "Hero 0",
//           role: "Unknown",
//         },
//         locked: false,
//         is_no_selection: false,
//       };
//     });
//   });
// }

function buildEmptyDraftSkeleton(firstPickerPhase1 = 1) {
  const plan = buildDraftPlan(firstPickerPhase1);

  const slotCounter = {
    1: 0,
    2: 0,
  };

  return plan.rounds.flatMap((round) => {
    const camps = round.camp === "BOTH" ? [2, 1] : [Number(round.camp)];

    return camps.map((camp) => {
      slotCounter[camp] += 1;

      return {
        round: Number(round.round_index),
        type: round.phase,
        camp,
        slot:
          camp === 1 ? `Blue ${slotCounter[camp]}` : `Red ${slotCounter[camp]}`,

        hero: {
          id: 0,
          name: "Hero 0",
          role: "Unknown",
        },

        locked: false,
        is_no_selection: false,
      };
    });
  });
}

function getDraftMeta(Draft = []) {
  const lockedSlots = Draft.filter((slot) => slot.locked);
  const next = Draft.find((slot) => !slot.locked);

  if (!next) {
    return {
      current_round: 10,
      phase: "END",
      active_camp: null,
      active_side: "-",
      is_complete: true,
      completed_steps: Draft.length,
      total_steps: Draft.length,
    };
  }

  const isSimultaneousBanRound = next.round === 0 || next.round === 5;

  return {
    current_round: next.round,
    phase: next.type,
    active_camp: isSimultaneousBanRound ? "BOTH" : next.camp,
    active_side: isSimultaneousBanRound
      ? "Both"
      : next.camp === 1
        ? "Blue"
        : "Red",
    is_complete: false,
    completed_steps: lockedSlots.length,
    total_steps: Draft.length,
  };
}

function getDraftItemType(item = {}, fallbackType = "BAN") {
  if (item.type) {
    return String(item.type).toUpperCase();
  }

  if (item.operate_type !== undefined) {
    return Number(item.operate_type) === 1 ? "PICK" : "BAN";
  }

  if (item.is_pick !== undefined) {
    return Number(item.is_pick) === 1 ? "PICK" : "BAN";
  }

  return fallbackType;
}

function getDraftItemRound(item = {}, fallbackRound = 0) {
  return Number(
    item.round_index ?? item.roundIndex ?? item.round ?? fallbackRound,
  );
}

function getDraftItemCamp(item = {}, fallbackCamp = 0) {
  if (item.camp !== undefined) {
    return Number(item.camp);
  }

  // battle_side 0 = camp 1 / Blue
  // battle_side 1 = camp 2 / Red
  if (item.battle_side !== undefined) {
    return Number(item.battle_side) === 1 ? 2 : 1;
  }

  if (item.effect_battle_side !== undefined) {
    return Number(item.effect_battle_side) === 1 ? 2 : 1;
  }

  return Number(fallbackCamp);
}

function getHeroIdFromDraftItem(item = {}) {
  return Number(
    item.hero_id ??
      item.heroId ??
      item.cur_pick_hero ??
      item.suggest_hero ??
      item.hero?.id ??
      0,
  );
}

function findDraftSlotIndex(Draft = [], item = {}, fallbackSlot = null) {
  if (!hasRoundIndex(item)) {
    return fallbackSlot?.index ?? -1;
  }

  const itemRound = getDraftItemRound(item);
  const itemType = getDraftItemType(item, fallbackSlot?.type);
  const itemCamp = getDraftItemCamp(item, fallbackSlot?.camp);

  return Draft.findIndex((slot) => {
    return (
      Number(slot.round) === itemRound &&
      String(slot.type).toUpperCase() === itemType &&
      Number(slot.camp) === itemCamp
    );
  });
}

function hasRoundIndex(item = {}) {
  return (
    item.round_index !== undefined ||
    item.roundIndex !== undefined ||
    item.round !== undefined
  );
}

// function buildDraft(data = [], options = {}, isLive = false) {
//   const Draft = buildEmptyDraftSkeleton();
//   const safeData = Array.isArray(data) ? data : [];

//   safeData.forEach((item, itemIndex) => {
//     const fallbackSlot = Draft[itemIndex]
//       ? {
//           index: itemIndex,
//           round: Draft[itemIndex].round,
//           type: Draft[itemIndex].type,
//           camp: Draft[itemIndex].camp,
//         }
//       : null;

//     const index = findDraftSlotIndex(Draft, item, fallbackSlot);
//     console.log("ada ke", index, item, fallbackSlot);

//     if (index === -1 || !Draft[index]) return;

//     const heroId = getHeroIdFromDraftItem(item);

//     const itemType = hasRoundIndex(item)
//       ? getDraftItemType(item, Draft[index].type)
//       : Draft[index].type;

//     const itemRound = hasRoundIndex(item)
//       ? getDraftItemRound(item, Draft[index].round)
//       : Draft[index].round;

//     const itemCamp = hasRoundIndex(item)
//       ? getDraftItemCamp(item, Draft[index].camp)
//       : Draft[index].camp;

//     Draft[index] = {
//       ...Draft[index],
//       round: itemRound,
//       type: itemType,
//       camp: itemCamp,

//       hero: {
//         id: heroId,
//         name: getHeroNameDraft(heroId, itemType),
//         role: getHeroRole(heroId),
//       },

//       // hero_id: 0 from API means the phase happened but no hero was selected
//       locked: true,
//       is_no_selection: heroId === 0,
//     };
//   });

//   console.log(
//     "Built draft with data:",
//     Draft.map((slot) => ({ ...slot, hero_id: Number(slot.hero_id) })),
//   );
//   return {
//     Map: currentDraftMapMeta || {},
//     Timer: getDraftTimer(),
//     Draft,
//     meta: getDraftMeta(Draft),
//   };
// }

function toDraftKey(slotName = "") {
  return String(slotName).trim().toLowerCase().replace(/\s+/g, "_");
}

function buildDraft(data = [], options = {}, isLive = false) {
  const safeData = Array.isArray(data) ? data : [];

  const firstPickerPhase1 =
    options.firstPickerPhase1 || inferFirstPickerPhase1(safeData);

  const Draft = buildEmptyDraftSkeleton(firstPickerPhase1);

  safeData.forEach((item) => {
    const normalized = normalizeDraftItemForSlot(item);

    const index = Draft.findIndex((slot) => {
      return (
        Number(slot.round) === normalized.round &&
        String(slot.type).toUpperCase() === normalized.type &&
        Number(slot.camp) === normalized.camp
      );
    });

    if (index === -1 || !Draft[index]) {
      console.warn(":warning: Draft item could not match skeleton slot:", {
        item,
        normalized,
        firstPickerPhase1,
      });
      return;
    }

    Draft[index] = {
      ...Draft[index],

      hero: {
        id: normalized.heroId,
        name: getHeroNameDraft(normalized.heroId, normalized.type),
        role: getHeroRole(normalized.heroId),
      },

      locked: true,
      is_no_selection: normalized.heroId === 0,
    };
  });

  // const DraftObject = Draft.map((slot) => {
  //   const data = {
  //     ...slot,
  //   };

  //   delete data.round;
  //   delete data.type;
  //   delete data.camp;
  //   delete data.slot;

  //   return [slot.slot, data];
  // });

  const DraftObject = Draft.reduce((acc, draftSlot) => {
    const slotKey = toDraftKey(draftSlot.slot);

    acc[slotKey] = {
      hero: draftSlot.hero,
      round: draftSlot.round,
      type: draftSlot.type,
      camp: draftSlot.camp,
      locked: draftSlot.locked,
      is_no_selection: draftSlot.is_no_selection,
    };

    return acc;
  }, {});

  // const DraftObject = Draft.reduce((acc, slot) => {
  //   acc[slot.slot] = {
  //     ...slot,
  //     round: undefined,
  //     type: undefined,
  //     camp: undefined,
  //     slot: undefined,
  //   };
  //   delete acc[slot.slot].round;
  //   delete acc[slot.slot].type;
  //   delete acc[slot.slot].camp;
  //   delete acc[slot.slot].slot;
  //   return acc;
  // }, {});

  return {
    Map: currentDraftMapMeta || {},
    Timer: getDraftTimer(),
    meta: getDraftMeta(Draft),
    ...DraftObject,
  };
}

// function buildDraft(data = [], options = {}, isLive = false) {
//   const Draft = buildEmptyDraftSkeleton();
//   const safeData = Array.isArray(data) ? data : [];

//   safeData.forEach((item) => {
//     const heroId = getHeroIdFromDraftItem(item, isLive);
//     const itemRound = getDraftItemRound(item);
//     const itemType = getDraftItemType(item);
//     const itemCamp = getDraftItemCamp(item);

//     const index = Draft.findIndex((slot) => {
//       return (
//         Number(slot.round) === itemRound &&
//         String(slot.type).toUpperCase() === itemType &&
//         Number(slot.camp) === itemCamp
//       );
//     });

//     if (index === -1) {
//       return;
//     }

//     Draft[index] = {
//       ...Draft[index],

//       round: itemRound,
//       type: itemType,
//       camp: itemCamp,

//       hero: {
//         id: heroId,
//         name: getHeroNameDraft(heroId, itemType),
//         role: getHeroRole(heroId),
//       },

//       locked: true,
//       is_no_selection: heroId === 0,
//     };
//   });

//   return {
//     Map: currentDraftMapMeta || {},
//     Timer: getDraftTimer(),
//     Draft,
//     meta: getDraftMeta(Draft),
//   };
// }

function normalizeRealtimeDraftPayload(realtime = {}) {
  const data = realtime?.data || realtime || {};

  return data.map((item) => ({
    round_index: Number(item.round_index),
    operate_type: Number(item.operate_type),
    camp: Number(item.camp),
    battle_side: Number(item.battle_side ?? 0),
    cur_pick_hero: Number(item.hero_id),
    is_no_selection: Number(item.hero_id ?? 0) === 0,
  }));
}

function normalizeLiveDraftPayload(payload = []) {
  const source = Array.isArray(payload)
    ? payload
    : payload?.Draft
      ? payload.Draft
      : [];

  return source
    .map((item) => {
      const operateType =
        Number(item.operate_type ?? item.operateType) === 1 ||
        String(item.type || "").toUpperCase() === "PICK"
          ? 1
          : 0;

      const heroId = Number(
        item.hero_id ??
          item.heroId ??
          item.cur_pick_hero ??
          item.suggest_hero ??
          item.hero?.id ??
          0,
      );

      return {
        round_index: Number(
          item.round_index ?? item.roundIndex ?? item.round ?? 0,
        ),
        operate_type: operateType,
        camp: Number(item.camp || 0),
        battle_side: Number(item.battle_side ?? item.battleSide ?? 0),
        hero_id: heroId,

        // hero_id: 0 is valid: NO BAN / NO PICK
        is_no_selection: heroId === 0,
      };
    })
    .sort((a, b) => {
      const orderA = getDraftSortIndex(a);
      const orderB = getDraftSortIndex(b);
      return orderA - orderB;
    });
}

function getDraftSortIndex(item = {}) {
  const round = Number(item.round_index ?? item.round ?? 0);
  const type = Number(item.operate_type ?? 0) === 1 ? "PICK" : "BAN";
  const camp = Number(item.camp || 0);

  const draftOrder = [
    { round: 0, type: "BAN", camp: 2 },
    { round: 0, type: "BAN", camp: 1 },

    { round: 1, type: "PICK", camp: 1 },
    { round: 2, type: "BAN", camp: 2 },
    { round: 3, type: "PICK", camp: 2 },
    { round: 4, type: "BAN", camp: 1 },

    { round: 5, type: "BAN", camp: 2 },
    { round: 5, type: "BAN", camp: 1 },

    { round: 6, type: "PICK", camp: 2 },
    { round: 7, type: "BAN", camp: 1 },
    { round: 8, type: "PICK", camp: 1 },
    { round: 9, type: "BAN", camp: 2 },
  ];

  const index = draftOrder.findIndex(
    (slot) => slot.round === round && slot.type === type && slot.camp === camp,
  );

  return index === -1 ? 999 : index;
}

// new signature function to detect changes in live draft phase, based on current ban/pick state of the round instead of just counting number of actions or relying on timestamps
function getLivePhaseSignature(realtime = {}) {
  const data = realtime?.data || realtime || {};

  const current = Array.isArray(data.cur_round_banpick_info)
    ? data.cur_round_banpick_info
    : [];

  if (!current.length) return "";

  return JSON.stringify(
    current
      .map((item) => ({
        round_index: Number(item.round_index),
        operate_type: Number(item.operate_type),
        camp: Number(item.camp),
      }))
      .sort((a, b) => a.camp - b.camp),
  );
}

async function getSavedPlayerNameMap() {
  const teams = await Team.find({}).lean();

  const map = {};

  teams.forEach((team) => {
    (team.players || []).forEach((player) => {
      map[String(player.player_uid || player.uid)] =
        player.broadcast_name || player.name || player.nick_name;
    });
  });

  return map;
}

function getScore(scoreInfo, camp) {
  if (!scoreInfo) return 0;
  if (typeof scoreInfo.get === "function") {
    return Number(scoreInfo.get(String(camp)) || 0);
  }

  return Number(scoreInfo[String(camp)] || scoreInfo[camp] || 0);
}

function getDraftSignature(data = []) {
  return JSON.stringify(
    data.map((item) => ({
      round_index: Number(
        item.round_index ?? item.roundIndex ?? item.round ?? 0,
      ),
      operate_type: Number(item.operate_type ?? item.operateType ?? 0),
      camp: Number(item.camp ?? 0),
      hero: Number(
        item.hero_id ??
          item.heroId ??
          item.cur_pick_hero ??
          item.suggest_hero ??
          item.hero?.id ??
          0,
      ),
    })),
  );
}

function buildPlayerPayload(player, playerNameMap = {}) {
  return {
    name:
      playerNameMap[player.player_uid] ||
      player.nick_name ||
      `Player ${String(player.player_uid)}`,
    uid: player.player_uid,

    hero: {
      id: player.cur_hero_id,
      name: getHeroName(player.cur_hero_id),
      role: getHeroRole(player.cur_hero_id),
    },

    kills: player.k || 0,
    deaths: player.d || 0,
    assists: player.a || 0,

    damage: player.total_damage || player.total_hero_damage || 0,
    damage_taken:
      player.total_damage_taken || player.total_hero_damage_taken || 0,
    healing: player.total_heal || player.total_hero_heal || 0,

    hit_rate: player.session_hit_rate || 0,
    solo_kill: player.solo_kill || player.dynamic_fields?.live_solo_kill || 0,
    last_kill: player.player_heroes?.[0]?.last_kill || 0,
    consecutiveKOs:
      player.max_continue_kill_count ||
      player.consecutive_kos ||
      player.dynamic_fields?.live_consecutive_kos ||
      0,
    continueKillKDA:
      player.continue_kill_kda ||
      player.dynamic_fields?.live_continue_kill_kda ||
      0,

    hp: player.hp || player.dynamic_fields?.live_hp || 0,
    ult_ratio: player.ult_ratio || player.dynamic_fields?.live_ult_ratio || 0,
  };
}

function buildXpressionPostMatch(match, playerNameMap = {}) {
  const scoreInfo = match.dynamic_fields?.score_info || {};

  const blueScore = getScore(scoreInfo, 1);
  const redScore = getScore(scoreInfo, 2);

  const mvpPlayer = match.match_players?.find(
    (p) => Number(p.player_uid) === Number(match.mvp_uid),
  );

  const mvpCamp = Number(mvpPlayer?.camp || 0);

  const bluePlayers = (match.match_players || [])
    .filter((p) => Number(p.camp) === 1)
    .map((p) => buildPlayerPayload(p, playerNameMap));

  const redPlayers = (match.match_players || [])
    .filter((p) => Number(p.camp) === 2)
    .map((p) => buildPlayerPayload(p, playerNameMap));

  return {
    Map: getMapMeta(match.match_map_id),

    Blue: {
      name: "Blue",
      short: "BLU",
      is_win: mvpCamp === 1 ? 1 : 0,
      score: blueScore,
      players: bluePlayers,
    },

    Red: {
      name: "Red",
      short: "RED",
      is_win: mvpCamp === 2 ? 1 : 0,
      score: redScore,
      players: redPlayers,
    },

    MVP: mvpPlayer ? buildPlayerPayload(mvpPlayer, playerNameMap) : null,
  };
}

function buildDraftLoopSteps(sortedDraftData = []) {
  const stepKeys = [
    { round: 0, type: "BAN" },
    { round: 1, type: "PICK" },
    { round: 2, type: "BAN" },
    { round: 3, type: "PICK" },
    { round: 4, type: "BAN" },
    { round: 5, type: "BAN" },
    { round: 6, type: "PICK" },
    { round: 7, type: "BAN" },
    { round: 8, type: "PICK" },
    { round: 9, type: "BAN" },
  ];

  return stepKeys.map((step) =>
    sortedDraftData.filter((item) => {
      const itemRound = Number(item.round_index ?? item.round);
      const itemType =
        Number(item.operate_type) === 1 || item.type === "PICK"
          ? "PICK"
          : "BAN";

      return itemRound === step.round && itemType === step.type;
    }),
  );
}

function isCurrentDraftComplete() {
  return Boolean(currentDraftPayload?.meta?.is_complete);
}

/* -----------------------------
   STATS ROUTES
----------------------------- */

router.post("/stats", async (req, res) => {
  try {
    const { mode, payload, match_uid } = req.body || {};

    if (mode === "live" || payload) {
      currentStatsPayload = payload;

      xpressionLogger.info("📡 Live stats payload updated for Xpression");

      return res.json({
        success: true,
        mode: "live",
      });
    }

    if (match_uid) {
      const match = await Match.findOne({ match_uid }).lean();

      if (!match) {
        return res.status(404).json({
          error: "Match not found",
          match_uid,
        });
      }

      currentDraftMapMeta = getMapMeta(match.match_map_id);

      const playerNameMap = await getSavedPlayerNameMap();

      currentStatsPayload = buildXpressionPostMatch(match, playerNameMap);

      xpressionLogger.info(`📦 Saved match stats loaded: ${match_uid}`);

      return res.json({
        success: true,
        mode: "saved_match",
        match_uid,
      });
    }

    return res.status(400).json({
      error: "Invalid stats request",
      expected: {
        live: {
          mode: "live",
          payload: "{...}",
        },
        saved_match: {
          match_uid: "match_uid_here",
        },
      },
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Failed to build stats",
      detail: err.message,
    });
  }
});

router.get("/stats", (req, res) => {
  res.json(currentStatsPayload || {});
});

/* -----------------------------
   DRAFT ROUTES
----------------------------- */

router.post("/draft", async (req, res) => {
  try {
    const { mode, payload, match_uid, realtime, map, resetDraft, resetTimer } =
      req.body || {};

    if (map) {
      currentDraftMapMeta = map;
    }
    /***old live draft handling before signature-based phase change detection***/
    if (mode === "live" || payload || realtime) {
      const liveDraftData = payload
        ? normalizeLiveDraftPayload(payload)
        : normalizeRealtimeDraftPayload(realtime || req.body);

      const newSignature = getDraftSignature(liveDraftData);

      // NEW FORMAT LOGIC: if resetDraft is true, we reset the draft to blank skeleton and only update the payload if we don't have any live draft data yet (e.g. first request after reset), otherwise we keep the blank skeleton until we detect a new phase start with a different signature, to avoid overwriting new draft data with blank skeleton in case of multiple reset requests or if the client wants to reset timer without resetting draft
      if (resetDraft) {
        lastDraftData = [];
        currentDraftPayload = buildDraft([], {}, true);
        phaseStartedAt = null;
        lastDraftSignature = "";

        xpressionLogger.info(
          ":arrows_counterclockwise: Live draft reset to blank skeleton",
        );

        if (!liveDraftData.length) {
          return res.json({
            success: true,
            mode: "live",
            reset: true,
            data: currentDraftPayload,
          });
        }
      }
      // if (resetDraft) {
      //   lastDraftData = [];
      //   currentDraftPayload = buildDraft([], {}, true);
      //   phaseStartedAt = null;
      //   lastDraftSignature = "";

      //   xpressionLogger.info(
      //     ":arrows_counterclockwise: Live draft reset to blank skeleton",
      //   );
      // }

      if (liveDraftData.length > 0 && newSignature !== lastDraftSignature) {
        phaseStartedAt = Date.now();
        lastDraftSignature = newSignature;
      }

      lastDraftData = liveDraftData;
      currentDraftPayload = buildDraft(lastDraftData, {}, true);

      xpressionLogger.info("Live draft payload updated for Xpression");

      return res.json({
        success: true,
        mode: "live",
        data: currentDraftPayload,
      });
    }

    /*
      SAVED MATCH MODE
      Used by MatchDetailPage / saved MongoDB match.
    */
    if (match_uid) {
      const match = await Match.findOne({ match_uid }).lean();

      if (!match) {
        return res.status(404).json({
          error: "Match not found",
          match_uid,
        });
      }

      currentDraftMapMeta = getMapMeta(match.match_map_id);

      lastDraftData =
        match.live_snapshot?.data?.ban_pick_info ||
        match.dynamic_fields?.ban_pick_info ||
        [];

      phaseStartedAt = Date.now();
      lastDraftSignature = getDraftSignature(lastDraftData);

      currentDraftPayload = buildDraft(lastDraftData, {}, false);

      xpressionLogger.info(`:package: Saved match draft loaded: ${match_uid}`);

      return res.json({
        success: true,
        mode: "saved_match",
        match_uid,
        data: currentDraftPayload,
      });
    }

    return res.status(400).json({
      error: "Invalid draft request",
      expected: {
        live: {
          mode: "live",
          payload: [
            {
              round_index: 0,
              operate_type: 0,
              camp: 1,
              hero_id: 0,
            },
          ],
          map: {
            id: 1272,
            name: "BIRNIN T'CHALLA",
            mode: "DOMINATION",
          },
          resetDraft: false,
          resetTimer: false,
        },
        saved_match: {
          match_uid: "match_uid_here",
        },
      },
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Failed to build draft",
      detail: err.message,
    });
  }
});

router.get("/draft", (req, res) => {
  const payload =
    currentDraftPayload || buildDraft(lastDraftData || [], {}, false);

  return res.json({
    ...payload,
    Timer: getDraftTimer(),
    source: currentDraftPayload ? "active" : "blank",
    message: lastDraftData?.length
      ? undefined
      : `⚠️ No draft data received yet (as of ${getCurrentTime()})`,
  });
});

router.get("/draft/reset", (req, res) => {
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
  }

  lastDraftData = [];
  draftSourceData = [];
  loopIndex = 0;
  phaseStartedAt = null;

  currentDraftPayload = {
    Map: currentDraftMapMeta || {},
    Timer: getDraftTimer(),
    Draft: buildEmptyDraftSkeleton(),
    meta: getDraftMeta(buildEmptyDraftSkeleton()),
  };

  xpressionLogger.info("🔄 Draft reset to blank skeleton");

  res.json({
    success: true,
    message: "✅ Draft reset to blank skeleton",
    data: currentDraftPayload,
  });
});

/***new****/
router.post("/draft/loop/start", async (req, res) => {
  try {
    const { match_uid, interval = 20000 } = req.body || {};

    if (!match_uid) {
      return res.status(400).json({
        error: "match_uid is required",
      });
    }

    const match = await Match.findOne({ match_uid }).lean();

    if (!match) {
      return res.status(404).json({
        error: "Match not found",
        match_uid,
      });
    }

    currentDraftMapMeta = getMapMeta(match.match_map_id);

    const rawDraftData =
      match.dynamic_fields?.ban_pick_info ||
      match.live_snapshot?.data?.ban_pick_info ||
      [];

    if (!Array.isArray(rawDraftData) || !rawDraftData.length) {
      return res.status(400).json({
        error: "No ban/pick data found for this match",
        checked: [
          "match.dynamic_fields.ban_pick_info",
          "match.live_snapshot.data.ban_pick_info",
        ],
      });
    }

    function replaySideToCamp(side) {
      // replay-query-match: 0 = Blue/camp 1, 1 = Red/camp 2
      return Number(side) === 1 ? 2 : 1;
    }

    function getDraftItemInfo(item = {}) {
      const round = Number(
        item.round_index ??
          item.roundIndex ??
          item.round_idx ??
          item.round ??
          0,
      );

      const type =
        Number(item.operate_type ?? item.operateType ?? item.is_pick ?? 0) ===
          1 || String(item.type || "").toUpperCase() === "PICK"
          ? "PICK"
          : "BAN";

      const camp =
        item.camp !== undefined
          ? Number(item.camp)
          : item.battle_side !== undefined
            ? replaySideToCamp(item.battle_side)
            : item.battleSide !== undefined
              ? replaySideToCamp(item.battleSide)
              : item.effect_battle_side !== undefined
                ? replaySideToCamp(item.effect_battle_side)
                : 0;

      const heroId = Number(
        item.hero_id ??
          item.heroId ??
          item.cur_pick_hero ??
          item.suggest_hero ??
          item.hero?.id ??
          0,
      );

      return {
        round,
        type,
        camp,
        heroId,
      };
    }

    function normalizeDraftItem(item = {}) {
      const info = getDraftItemInfo(item);

      return {
        ...item,
        round_index: info.round,
        operate_type: info.type === "PICK" ? 1 : 0,
        camp: info.camp,
        battle_side: Number(item.battle_side ?? item.battleSide ?? 0),
        hero_id: info.heroId,
        is_no_selection: info.heroId === 0,
      };
    }

    function inferFirstPickerPhase1FromDraft(data = []) {
      const round1Pick = data.find((item) => {
        const info = getDraftItemInfo(item);
        return info.round === 1 && info.type === "PICK";
      });

      const camp = getDraftItemInfo(round1Pick || {}).camp;

      if (camp === 1 || camp === 2) return camp;

      return 1;
    }

    function buildDraftOrder(firstPickerPhase1 = 1) {
      const first = firstPickerPhase1 === 2 ? 2 : 1;
      const second = first === 1 ? 2 : 1;

      return [
        { round: 0, type: "BAN", camp: 2 },
        { round: 0, type: "BAN", camp: 1 },

        { round: 1, type: "PICK", camp: first },
        { round: 2, type: "BAN", camp: second },
        { round: 3, type: "PICK", camp: second },
        { round: 4, type: "BAN", camp: first },

        { round: 5, type: "BAN", camp: 2 },
        { round: 5, type: "BAN", camp: 1 },

        { round: 6, type: "PICK", camp: second },
        { round: 7, type: "BAN", camp: first },
        { round: 8, type: "PICK", camp: first },
        { round: 9, type: "BAN", camp: second },
      ];
    }

    const phaseOrder = [
      { round: 0, type: "BAN" },
      { round: 1, type: "PICK" },
      { round: 2, type: "BAN" },
      { round: 3, type: "PICK" },
      { round: 4, type: "BAN" },
      { round: 5, type: "BAN" },
      { round: 6, type: "PICK" },
      { round: 7, type: "BAN" },
      { round: 8, type: "PICK" },
      { round: 9, type: "BAN" },
    ];

    const normalizedDraftData = rawDraftData.map(normalizeDraftItem);

    const firstPickerPhase1 =
      inferFirstPickerPhase1FromDraft(normalizedDraftData);
    const draftOrder = buildDraftOrder(firstPickerPhase1);

    function getDraftOrderIndex(item = {}) {
      const info = getDraftItemInfo(item);

      const index = draftOrder.findIndex((slot) => {
        return (
          slot.round === info.round &&
          slot.type === info.type &&
          slot.camp === info.camp
        );
      });

      return index === -1 ? 999 : index;
    }

    /*
      Build a full 12-slot source.
      This is important because missing no-ban/no-pick phases should still appear
      as hero_id: 0 instead of making the loop jump.
    */
    draftSourceData = draftOrder.map((expected) => {
      const found = normalizedDraftData.find((item) => {
        const info = getDraftItemInfo(item);

        return (
          info.round === expected.round &&
          info.type === expected.type &&
          info.camp === expected.camp
        );
      });

      if (found) {
        return normalizeDraftItem(found);
      }

      return {
        round_index: expected.round,
        operate_type: expected.type === "PICK" ? 1 : 0,
        camp: expected.camp,
        hero_id: 0,
        is_no_selection: true,
      };
    });

    draftSourceData.sort(
      (a, b) => getDraftOrderIndex(a) - getDraftOrderIndex(b),
    );

    /*
      Keep all phase steps.
      Do NOT filter empty steps here, because round 0 and round 5 are grouped phases.
    */
    draftLoopSteps = phaseOrder.map((phase) => {
      return draftSourceData.filter((item) => {
        const info = getDraftItemInfo(item);

        return info.round === phase.round && info.type === phase.type;
      });
    });

    if (!draftSourceData.length) {
      return res.status(400).json({
        error: "No draft source data could be built",
      });
    }

    if (
      !draftLoopSteps.length ||
      draftLoopSteps.every((step) => !step.length)
    ) {
      return res.status(400).json({
        error: "No draft loop steps could be built",
        debug: {
          rawDraftLength: rawDraftData.length,
          normalizedDraftLength: normalizedDraftData.length,
          firstPickerPhase1,
          sample: normalizedDraftData.slice(0, 3),
        },
      });
    }

    if (loopTimer) {
      clearInterval(loopTimer);
      loopTimer = null;
    }

    loopIndex = 0;
    lastDraftData = [];
    phaseStartedAt = null;
    lastDraftSignature = "";

    currentDraftPayload = buildDraft(
      lastDraftData,
      { firstPickerPhase1 },
      false,
    );

    loopTimer = setInterval(() => {
      loopIndex += 1;

      if (loopIndex > draftLoopSteps.length) {
        loopIndex = 0;
      }

      lastDraftData = draftLoopSteps.slice(0, loopIndex).flat();

      phaseStartedAt = Date.now();
      lastDraftSignature = getDraftSignature(lastDraftData);

      currentDraftPayload = buildDraft(
        lastDraftData,
        { firstPickerPhase1 },
        false,
      );
    }, Number(interval));

    console.log(
      `🚀 Draft loop started for match ${match_uid} with interval ${interval}ms`,
    );

    res.json({
      success: true,
      message: "Draft loop started",
      match_uid,
      interval: Number(interval),
      firstPickerPhase1,
      totalSteps: draftLoopSteps.length,
      totalDraftItems: draftSourceData.length,
      skeletonSlots: 12,
      data: currentDraftPayload,
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to start draft loop",
      detail: err.message,
    });
  }
});

/***old****/
// router.post("/draft/loop/start", async (req, res) => {
//   try {
//     const { match_uid, interval = 20000 } = req.body || {};

//     if (!match_uid) {
//       return res.status(400).json({
//         error: "match_uid is required",
//       });
//     }

//     const match = await Match.findOne({ match_uid }).lean();

//     if (!match) {
//       return res.status(404).json({
//         error: "Match not found",
//         match_uid,
//       });
//     }

//     /*** Helpers ***/
//     function normalizeReplayBattleSideToCamp(battleSide) {
//       // replay-query-match: battle_side 0 = Blue/camp 1, battle_side 1 = Red/camp 2
//       return Number(battleSide) === 1 ? 2 : 1;
//     }

//     function getDraftItemInfo(item = {}) {
//       const round = Number(
//         item.round_index ??
//           item.roundIndex ??
//           item.round_idx ??
//           item.round ??
//           0,
//       );

//       const type =
//         Number(item.operate_type ?? item.operateType ?? item.is_pick ?? 0) ===
//           1 || String(item.type || "").toUpperCase() === "PICK"
//           ? "PICK"
//           : "BAN";

//       const camp =
//         item.camp !== undefined
//           ? Number(item.camp)
//           : item.battle_side !== undefined
//             ? normalizeReplayBattleSideToCamp(item.battle_side)
//             : item.battleSide !== undefined
//               ? normalizeReplayBattleSideToCamp(item.battleSide)
//               : item.effect_battle_side !== undefined
//                 ? normalizeReplayBattleSideToCamp(item.effect_battle_side)
//                 : 0;

//       const heroId = Number(
//         item.hero_id ??
//           item.heroId ??
//           item.cur_pick_hero ??
//           item.suggest_hero ??
//           item.hero?.id ??
//           0,
//       );

//       return {
//         round,
//         type,
//         camp,
//         heroId,
//       };
//     }

//     function normalizeDraftItem(item = {}) {
//       const info = getDraftItemInfo(item);

//       return {
//         ...item,
//         round_index: info.round,
//         operate_type: info.type === "PICK" ? 1 : 0,
//         camp: info.camp,
//         battle_side: Number(item.battle_side ?? item.battleSide ?? 0),
//         hero_id: info.heroId,
//         is_no_selection: info.heroId === 0,
//       };
//     }

//     currentDraftMapMeta = getMapMeta(match.match_map_id);

//     const rawDraftData =
//       match.dynamic_fields?.ban_pick_info ||
//       match.live_snapshot?.data?.ban_pick_info ||
//       [];
//     // const rawDraftData = (match.live_snapshot?.data?.ban_pick_info || []).map(
//     //   normalizeDraftCampByRound,
//     // );

//     const draftOrder = [
//       { round: 0, type: "BAN", camp: 2 },
//       { round: 0, type: "BAN", camp: 1 },
//       { round: 1, type: "PICK", camp: 2 },
//       { round: 2, type: "BAN", camp: 1 },
//       { round: 3, type: "PICK", camp: 1 },
//       { round: 4, type: "BAN", camp: 2 },
//       { round: 5, type: "BAN", camp: 2 },
//       { round: 5, type: "BAN", camp: 1 },
//       { round: 6, type: "PICK", camp: 1 },
//       { round: 7, type: "BAN", camp: 2 },
//       { round: 8, type: "PICK", camp: 2 },
//       { round: 9, type: "BAN", camp: 1 },
//     ];

//     const phaseOrder = [
//       { round: 0, type: "BAN" },
//       { round: 1, type: "PICK" },
//       { round: 2, type: "BAN" },
//       { round: 3, type: "PICK" },
//       { round: 4, type: "BAN" },
//       { round: 5, type: "BAN" },
//       { round: 6, type: "PICK" },
//       { round: 7, type: "BAN" },
//       { round: 8, type: "PICK" },
//       { round: 9, type: "BAN" },
//     ];

//     function getDraftItemInfo(item) {
//       return {
//         round: Number(item.round_index ?? item.round),
//         type:
//           Number(item.operate_type) === 1 || item.type === "PICK"
//             ? "PICK"
//             : "BAN",
//         camp: Number(item.camp),
//         heroId: Number(
//           item.hero_id || item.cur_pick_hero || item.suggest_hero || 0,
//         ),
//       };
//     }

//     function getDraftOrderIndex(item) {
//       const info = getDraftItemInfo(item);

//       const index = draftOrder.findIndex(
//         (slot) =>
//           slot.round === info.round &&
//           slot.type === info.type &&
//           slot.camp === info.camp,
//       );

//       return index === -1 ? 999 : index;
//     }

//     draftSourceData = rawDraftData
//       .map(normalizeDraftItem)
//       .sort((a, b) => getDraftOrderIndex(a) - getDraftOrderIndex(b));

//     if (!draftSourceData.length) {
//       return res.status(400).json({
//         error: "No ban/pick data found for this match",
//       });
//     }

//     const draftLoopSteps = phaseOrder
//       .map((phase) =>
//         draftSourceData.filter((item) => {
//           const info = getDraftItemInfo(item);

//           return info.round === phase.round && info.type === phase.type;
//         }),
//       )
//       .filter((step) => step.length > 0);

//     if (!draftLoopSteps.length) {
//       return res.status(400).json({
//         error: "No draft loop steps could be built",
//       });
//     }

//     if (loopTimer) clearInterval(loopTimer);

//     loopIndex = 0;
//     lastDraftData = [];
//     phaseStartedAt = Date.now();
//     currentDraftPayload = buildDraft(lastDraftData, {}, false);

//     loopTimer = setInterval(() => {
//       loopIndex += 1;

//       if (loopIndex > draftLoopSteps.length) {
//         loopIndex = 0;
//       }

//       lastDraftData = draftLoopSteps.slice(0, loopIndex).flat();

//       // console.log("Draft loop tick:", {
//       //   loopIndex,
//       //   shownItems: lastDraftData.length,
//       //   rounds: lastDraftData.map((i) => ({
//       //     round: i.round_index,
//       //     type: Number(i.operate_type) === 1 ? "PICK" : "BAN",
//       //     camp: i.camp,
//       //     hero: i.hero_id,
//       //   })),
//       // });

//       phaseStartedAt = Date.now();
//       currentDraftPayload = buildDraft(lastDraftData, {}, false);
//     }, Number(interval));

//     console.log(
//       `🚀 Draft loop started for match ${match_uid} with interval ${interval}ms`,
//     );

//     res.json({
//       success: true,
//       message: "Draft loop started",
//       match_uid,
//       interval: Number(interval),
//       totalSteps: draftLoopSteps.length,
//       totalDraftItems: draftSourceData.length,
//       skeletonSlots: 12,
//       data: currentDraftPayload,
//     });
//   } catch (err) {
//     res.status(500).json({
//       error: "Failed to start draft loop",
//       detail: err.message,
//     });
//   }
// });

router.post("/draft/loop/stop", (req, res) => {
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
  }

  res.json({
    success: true,
    message: "Draft loop stopped",
    data: currentDraftPayload || buildDraft(lastDraftData),
  });
});

module.exports = router;
