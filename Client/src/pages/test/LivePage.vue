<template>
  <q-page class="live-page q-pa-md bg-dark text-white">
    <div class="page-header q-mb-md">
      <div>
        <div class="page-title">Marvel Rivals Live</div>
        <div class="text-caption text-grey-5">
          Room ID: {{ roomId }} · Updated: {{ updatedTime }}
        </div>
      </div>

      <div class="header-actions">
        <q-btn dense unelevated color="primary" icon="refresh" label="Refresh" :loading="loading" @click="loadBattle" />
        <q-btn dense unelevated :color="isPolling ? 'negative' : 'positive'"
          :label="isPolling ? 'Stop Polling' : 'Start Polling'" @click="isPolling ? stopPolling() : startPolling()" />
      </div>
    </div>

    <div class="top-bar q-mb-md">
      <div class="score-box team1">
        {{ dashboard.meta.scoreLeft }}
      </div>

      <div class="match-center">
        <div class="map-name">{{ dashboard.meta.mapName }}</div>
        <div class="match-sub">
          Round {{ dashboard.meta.roundIndex }} · {{ formatSeconds(dashboard.meta.fightTime) }}
        </div>

        <div class="objective-block q-mt-md">
          <div class="objective-top">
            <span class="objective-label">Objective</span>
            <span class="objective-status">{{ dashboard.objective.label }}</span>
            <span class="objective-percent">{{ dashboard.objective.percent.toFixed(1) }}%</span>
          </div>

          <div class="objective-track">
            <div class="objective-fill" :class="objectiveBarClass"
              :style="{ width: `${dashboard.objective.percent}%` }" />
          </div>

          <div class="objective-bottom">
            <span>Camp 1: {{ dashboard.objective.team1OnPoint }}</span>
            <span>Camp 2: {{ dashboard.objective.team2OnPoint }}</span>
          </div>
        </div>
      </div>

      <div class="score-box team2">
        {{ dashboard.meta.scoreRight }}
      </div>
    </div>

    <div class="summary-row q-mb-md">
      <div class="summary-card team1-card">
        <div class="summary-title">Team 1 Summary</div>
        <div>Total KOs ⚔️ : {{ dashboard.teams.team1.summary.kills || 0 }}</div>
        <div>Total Damage 💥 : {{ formatCompact(dashboard.teams.team1.summary.damage) }}</div>
        <div>Total Heal 💚 : {{ formatCompact(dashboard.teams.team1.summary.heal) }}</div>
        <div>Avg Hit % 🎯 : {{ formatPct(dashboard.teams.team1.summary.avgHitRate) }}</div>
      </div>

      <div class="summary-card team2-card">
        <div class="summary-title">Team 2 Summary</div>
        <div>Total KOs ⚔️ : {{ dashboard.teams.team2.summary.kills || 0 }}</div>
        <div>Total Damage 💥 : {{ formatCompact(dashboard.teams.team2.summary.damage) }}</div>
        <div>Total Heal 💚 : {{ formatCompact(dashboard.teams.team2.summary.heal) }}</div>
        <div>Avg Hit % 🎯 : {{ formatPct(dashboard.teams.team2.summary.avgHitRate) }}</div>
      </div>
    </div>

    <div class="team-grid">
      <div class="team-panel">
        <div class="team-panel-title">Team 1</div>

        <q-table flat dense hide-bottom :rows="dashboard.teams.team1.players" :columns="playerColumns"
          row-key="playerId" class="team-table team1-table" :pagination="{ rowsPerPage: 0 }"
          @row-click="(_, row) => selectPlayer(row)">
          <template #body="p">
            <q-tr :props="p" :class="playerRowClass(p.row, 'team1')" class="clickable-row">
              <q-td key="player" :props="p">
                <div class="player-name-stack">
                  <span>{{ p.row.playerName }}</span>
                  <span v-if="p.row.isMVP" class="player-badge mvp">MVP</span>
                  <span v-else-if="p.row.isSVP" class="player-badge svp">SVP</span>
                </div>
              </q-td>

              <q-td key="hero" :props="p">
                <div class="hero-cell">
                  <div class="hero-thumb-wrap">
                    <img :src="p.row.heroMeta?.image || '/imgs/heroes/0_unknown.png'"
                      :alt="p.row.heroMeta?.displayName || `Hero ${p.row.heroId}`" class="hero-thumb"
                      @error="e => (e.target.src = '/imgs/heroes/0_unknown.png')" />
                  </div>
                  <div class="hero-text">
                    <span class="hero-name">
                      {{ p.row.heroMeta?.displayName || `Hero ${p.row.heroId}` }}
                    </span>
                    <span class="hero-id">ID {{ p.row.heroId }}</span>
                  </div>
                </div>
              </q-td>

              <q-td key="k" :props="p">{{ p.row.kills }}</q-td>
              <q-td key="d" :props="p">{{ p.row.deaths }}</q-td>
              <q-td key="a" :props="p">{{ p.row.assists }}</q-td>
              <q-td key="dmg" :props="p">{{ formatCompact(p.row.damage) }}</q-td>
              <q-td key="heal" :props="p">{{ formatCompact(p.row.heal) }}</q-td>
              <q-td key="hit" :props="p">{{ formatPct(p.row.hitRate) }}</q-td>
              <q-td key="ult" :props="p">
                <q-badge :color="p.row.ultRatio >= 0.9 ? 'positive' : 'grey-7'"
                  :label="p.row.ultRatio >= 0.9 ? 'READY' : 'NOT READY'" />
              </q-td>
            </q-tr>
          </template>
        </q-table>
      </div>

      <div class="team-panel">
        <div class="team-panel-title">Team 2</div>

        <q-table flat dense hide-bottom :rows="dashboard.teams.team2.players" :columns="playerColumns"
          row-key="playerId" class="team-table team2-table" :pagination="{ rowsPerPage: 0 }"
          @row-click="(_, row) => selectPlayer(row)">
          <template #body="p">
            <q-tr :props="p" :class="playerRowClass(p.row, 'team2')" class="clickable-row">
              <q-td key="player" :props="p">
                <div class="player-name-stack">
                  <span>{{ p.row.playerName }}</span>
                  <span v-if="p.row.isMVP" class="player-badge mvp">MVP</span>
                  <span v-else-if="p.row.isSVP" class="player-badge svp">SVP</span>
                </div>
              </q-td>

              <q-td key="hero" :props="p">
                <div class="hero-cell">
                  <div class="hero-thumb-wrap">
                    <img :src="p.row.heroMeta?.image || '/imgs/heroes/0_unknown.png'"
                      :alt="p.row.heroMeta?.displayName || `Hero ${p.row.heroId}`" class="hero-thumb"
                      @error="e => (e.target.src = '/imgs/heroes/0_unknown.png')" />
                  </div>
                  <div class="hero-text">
                    <span class="hero-name">
                      {{ p.row.heroMeta?.displayName || `Hero ${p.row.heroId}` }}
                    </span>
                    <span class="hero-id">ID {{ p.row.heroId }}</span>
                  </div>
                </div>
              </q-td>

              <q-td key="k" :props="p">{{ p.row.kills }}</q-td>
              <q-td key="d" :props="p">{{ p.row.deaths }}</q-td>
              <q-td key="a" :props="p">{{ p.row.assists }}</q-td>
              <q-td key="dmg" :props="p">{{ formatCompact(p.row.damage) }}</q-td>
              <q-td key="heal" :props="p">{{ formatCompact(p.row.heal) }}</q-td>
              <q-td key="hit" :props="p">{{ formatPct(p.row.hitRate) }}</q-td>
              <q-td key="ult" :props="p">
                <q-badge :color="p.row.ultRatio >= 0.9 ? 'positive' : 'grey-7'"
                  :label="p.row.ultRatio >= 0.9 ? 'READY' : 'NOT READY'" />
              </q-td>
            </q-tr>
          </template>
        </q-table>
      </div>
    </div>

    <div class="selected-panel q-mt-md" v-if="selectedPlayer">
      <div class="selected-header">
        <div>
          <div class="selected-title">Selected Player</div>
          <div class="selected-name">{{ selectedPlayer.playerName }}</div>
        </div>

        <q-btn dense flat color="grey-5" icon="close" @click="selectedPlayerId = null" />
      </div>

      <div class="selected-grid q-mt-md">
        <div>
          <strong>Hero</strong>
          <span>{{ selectedPlayer.heroMeta?.displayName || `Hero ${selectedPlayer.heroId}` }}</span>
        </div>
        <div>
          <strong>K/C/A</strong>
          <span>{{ selectedPlayer.kills }}/{{ selectedPlayer.deaths }}/{{ selectedPlayer.assists }}</span>
        </div>
        <div>
          <strong>Damage</strong>
          <span>{{ formatCompact(selectedPlayer.damage) }}</span>
        </div>
        <div>
          <strong>Heal</strong>
          <span>{{ formatCompact(selectedPlayer.heal) }}</span>
        </div>
        <div>
          <strong>Hit %</strong>
          <span>{{ formatPct(selectedPlayer.hitRate) }}</span>
        </div>
        <div>
          <strong>Ult</strong>
          <span>{{ Math.round((selectedPlayer.ultRatio || 0) * 100) }}%</span>
        </div>
      </div>

      <div class="abilities-list q-mt-md">
        <div v-for="ability in selectedPlayer.abilities || []" :key="ability.id" class="ability-item">
          <strong>
            {{ ability.id }}
            <template v-if="ability.name"> - {{ ability.name }}</template>
          </strong>
          <span>CD: {{ Number(ability.cooldown || 0).toFixed(2) }}</span>
          <span>
            Energy:
            {{ Math.round(Number(ability.energy || 0)) }}/{{ Math.round(Number(ability.energy_max || 0)) }}
          </span>
        </div>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api } from 'boot/axios'

const route = useRoute()

const roomId = computed(() => route.params.roomId)

const loading = ref(false)
const isPolling = ref(false)
const selectedPlayerId = ref(null)
const pollTimer = ref(null)

const emptyDashboard = () => ({
  meta: {
    mapId: null,
    mapName: '-',
    roundIndex: 0,
    fightTime: 0,
    scoreLeft: 0,
    scoreRight: 0,
  },
  objective: {
    owner: 0,
    percent: 0,
    team1OnPoint: 0,
    team2OnPoint: 0,
    contested: false,
    label: 'NEUTRAL',
  },
  teams: {
    team1: {
      camp: 1,
      players: [],
      summary: {
        kills: 0,
        deaths: 0,
        assists: 0,
        damage: 0,
        heal: 0,
        avgHitRate: 0,
      },
    },
    team2: {
      camp: 2,
      players: [],
      summary: {
        kills: 0,
        deaths: 0,
        assists: 0,
        damage: 0,
        heal: 0,
        avgHitRate: 0,
      },
    },
  },
  draft: [],
  mvps: {
    mvpPlayerId: null,
    svpPlayerId: null,
  },
  updatedAt: null,
})

const dashboard = ref(emptyDashboard())

const playerColumns = [
  { name: 'player', label: 'Player', field: 'playerName', align: 'left' },
  { name: 'hero', label: 'Hero', field: 'heroId', align: 'left' },
  { name: 'k', label: 'K', field: 'kills', align: 'center' },
  { name: 'd', label: 'C', field: 'deaths', align: 'center' },
  { name: 'a', label: 'A', field: 'assists', align: 'center' },
  { name: 'dmg', label: 'DMG', field: 'damage', align: 'center' },
  { name: 'heal', label: 'Heal', field: 'heal', align: 'center' },
  { name: 'hit', label: 'Hit ◈', field: 'hitRate', align: 'center' },
  { name: 'ult', label: 'Ult', field: 'ultRatio', align: 'center' },
]

const allPlayers = computed(() => [
  ...(dashboard.value.teams.team1.players || []),
  ...(dashboard.value.teams.team2.players || []),
])

const selectedPlayer = computed(() => {
  if (!selectedPlayerId.value) return null

  return allPlayers.value.find(
    player => String(player.playerId) === String(selectedPlayerId.value)
  ) || null
})

const objectiveBarClass = computed(() => {
  const objective = dashboard.value.objective

  if (objective.contested) return 'contested'
  if (objective.owner === 1) return 'team1'
  if (objective.owner === 2) return 'team2'
  return 'neutral'
})

const updatedTime = computed(() => {
  if (!dashboard.value.updatedAt) return '-'
  return new Date(dashboard.value.updatedAt).toLocaleTimeString()
})

async function loadBattle() {
  if (!roomId.value) return

  try {
    loading.value = true

    const response = await api.get(`/live/battle/${roomId.value}`)
    dashboard.value = {
      ...emptyDashboard(),
      ...response.data,
      teams: {
        team1: {
          ...emptyDashboard().teams.team1,
          ...(response.data?.teams?.team1 || {}),
        },
        team2: {
          ...emptyDashboard().teams.team2,
          ...(response.data?.teams?.team2 || {}),
        },
      },
      objective: {
        ...emptyDashboard().objective,
        ...(response.data?.objective || {}),
      },
      meta: {
        ...emptyDashboard().meta,
        ...(response.data?.meta || {}),
      },
    }

    if (!selectedPlayerId.value) {
      const firstPlayer = allPlayers.value[0]
      selectedPlayerId.value = firstPlayer?.playerId || null
    }
  } catch (err) {
    console.error('Failed to load live battle:', err)
  } finally {
    loading.value = false
  }
}

function startPolling() {
  stopPolling()
  isPolling.value = true
  loadBattle()
  pollTimer.value = setInterval(loadBattle, 500)
}

function stopPolling() {
  if (pollTimer.value) {
    clearInterval(pollTimer.value)
    pollTimer.value = null
  }

  isPolling.value = false
}

function selectPlayer(player) {
  selectedPlayerId.value = player?.playerId || null
}

function playerRowClass(player, team) {
  return {
    'team1-mvp': player.isMVP && team === 'team1',
    'team2-mvp': player.isMVP && team === 'team2',
    'team1-svp': player.isSVP && team === 'team1',
    'team2-svp': player.isSVP && team === 'team2',
  }
}

function formatCompact(value) {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value || 0))
}

function formatPct(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`
}

function formatSeconds(value) {
  const total = Math.max(0, Math.floor(Number(value || 0)))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

watch(
  () => route.params.roomId,
  () => {
    selectedPlayerId.value = null
    dashboard.value = emptyDashboard()
    startPolling()
  }
)

onMounted(() => {
  startPolling()
})

onBeforeUnmount(() => {
  stopPolling()
})
</script>

<style scoped>
.live-page {
  min-height: 100vh;
  background: #121212;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.page-title {
  font-size: 32px;
  font-weight: 700;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.top-bar {
  display: grid;
  grid-template-columns: 120px 1fr 120px;
  gap: 16px;
  align-items: stretch;
}

.score-box {
  display: grid;
  place-items: center;
  font-size: 42px;
  font-weight: 800;
  border-radius: 16px;
  background: #1b1b1f;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.score-box.team1 {
  color: #dbeafe;
}

.score-box.team2 {
  color: #fee2e2;
}

.match-center {
  background: #1b1b1f;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  padding: 16px;
}

.map-name {
  font-size: 28px;
  font-weight: 700;
  text-align: center;
}

.match-sub {
  text-align: center;
  color: #94a3b8;
}

.objective-block {
  display: grid;
  gap: 8px;
}

.objective-top {
  display: flex;
  align-items: center;
  gap: 10px;
}

.objective-label {
  color: #94a3b8;
  font-weight: 700;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.objective-status {
  font-weight: 800;
}

.objective-percent {
  margin-left: auto;
  font-weight: 800;
}

.objective-track {
  width: 100%;
  height: 12px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(148, 163, 184, 0.18);
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.objective-fill {
  height: 100%;
  transition: width 0.2s ease, background 0.2s ease;
}

.objective-fill.team1 {
  background: linear-gradient(90deg, #2563eb, #60a5fa);
}

.objective-fill.team2 {
  background: linear-gradient(90deg, #dc2626, #f87171);
}

.objective-fill.neutral {
  background: linear-gradient(90deg, #64748b, #94a3b8);
}

.objective-fill.contested {
  background: linear-gradient(90deg, #f59e0b, #fde047);
}

.objective-bottom {
  display: flex;
  justify-content: space-between;
  color: #94a3b8;
  font-size: 12px;
}

.summary-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.summary-card,
.team-panel,
.selected-panel {
  background: #1b1b1f;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  padding: 16px;
}

.summary-title,
.team-panel-title,
.selected-title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 8px;
}

.team1-card {
  box-shadow: inset 4px 0 0 rgba(96, 165, 250, 0.8);
}

.team2-card {
  box-shadow: inset 4px 0 0 rgba(248, 113, 113, 0.8);
}

.team-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.team-table {
  background: transparent;
  border-radius: 18px;
  overflow: hidden;
}

.team-table :deep(thead tr th) {
  font-size: 12px;
  font-weight: 700;
  color: #e5e7eb;
  border: none;
  padding: 10px 12px;
}

.team-table :deep(tbody tr td) {
  border: none;
  padding: 10px 12px;
  color: #e5e7eb;
}

.team1-table :deep(thead tr th) {
  background: #172554;
  color: #dbeafe;
}

.team2-table :deep(thead tr th) {
  background: #7f1d1d;
  color: #fee2e2;
}

.team1-table :deep(tbody tr:nth-child(odd)) {
  background: rgba(30, 58, 138, 0.26);
}

.team1-table :deep(tbody tr:nth-child(even)) {
  background: rgba(30, 41, 59, 0.7);
}

.team2-table :deep(tbody tr:nth-child(odd)) {
  background: rgba(127, 29, 29, 0.28);
}

.team2-table :deep(tbody tr:nth-child(even)) {
  background: rgba(30, 20, 20, 0.72);
}

.team-table :deep(tbody tr:hover) {
  filter: brightness(1.08);
}

.clickable-row {
  cursor: pointer;
}

.team1-table :deep(tbody tr.team1-mvp) {
  background: linear-gradient(90deg, rgba(59, 130, 246, 0.34), rgba(37, 99, 235, 0.18)) !important;
  box-shadow: inset 4px 0 0 #60a5fa;
}

.team2-table :deep(tbody tr.team2-mvp) {
  background: linear-gradient(90deg, rgba(239, 68, 68, 0.34), rgba(185, 28, 28, 0.18)) !important;
  box-shadow: inset 4px 0 0 #f87171;
}

.team1-table :deep(tbody tr.team1-svp) {
  background: linear-gradient(90deg, rgba(59, 130, 246, 0.18), rgba(37, 99, 235, 0.10)) !important;
  box-shadow: inset 3px 0 0 rgba(147, 197, 253, 0.85);
}

.team2-table :deep(tbody tr.team2-svp) {
  background: linear-gradient(90deg, rgba(239, 68, 68, 0.18), rgba(185, 28, 28, 0.10)) !important;
  box-shadow: inset 3px 0 0 rgba(252, 165, 165, 0.85);
}

.hero-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 190px;
}

.hero-thumb-wrap {
  width: 50px;
  height: 50px;
  border-radius: 12px;
  overflow: hidden;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.12);
  flex-shrink: 0;
}

.hero-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scale(1.15) translateY(-6%);
}

.hero-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.hero-name {
  font-weight: 700;
  line-height: 1.2;
}

.hero-id {
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.1;
}

.player-name-stack {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.player-badge {
  width: fit-content;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.player-badge.mvp {
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.18);
}

.player-badge.svp {
  background: rgba(255, 255, 255, 0.10);
  color: #e5e7eb;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.selected-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.selected-name {
  font-size: 18px;
  font-weight: 700;
  color: #e5e7eb;
}

.selected-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.selected-grid>div,
.ability-item {
  background: #111827;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 10px;
  display: grid;
  gap: 4px;
}

.selected-grid strong,
.ability-item strong {
  color: #94a3b8;
  font-size: 12px;
}

.abilities-list {
  display: grid;
  gap: 10px;
}

@media (max-width: 1000px) {

  .page-header,
  .top-bar,
  .summary-row,
  .team-grid {
    grid-template-columns: 1fr;
  }

  .page-header {
    align-items: stretch;
  }

  .header-actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .selected-grid {
    grid-template-columns: 1fr;
  }
}
</style>
