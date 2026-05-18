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

let lastDraftData = [];
let draftSourceData = [];
let loopTimer = null;
let loopIndex = 0;
let phaseStartedAt = null;

const PHASE_SECONDS = 20;

const heroMap = Object.fromEntries(
  (Array.isArray(heroesRaw) ? heroesRaw : []).map((hero) => [
    String(hero.id),
    hero,
  ]),
);

const mapMap = Object.fromEntries(
  (Array.isArray(mapsRaw) ? mapsRaw : []).map((map) => [
    String(map.id),
    map,
  ]),
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

function getHeroName(heroId) {
  const id = Number(heroId);

  if (!id) return "Hero 0";

  const baseId = getHeroBaseId(id);
  const hero = heroMap[String(baseId)];

  return hero ? normalizeHeroName(hero.name) : `Hero ${id}`;
}

function getHeroRole(heroId) {
  const id = Number(heroId);

  if (!id) return "Unknown";

  const baseId = getHeroBaseId(id);
  const hero = heroMap[String(baseId)];

  if (!hero) return "Unknown";

  if (id === 10571 && Array.isArray(hero.role)) return hero.role[0] || "Duelist";
  if (id === 10572 && Array.isArray(hero.role)) return hero.role[1] || "Vanguard";
  if (id === 10573 && Array.isArray(hero.role)) return hero.role[2] || "Strategist";

  if (Array.isArray(hero.role)) return hero.role[0] || "Unknown";

  return hero.role || "Unknown";
}

function getMapMeta(mapId) {
  const map = mapMap[String(mapId)] || {};

  return {
    id: Number(mapId || 0),
    name: map.sub_name || map.full_name || map.name || `Map ${mapId || 0}`,
    mode: map.game_mode || "",
  };
}

function getDraftTimer() {
  if (!phaseStartedAt) {
    return {
      phase_seconds: PHASE_SECONDS,
      remaining: PHASE_SECONDS,
    };
  }

  const elapsed = Math.floor((Date.now() - phaseStartedAt) / 1000);

  return {
    phase_seconds: PHASE_SECONDS,
    remaining: Math.max(PHASE_SECONDS - elapsed, 0),
  };
}

function buildDraftPlan() {
  const first = 2;
  const second = 1;

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

function buildEmptyDraftSkeleton() {
  const plan = buildDraftPlan();

  const slotCounter = {
    1: 0,
    2: 0,
  };

  return plan.rounds.flatMap((round) => {
    const camps = round.camp === "BOTH" ? [1, 2] : [Number(round.camp)];

    return camps.map((camp) => {
      slotCounter[camp] += 1;

      return {
        round: Number(round.round_index),
        type: round.phase,
        camp,
        slot: camp === 1 ? `Blue ${slotCounter[camp]}` : `Red ${slotCounter[camp]}`,
        hero: {
          id: 0,
          name: "Hero 0",
          role: "Unknown",
        },
        locked: false,
      };
    });
  });
}

function getDraftMeta(Draft = []) {
  const next = Draft.find((slot) => !slot.locked);

  if (!next) {
    return {
      current_round: 10,
      phase: "END",
      active_camp: null,
      is_complete: true,
      completed_steps: Draft.length,
      total_steps: Draft.length,
    };
  }

  return {
    current_round: next.round,
    phase: next.type,
    active_camp: next.camp,
    is_complete: false,
    completed_steps: Draft.filter((slot) => slot.locked).length,
    total_steps: Draft.length,
  };
}

function getHeroIdFromDraftItem(item = {}, isLive = false) {
  if (isLive) {
    return Number(item.cur_pick_hero || item.suggest_hero || item.hero_id || 0);
  }

  return Number(item.hero_id || item.cur_pick_hero || item.suggest_hero || 0);
}

function buildDraft(data = [], options = {}, isLive = false) {
  const Draft = buildEmptyDraftSkeleton();

  const safeData = Array.isArray(data) ? data : [];

  safeData.forEach((item, index) => {
    if (!Draft[index]) return;

    const heroId = getHeroIdFromDraftItem(item, isLive);

    Draft[index] = {
      ...Draft[index],
      round: Number(item.round_index ?? item.round ?? Draft[index].round),
      type:
        Number(item.operate_type) === 1 || item.type === "PICK"
          ? "PICK"
          : "BAN",
      camp: Number(item.camp || Draft[index].camp),
      hero: {
        id: heroId,
        name: getHeroName(heroId),
        role: getHeroRole(heroId),
      },
      locked: heroId > 0,
    };
  });

  return {
    Map: currentDraftMapMeta || {},
    Timer: getDraftTimer(),
    Draft,
    meta: getDraftMeta(Draft),
  };
}

function normalizeRealtimeDraftPayload(realtime = {}) {
  const data = realtime?.data || realtime || {};

  const histories = Array.isArray(data.suggest_histories)
    ? data.suggest_histories
    : [];

  return histories
    .filter((item) => Number(item.suggest_hero) > 0)
    .map((item) => ({
      round_index: Number(item.round_index),
      operate_type: Number(item.operate_type),
      camp: Number(item.camp),
      battle_side: Number(item.battle_side ?? 0),
      cur_pick_hero: Number(item.suggest_hero),
    }));
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
    const { mode, payload, match_uid, realtime, map } = req.body || {};

    if (map) {
      currentDraftMapMeta = map;
    }

    if (mode === "live" || payload || realtime) {
      const liveDraftData = payload?.Draft
        ? payload.Draft
        : Array.isArray(payload)
          ? payload
          : normalizeRealtimeDraftPayload(realtime || req.body);

      lastDraftData = liveDraftData;
      phaseStartedAt = Date.now();

      currentDraftPayload = buildDraft(lastDraftData, {}, true);

      xpressionLogger.info("📡 Live draft payload updated for Xpression");

      return res.json({
        success: true,
        mode: "live",
        data: currentDraftPayload,
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

      lastDraftData = match.dynamic_fields?.ban_pick_info || [];
      phaseStartedAt = Date.now();

      currentDraftPayload = buildDraft(lastDraftData, {}, false);

      xpressionLogger.info(`📦 Saved match draft loaded: ${match_uid}`);

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
          realtime: "{ realtime_ban_pick_response }",
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
  if (currentDraftPayload) {
    return res.json(currentDraftPayload);
  }

  return res.json({
    Map: currentDraftMapMeta || {},
    Timer: getDraftTimer(),
    Draft: buildEmptyDraftSkeleton(),
    meta: getDraftMeta(buildEmptyDraftSkeleton()),
    message: `⚠️ No draft data received yet (as of ${getCurrentTime()})`,
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
    draftSourceData = match.dynamic_fields?.ban_pick_info || [];

    if (!draftSourceData.length) {
      return res.status(400).json({
        error: "No ban/pick data found for this match",
      });
    }

    if (loopTimer) clearInterval(loopTimer);

    loopIndex = 0;
    lastDraftData = [];
    phaseStartedAt = Date.now();

    currentDraftPayload = buildDraft(lastDraftData, {}, false);

    loopTimer = setInterval(() => {
      loopIndex += 1;

      if (loopIndex > draftSourceData.length) {
        loopIndex = 0;
      }

      lastDraftData = draftSourceData.slice(0, loopIndex);
      phaseStartedAt = Date.now();
      currentDraftPayload = buildDraft(lastDraftData, {}, false);
    }, Number(interval));

    res.json({
      success: true,
      message: "Draft loop started",
      match_uid,
      interval: Number(interval),
      totalSteps: draftSourceData.length,
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