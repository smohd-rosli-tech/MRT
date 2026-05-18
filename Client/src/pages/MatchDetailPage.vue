<template>
  <q-page class="match-detail-page dark">
    <div class="action-bar">
      <div>
        <div class="page-eyebrow">Match Detail</div>
        <div class="page-id">{{ matchUid }}</div>
      </div>

      <div class="action-buttons">
        <q-btn dense flat icon="arrow_back" label="Back" @click="router.back()" />
        <q-btn label="Refresh" icon="refresh" color="blue-grey-8" text-color="white" :loading="loading"
          @click="loadMatch" class="q-mb-sm q-ml-sm" />
      </div>
    </div>

    <div class="top-header">
      <div class="score-box team1-box">{{ dashboard.meta.scoreLeft }}</div>

      <div class="main-board header-center">
        <h1>{{ dashboard.meta.mapName }}</h1>

        <div class="match-info-bar">
          <div><strong>Mode:</strong> {{ dashboard.meta.mapMode }}</div>
          <div><strong>Duration:</strong> {{ formatSeconds(dashboard.meta.fightTime) }}</div>
          <div><strong>Updated:</strong> {{ updatedTime }}</div>
        </div>

        <div class="matchup-row">
          <div class="matchup-team team1-name">{{ dashboard.teams.team1.name }}</div>
          <div class="matchup-score">{{ dashboard.meta.scoreLeft }} - {{ dashboard.meta.scoreRight }}</div>
          <div class="matchup-team team2-name">{{ dashboard.teams.team2.name }}</div>
        </div>
      </div>

      <div class="score-box team2-box">{{ dashboard.meta.scoreRight }}</div>
    </div>

    <div class="summary-row">
      <div class="summary-box">
        <div class="summary-title">{{ dashboard.teams.team1.name }} Summary</div>
        <div class="summary-values">
          <div>Total Kills ⚔️ : {{ dashboard.teams.team1.summary.kills || 0 }}</div>
          <div>Total Damage 💥 : {{ formatCompact(dashboard.teams.team1.summary.damage) }}</div>
          <div>Total Heal 💚 : {{ formatCompact(dashboard.teams.team1.summary.heal) }}</div>
          <div>Avg Hit % 🎯 : {{ formatPct(dashboard.teams.team1.summary.avgHitRate) }}</div>
        </div>
      </div>

      <div class="summary-box">
        <div class="summary-title">{{ dashboard.teams.team2.name }} Summary</div>
        <div class="summary-values">
          <div>Total Kills ⚔️ : {{ dashboard.teams.team2.summary.kills || 0 }}</div>
          <div>Total Damage 💥 : {{ formatCompact(dashboard.teams.team2.summary.damage) }}</div>
          <div>Total Heal 💚 : {{ formatCompact(dashboard.teams.team2.summary.heal) }}</div>
          <div>Avg Hit % 🎯 : {{ formatPct(dashboard.teams.team2.summary.avgHitRate) }}</div>
        </div>
      </div>
    </div>

    <section class="main-board">
      <div class="tabs-row">
        <button class="tab-btn" :class="{ active: activeTab === 'stats' }" @click="activeTab = 'stats'">
          Match Stats
        </button>
        <button class="tab-btn" :class="{ active: activeTab === 'banpick' }" @click="activeTab = 'banpick'">
          Ban / Pick
        </button>
      </div>

      <div v-if="activeTab === 'stats'">
        <q-btn color="light-blue-10" icon="send" label="Send to Xpression" @click="sendToXpression" class="q-mb-sm q-ml-sm" v-if="isViewMode !== '9008'"/>

        <div class="table-title-row">
          <div class="table-title">{{ dashboard.teams.team1.name }}</div>
          <div class="table-title">{{ dashboard.teams.team2.name }}</div>
        </div>

        <div class="team-table-grid">
          <div class="table-wrap scroll-x">
            <table class="team-table team1-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Hero</th>
                  <th>K</th>
                  <th>D</th>
                  <th>A</th>
                  <th>DMG</th>
                  <th>Heal</th>
                  <th>Hit</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="player in dashboard.teams.team1.players" :key="player.playerId"
                  :class="rowClass(player, 'team1')" @click="selectPlayer(player)">
                  <td>
                    <div class="name-stack">
                      <span>{{ player.playerName }}</span>
                      <span v-if="player.isMVP" class="badge mvp">MVP</span>
                      <span v-else-if="player.isSVP" class="badge svp">SVP</span>
                    </div>
                  </td>

                  <td>
                    <div class="hero-cell">
                      <img :src="player.heroMeta?.image" :alt="player.heroMeta?.displayName"
                        @error="e => (e.target.src = '/imgs/heroes/0_unknown.png')" class="hero-thumb" />
                      <div class="hero-text">
                        <span class="hero-name">{{ player.heroMeta?.displayName }}</span>
                        <span class="hero-role">{{ player.heroMeta?.role }}</span>
                      </div>
                    </div>
                  </td>

                  <td>{{ player.kills }}</td>
                  <td>{{ player.deaths }}</td>
                  <td>{{ player.assists }}</td>
                  <td>{{ formatCompact(player.damage) }}</td>
                  <td>{{ formatCompact(player.heal) }}</td>
                  <td>{{ formatPct(player.hitRate) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="table-wrap scroll-x">
            <table class="team-table team2-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Hero</th>
                  <th>K</th>
                  <th>D</th>
                  <th>A</th>
                  <th>DMG</th>
                  <th>Heal</th>
                  <th>Hit</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="player in dashboard.teams.team2.players" :key="player.playerId"
                  :class="rowClass(player, 'team2')" @click="selectPlayer(player)">
                  <td>
                    <div class="name-stack">
                      <span>{{ player.playerName }}</span>
                      <span v-if="player.isMVP" class="badge mvp">MVP</span>
                      <span v-else-if="player.isSVP" class="badge svp">SVP</span>
                    </div>
                  </td>

                  <td>
                    <div class="hero-cell">
                      <img :src="player.heroMeta?.image" :alt="player.heroMeta?.displayName"
                        @error="e => (e.target.src = '/imgs/heroes/0_unknown.png')" class="hero-thumb" />
                      <div class="hero-text">
                        <span class="hero-name">{{ player.heroMeta?.displayName }}</span>
                        <span class="hero-role">{{ player.heroMeta?.role }}</span>
                      </div>
                    </div>
                  </td>

                  <td>{{ player.kills }}</td>
                  <td>{{ player.deaths }}</td>
                  <td>{{ player.assists }}</td>
                  <td>{{ formatCompact(player.damage) }}</td>
                  <td>{{ formatCompact(player.heal) }}</td>
                  <td>{{ formatPct(player.hitRate) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="selected-player-panel">
          <div class="selected-player-header">
            <h2>Selected Player</h2>
            <span v-if="selectedPlayer">{{ selectedPlayer.playerName }}</span>
          </div>

          <div v-if="selectedPlayer" class="player-detail">
            <div class="grid">
              <div><strong>Name</strong><span>{{ selectedPlayer.playerName }}</span></div>
              <div><strong>Hero</strong><span>{{ selectedPlayer.heroMeta?.displayName }}</span></div>
              <div><strong>Hero ID</strong><span>{{ selectedPlayer.heroId }}</span></div>
              <div><strong>KDA</strong><span>{{ selectedPlayer.kills }}/{{ selectedPlayer.deaths }}/{{
                selectedPlayer.assists }}</span></div>
              <div><strong>DMG</strong><span>{{ formatCompact(selectedPlayer.damage) }}</span></div>
              <div><strong>HEAL</strong><span>{{ formatCompact(selectedPlayer.heal) }}</span></div>
              <div><strong>Hit %</strong><span>{{ formatPct(selectedPlayer.hitRate) }}</span></div>
            </div>

            <div class="selected-hero-header">
              <div class="hero-cell hero-cell-large">
                <img :src="selectedPlayer.heroMeta?.image" :alt="selectedPlayer.heroMeta?.displayName"
                  @error="e => (e.target.src = '/imgs/heroes/0_unknown.png')" class="hero-thumb hero-thumb-large" />
                <div class="hero-text">
                  <span class="hero-name">{{ selectedPlayer.heroMeta?.displayName }}</span>
                  <span class="hero-role">{{ selectedPlayer.heroMeta?.role }}</span>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="empty-state">Select a player from either team table</div>
        </div>
      </div>

      <div v-if="activeTab === 'banpick'" class="banpick-wrap">
        <q-btn color="green" icon="loop" label="Start Loop" @click="startLoop" class="q-mb-sm q-ml-sm" v-if="isViewMode !== '9008'"/>
        <q-btn color="red" icon="close" label="Stop Loop" @click="stopLoop" class="q-mb-sm q-ml-sm" v-if="isViewMode !== '9008'" />
        <q-btn color="blue-light-8" icon="close" label="Reset Loop" @click="resetLoop" class="q-mb-sm q-ml-sm" v-if="isViewMode === '9004'" />

        <table class="banpick-table">
          <thead>
            <tr>
              <th>Round</th>
              <th>Action</th>
              <th>Camp</th>
              <th>Hero</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in displayedBanPick" :key="`${item.round_index}-${item.camp}-${index}`">
              <td>{{ item.round_index }}</td>
              <td>{{ item.operate_type === 1 ? 'Pick' : 'Ban' }}</td>
              <td>{{ item.camp }}</td>
              <td>
                <div class="hero-cell">
                  <img :src="getHeroMeta(item.hero_id).image" :alt="getHeroMeta(item.hero_id).displayName"
                    @error="e => (e.target.src = '/imgs/heroes/0_unknown.png')" class="hero-thumb" />
                  <div class="hero-text">
                    <span class="hero-name">{{ getHeroMeta(item.hero_id).displayName }}</span>
                    <span class="hero-role">{{ getHeroMeta(item.hero_id).role }}</span>
                  </div>
                </div>
              </td>
            </tr>
            <tr v-if="!displayedBanPick.length">
              <td colspan="4" class="empty-state">No ban / pick data found for this match</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </q-page>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useQuasar } from 'quasar'
import { useRoute, useRouter } from 'vue-router'
import { api } from 'boot/axios'
import heroesRaw from '../assets/heroes_UO.json'
import mapsRaw from '../assets/maps.json'

const $q = useQuasar()
const route = useRoute()
const router = useRouter()
const isViewMode = window.location.port
const loading = ref(false)
const rawMatch = ref(null)
const activeTab = ref('stats')
const selectedPlayerId = ref(null)

const matchUid = computed(() => route.params.match_uid)

const heroes = Array.isArray(heroesRaw) ? heroesRaw : []
const maps = Array.isArray(mapsRaw) ? mapsRaw : []
const heroMap = Object.fromEntries(
  heroes.map((hero) => [Number(hero.id), hero])
)
const mapMap = Object.fromEntries(
  maps.map((map) => [Number(map.id), map])
)

const dashboard = computed(() => {
  return convertMatchToDashboard(rawMatch.value)
})

const allPlayers = computed(() => [
  ...(dashboard.value.teams.team1.players || []),
  ...(dashboard.value.teams.team2.players || []),
])

const selectedPlayer = computed(() => {
  if (!selectedPlayerId.value) return null
  return allPlayers.value.find((player) => String(player.playerId) === String(selectedPlayerId.value)) || null
})

const displayedBanPick = computed(() => dashboard.value.draft || [])

const updatedTime = computed(() => rawMatch.value ? new Date().toLocaleTimeString() : '-')

function normalizeHeroName(name = '') {
  return String(name)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (s) => s.toUpperCase())
}

function toHeroFileName(name = '') {
  return String(name)
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w-]/g, '')
}

function getHeroImage(heroId, heroName) {
  let normalizedId = Number(heroId)
  if (heroId === 10571 || heroId === 10572 || heroId === 10573) normalizedId = 1057
  const imageHeroId = heroMap[Number(normalizedId)]?.id || normalizedId
  return `/imgs/heroes/${imageHeroId}_${toHeroFileName(heroName)}.png`
}


function getHeroRole(heroId) {
  let role = 'Unknown'
  if (heroId === 10571 || heroId === 10572 || heroId === 10573) {
    const hero = heroMap[Number(1057)]
    if (heroId === 10571) role = hero?.role?.[0]
    else if (heroId === 10572) role = hero?.role?.[1]
    else if (heroId === 10573) role = hero?.role?.[2]
  } else {
    const hero = heroMap[Number(heroId)]
    role = hero?.role || 'Unknown'
  }
  return `${role}`
}

function getHeroMeta(heroId) {
  let normalizedId = Number(heroId)
  if (heroId === 10571 || heroId === 10572 || heroId === 10573) normalizedId = 1057
  const name = normalizeHeroName(heroMap[Number(normalizedId)]?.name || `Hero ${normalizedId}`)

  return {
    id: heroId,
    displayName: name,
    image: getHeroImage(heroId, name),
    role: getHeroRole(heroId),
  }
}

function parseLeagueRoundInfo(match = {}) {
  const raw = match?.dynamic_fields?.league_round_info

  if (!raw) return null

  if (typeof raw === 'object') return raw

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function getTeamName(match, camp) {
  const league = parseLeagueRoundInfo(match)

  if (camp === 1) {
    return (
      league?.['1']?.club_team_name ||
      match?.live_snapshot?.data?.group_info?.['1']?.name ||
      'Team 1'
    )
  }

  return (
    league?.['2']?.club_team_name ||
    match?.live_snapshot?.data?.group_info?.['2']?.name ||
    'Team 2'
  )
}

function buildTeamSummary(players = []) {
  const total = players.reduce(
    (acc, player) => {
      acc.kills += Number(player.kills || 0)
      acc.deaths += Number(player.deaths || 0)
      acc.assists += Number(player.assists || 0)
      acc.damage += Number(player.damage || 0)
      acc.heal += Number(player.heal || 0)
      acc.hitRate += Number(player.hitRate || 0)
      return acc
    },
    {
      kills: 0,
      deaths: 0,
      assists: 0,
      damage: 0,
      heal: 0,
      hitRate: 0,
    },
  )

  return {
    ...total,
    avgHitRate: players.length ? total.hitRate / players.length : 0,
  }
}

function convertMatchToDashboard(match = {}) {
  if (!match) {
    return {
      meta: {
        matchUid: '',
        mapId: null,
        mapName: '-',
        mapMode: '-',
        fightTime: 0,
        scoreLeft: 0,
        scoreRight: 0,
      },
      teams: {
        team1: {
          name: 'Team 1',
          players: [],
          summary: buildTeamSummary([]),
        },
        team2: {
          name: 'Team 2',
          players: [],
          summary: buildTeamSummary([]),
        },
      },
      draft: [],
    }
  }

  const players = Array.isArray(match.match_players)
    ? match.match_players.map((player) => {
      const heroId = Number(player.cur_hero_id || 0)

      return {
        playerId: player.player_uid,
        playerName: player.nick_name || `Player ${player.player_uid}`,
        camp: Number(player.camp || 0),
        heroId,
        heroMeta: getHeroMeta(heroId),

        kills: Number(player.k || 0),
        deaths: Number(player.d || 0),
        assists: Number(player.a || 0),
        damage: Number(player.total_hero_damage || player.total_damage || 0),
        damageTaken: Number(player.total_hero_damage_taken || player.total_damage_taken || 0),
        heal: Number(player.total_hero_heal || player.total_heal || 0),
        hitRate: Number(player.session_hit_rate || player.raw?.session_hit_rate || 0),
        currEnergy: Number(player.dynamic_fields?.live_curr_energy || 0),
        maxEnergy: Number(player.dynamic_fields?.live_max_energy || 0),
        ultRatio: Number(player.dynamic_fields?.live_max_energy || 0) > 0 ? Number(player.dynamic_fields?.live_curr_energy || 0) / Number(player.dynamic_fields?.live_max_energy || 0) : 0,
        hp: Number(player.dynamic_fields?.live_hp || 0),
        soloKills: Number(player.solo_kill || player.dynamic_fields?.live_solo_kill || player.raw?.solo_kill || 0),
        lastKills: Number(player.last_kill || player.dynamic_fields?.live_last_kill || player.raw?.last_kill || 0),
        consecutiveKOs: Number(player["consecutive KOs"] || player.dynamic_fields?.live_consecutive_kos || 0),
        continueKillKDA: Number(player["continue_kill(KDA)"] || player.dynamic_fields?.live_continue_kill_kda || 0),
        abilities: Object.entries(
          player.dynamic_fields?.live_abilities_cooldown || {}
        ).map(([abilityId, value]) => ({
          id: abilityId,
          ...value,
        })),

        specialData: player.dynamic_fields?.live_special_data || {},

        isMVP: Number(match.mvp_uid) === Number(player.player_uid),
        isSVP: Number(match.svp_uid) === Number(player.player_uid),

        raw: player,
      }
    })
    : []

  const team1Players = players.filter((player) => player.camp === 1)
  const team2Players = players.filter((player) => player.camp === 2)

  const scoreInfo = match.dynamic_fields?.score_info || {}
  const draft = Array.isArray(match.dynamic_fields?.ban_pick_info)
    ? match.dynamic_fields?.ban_pick_info.map((item) => ({
      round_index: Number(item.round_idx ?? item.round_index ?? 0),
      operate_type: Number(item.is_pick ?? item.operate_type ?? 0),
      camp: Number(item.battle_side) === 0 ? 1 : Number(item.battle_side) === 1 ? 2 : Number(item.camp || 0),
      hero_id: Number(item.hero_id || 0),
    }))
    : []

  return {
    meta: {
      matchUid: match.match_uid,
      mapId: match.match_map_id,
      mapName: mapMap[Number(match.match_map_id)]?.name || `Map ${match.match_map_id || '-'}`,
      mapMode: mapMap[Number(match.match_map_id)]?.game_mode || `Map ${match.match_map_id || '-'}`,
      fightTime: Number(match.match_play_duration || 0),
      scoreLeft: Number(scoreInfo?.['1'] || 0),
      scoreRight: Number(scoreInfo?.['2'] || 0),
    },
    teams: {
      team1: {
        name: getTeamName(match, 1),
        players: team1Players,
        summary: buildTeamSummary(team1Players),
      },
      team2: {
        name: getTeamName(match, 2),
        players: team2Players,
        summary: buildTeamSummary(team2Players),
      },
    },
    draft,
  }
}

async function loadMatch() {
  if (!matchUid.value) return

  loading.value = true

  try {
    const response = await api.get(`/matches/${matchUid.value}`)

    rawMatch.value = response.data?.match || response.data || null

    const firstPlayer = convertMatchToDashboard(rawMatch.value).teams.team1.players[0]
      || convertMatchToDashboard(rawMatch.value).teams.team2.players[0]
    selectedPlayerId.value = firstPlayer?.playerId || null

    // console.log('Converted Match Data:', convertMatchToDashboard(rawMatch.value))
    // console.log('First Player:', firstPlayer)
    // console.log('Selected Player ID:', selectedPlayerId.value)
  } catch (err) {
    console.error('Failed to load match detail:', err)

    $q.notify({
      type: 'negative',
      message: 'Failed to load match detail',
    })
  } finally {
    loading.value = false
  }
}

async function sendToXpression() {
  try {
    await api.post('/xpression/stats', {
      match_uid: matchUid.value,
    })

    $q.notify({
      type: 'positive',
      message: 'Sent to Xpression',
    })
  } catch (err) {
    console.error('Send to Xpression failed:', err.response?.data || err)

    $q.notify({
      type: 'negative',
      message: err.response?.data?.detail || 'Failed to send to Xpression',
    })
  }
}

async function startLoop() {
  await api.post('/xpression/draft/loop/start', {
    match_uid: matchUid.value,
    interval: 20000,
  })
}

async function stopLoop() {
  await api.post('/xpression/draft/loop/stop')
}

async function resetLoop() {
  await api.post('/xpression/draft/loop/reset')
}
// function formatDuration(seconds) {
//   const total = Math.floor(Number(seconds || 0))
//   const min = Math.floor(total / 60)
//   const sec = total % 60

//   return `${min}:${String(sec).padStart(2, '0')}`
// }

function formatNumber(value) {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value || 0))
}

function formatPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`
}


function selectPlayer(player) {
  selectedPlayerId.value = player?.playerId || null
}

function rowClass(player, team) {
  return {
    'team1-row': team === 'team1',
    'team2-row': team === 'team2',
    'team1-mvp': player.isMVP && team === 'team1',
    'team2-mvp': player.isMVP && team === 'team2',
    'team1-svp': player.isSVP && team === 'team1',
    'team2-svp': player.isSVP && team === 'team2',
  }
}

function formatSeconds(value) {
  const total = Math.max(0, Math.floor(Number(value || 0)))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function formatCompact(value) {
  return formatNumber(value)
}

function formatPct(value) {
  return formatPercent(value)
}

onMounted(() => {
  loadMatch()
})
</script>

<style scoped>
.match-detail-page.dark {
  background: #0b0f14;
  color: #e5e7eb;
  padding: 20px;
  min-height: 100vh;
}

.action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.page-eyebrow {
  color: #94a3b8;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.page-id {
  color: #e5e7eb;
  font-size: 14px;
  margin-top: 2px;
}

.action-buttons {
  display: flex;
  gap: 8px;
  align-items: center;
}

.top-header {
  display: grid;
  grid-template-columns: 110px 1fr 110px;
  gap: 14px;
  align-items: stretch;
  margin-bottom: 14px;
}

.summary-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 14px;
}

.main-board {
  padding: 14px;
}

.summary-box,
.main-board,
.table-wrap,
.selected-player-panel,
.banpick-wrap {
  background: #131618;
  border: 1px solid #1e293b;
  border-radius: 16px;
}

.score-box {
  display: grid;
  place-items: center;
  font-size: 48px;
  font-weight: 800;
  min-height: 120px;
  border-radius: 16px;
}

.team1-box {
  background: linear-gradient(180deg, #172554, #0f172a);
  color: #bfdbfe;
}

.team2-box {
  background: linear-gradient(180deg, #4c0519, #0f172a);
  color: #fecdd3;
}

.header-center h1 {
  margin: 0 0 12px;
  text-align: center;
  font-size: 42px;
  line-height: 1.1;
}

.match-info-bar {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px 18px;
  padding: 10px 40px;
}

.match-info-bar strong {
  margin-right: 6px;
  color: #94a3b8;
}

.matchup-row {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 16px;
  margin-top: 8px;
  padding: 12px;
}

.matchup-team {
  font-size: 18px;
  font-weight: 800;
}

.team1-name {
  color: #bfdbfe;
  text-align: left;
}

.team2-name {
  color: #fecdd3;
  text-align: right;
}

.matchup-score {
  font-size: 28px;
  font-weight: 900;
  color: #ffffff;
}

.summary-box {
  padding: 14px 16px;
}

.summary-title {
  text-align: center;
  font-size: 20px;
  font-weight: 800;
  margin-bottom: 8px;
}

.summary-values {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px 16px;
}

.tabs-row {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
}

.tab-btn {
  background: #1f2937;
  color: #e5e7eb;
  border: 1px solid #334155;
  padding: 10px 14px;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 700;
}

.tab-btn.active {
  background: #334155;
  color: white;
}

.table-title-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 10px;
}

.table-title {
  text-align: center;
  padding: 10px;
  font-size: 18px;
  font-weight: 800;
  background: #111827;
  border-radius: 12px;
}

.team-table-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.table-wrap {
  overflow: hidden;
}

.scroll-x {
  max-height: 500px;
  overflow-y: auto;
  overflow-x: auto;
}

.team-table,
.banpick-table {
  width: 100%;
  color: #e5e7eb;
  border-collapse: separate;
  border-spacing: 0;
}

.team-table thead th,
.banpick-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 10px 12px;
  font-size: 12px;
  letter-spacing: 0.03em;
  text-align: left;
}

.team-table tbody td,
.banpick-table tbody td {
  padding: 10px 12px;
  border-top: 1px solid rgba(148, 163, 184, 0.12);
  vertical-align: middle;
}

.team-table {
  min-width: 760px;
}

.team1-table thead th {
  background: #172554;
  color: #bfdbfe;
}

.team2-table thead th {
  background: #4c0519;
  color: #fecdd3;
}

.banpick-table thead th {
  background: #1f2937;
  color: #e5e7eb;
}

.team1-row {
  background: rgba(37, 99, 235, 0.1);
}

.team2-row {
  background: rgba(220, 38, 38, 0.1);
}

.team1-row:nth-child(even) {
  background: rgba(37, 99, 235, 0.14);
}

.team2-row:nth-child(even) {
  background: rgba(220, 38, 38, 0.14);
}

.team-table tbody tr:hover,
.banpick-table tbody tr:hover {
  filter: brightness(1.08);
  cursor: pointer;
}

.team1-mvp {
  background: linear-gradient(90deg, rgba(59, 130, 246, 0.3), rgba(37, 99, 235, 0.18));
  box-shadow: inset 4px 0 0 #60a5fa, 0 0 14px rgba(96, 165, 250, 0.28);
}

.team2-mvp {
  background: linear-gradient(90deg, rgba(239, 68, 68, 0.3), rgba(185, 28, 28, 0.18));
  box-shadow: inset 4px 0 0 #f87171, 0 0 14px rgba(248, 113, 113, 0.24);
}

.team1-svp {
  background: linear-gradient(90deg, rgba(59, 130, 246, 0.18), rgba(37, 99, 235, 0.1));
  box-shadow: inset 3px 0 0 rgba(147, 197, 253, 0.85);
}

.team2-svp {
  background: linear-gradient(90deg, rgba(239, 68, 68, 0.18), rgba(185, 28, 28, 0.1));
  box-shadow: inset 3px 0 0 rgba(252, 165, 165, 0.85);
}

.name-stack {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.badge {
  width: fit-content;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.badge.mvp {
  background: rgba(255, 255, 255, 0.16);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.18);
}

.badge.svp {
  background: rgba(255, 255, 255, 0.1);
  color: #e5e7eb;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.hero-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 160px;
}

.hero-cell-large {
  margin-bottom: 14px;
}

.hero-thumb {
  width: 50px;
  height: 50px;
  border-radius: 10px;
  object-fit: cover;
  flex-shrink: 0;
  background: #0f172a;
  border: 1px solid #334155;
}

.hero-thumb-large {
  width: 56px;
  height: 56px;
}

.hero-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.hero-name {
  font-weight: 700;
  color: #e5e7eb;
  line-height: 1.2;
}

.hero-role {
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.1;
}

.selected-player-panel {
  margin-top: 14px;
  padding: 16px;
}

.selected-player-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.selected-player-header h2 {
  margin: 0;
}

.selected-player-header span {
  color: #94a3b8;
}

.player-detail .grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}

.player-detail .grid>div {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 10px;
  display: grid;
  gap: 4px;
}

.player-detail .grid strong {
  font-size: 12px;
  color: #94a3b8;
}

.player-detail .grid span {
  font-size: 14px;
  color: #e5e7eb;
}

.selected-hero-header {
  margin-bottom: 14px;
}

.empty-state {
  color: #94a3b8;
  padding: 12px;
}

.banpick-wrap {
  padding: 14px;
}

@media (max-width: 1100px) {
  .player-detail .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {

  .top-header,
  .summary-row,
  .table-title-row,
  .team-table-grid {
    grid-template-columns: 1fr;
  }

  .header-center h1 {
    font-size: 32px;
  }

  .matchup-row {
    grid-template-columns: 1fr;
    text-align: center;
  }

  .team1-name,
  .team2-name {
    text-align: center;
  }
}

@media (max-width: 700px) {
  .match-detail-page.dark {
    padding: 12px;
  }

  .action-bar {
    align-items: flex-start;
    flex-direction: column;
  }

  .player-detail .grid {
    grid-template-columns: 1fr;
  }

  .hero-cell {
    min-width: 0;
  }
}
</style>
